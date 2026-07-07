/*
 * routes/demo.js — API publique de la landing (sans compte).
 *
 *   GET  /api/demo/veille    → board de veille des deux profils démo
 *   POST /api/demo/generate  → vraie génération actu avec identité preset
 *   POST /api/demo/track     → funnel analytics de la landing
 *   GET  /api/demo/examples  → exemples réels par format (si présents sur disque)
 *
 * Garde-fous de /generate :
 *   1. Pas de texte libre — uniquement une actu du board (news_id ∈ demo_veille)
 *   2. Rate limit — 2 générations réelles / 24h par visiteur (cookie + hash IP)
 *   3. Watermark "Généré avec Forje Studio" composité côté serveur
 *   4. Kill-switch global — DEMO_DAILY_LIMIT générations réelles / 24h (déf. 300)
 * Cache : même actu + même preset dans les 6h → payload servi instantanément.
 */
const express = require('express');
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');

const { supabase }        = require('../lib/supabase');
const { runActuPipeline } = require('./generate');

const router = express.Router();

// ─── Profils démo ─────────────────────────────────────────────────────────────
// compteId → profil de veille (table comptes, seedé par migration).
// clientId → identité de marque RÉELLE (table clients) : la démo utilise le
// vrai compte du média, exactement comme s'il générait depuis l'app.
const DEMO_PROFILES = {
  ballon_bleu: {
    compteId: 'a0000000-0000-4000-8000-000000000001',
    clientId: '52abba92-0e16-43d2-adac-a373b3ee829d',
    topic: 'football',
    placeholder: 'Mbappé forfait pour le Clásico, blessure à l\'entraînement ce matin…',
  },
  frame: {
    compteId: 'a0000000-0000-4000-8000-000000000002',
    clientId: 'bf611af2-5ec3-4839-a36d-28f0b9d64b24',
    topic: 'culture & entertainment',
    placeholder: 'Netflix annonce une série adaptée de Zelda avec Nintendo…',
  },
};

// Identités clients : mêmes colonnes que getClientBrand (routes/generate.js),
// cache mémoire 60s — une modif du compte dans l'app se reflète vite ici.
const _clientCache = new Map();
async function loadDemoClient(key) {
  const p = DEMO_PROFILES[key];
  if (!p) return null;
  const hit = _clientCache.get(key);
  if (hit && Date.now() - hit.at < 60000) return hit.client;
  const { data, error } = await supabase.from('clients').select(
    'id,name,instagram_handle,logo_url,avatar_url,brand_colors,font_primary,font_body,font_id,font_set,font_custom_url,font_is_custom,mood,graphic_style,tone_tags,topics,preferred_format,style_ref_url'
  ).eq('id', p.clientId).maybeSingle();
  if (error) console.error('[Demo/client]', key, error.message);
  if (data) { _clientCache.set(key, { at: Date.now(), client: data }); return data; }
  return hit ? hit.client : null;
}

const DAILY_LIMIT      = parseInt(process.env.DEMO_DAILY_LIMIT || '300', 10);
const VISITOR_LIMIT    = 2;                      // générations réelles / visiteur / 24h
const CACHE_TTL_MS     = 6 * 60 * 60 * 1000;     // 6h
const WATERMARK_TEXT   = 'Généré avec Forje Studio';
const IP_SALT          = process.env.DEMO_IP_SALT || 'forje-demo-2026';

// ─── Identité visiteur : cookie + hash IP ────────────────────────────────────
function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';
}
function hashIp(ip) {
  return crypto.createHash('sha256').update(IP_SALT + ip).digest('hex').slice(0, 32);
}
function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
// Récupère (ou crée) l'id visiteur — cookie 180 jours
function ensureVisitor(req, res) {
  let id = readCookie(req, 'forje_demo_id');
  if (!id || !/^[a-f0-9-]{20,40}$/.test(id)) {
    id = crypto.randomUUID();
    res.setHeader('Set-Cookie',
      `forje_demo_id=${id}; Path=/; Max-Age=${180 * 24 * 3600}; SameSite=Lax; HttpOnly`);
  }
  return id;
}

// ─── GET /api/demo/veille ─────────────────────────────────────────────────────
// Cache mémoire 20s : le board est pollé toutes les 30s par chaque visiteur.
let _veilleCache = { at: 0, payload: null };

router.get('/veille', async (_req, res) => {
  try {
    if (_veilleCache.payload && Date.now() - _veilleCache.at < 20000) {
      return res.json(_veilleCache.payload);
    }
    const { data, error } = await supabase
      .from('demo_veille')
      .select('id, profile_key, titre, source, url, score, published_at')
      .order('published_at', { ascending: false });
    if (error) throw error;

    const profiles = await Promise.all(Object.entries(DEMO_PROFILES).map(async ([key, p]) => {
      const client = await loadDemoClient(key);
      return {
        key,
        name: client?.name || key,
        topic: p.topic,
        items: (data || [])
          .filter(r => r.profile_key === key)
          .slice(0, 8)
          .map(r => ({
            id: r.id, title: r.titre, source: r.source,
            score: r.score, published_at: r.published_at,
          })),
      };
    }));

    const payload = { profiles };
    _veilleCache = { at: Date.now(), payload };
    res.json(payload);
  } catch (e) {
    console.error('[Demo/veille]', e.message);
    res.status(500).json({ error: 'Board indisponible' });
  }
});

// ─── POST /api/demo/generate ──────────────────────────────────────────────────
// Deux entrées possibles : une actu du board (news_id, cacheable) ou un prompt
// libre court (l'utilisateur teste l'outil comme dans l'app).
router.post('/generate', async (req, res) => {
  const { preset, news_id, prompt } = req.body || {};
  const profile = DEMO_PROFILES[preset];

  if (!profile) return res.status(400).json({ error: 'preset inconnu' });

  let news = null;
  let promptText = null;
  if (news_id) {
    if (!/^[a-f0-9-]{36}$/.test(String(news_id))) {
      return res.status(400).json({ error: 'news_id invalide' });
    }
  } else {
    promptText = String(prompt || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
    if (promptText.length < 10) {
      return res.status(400).json({ error: 'Écris au moins une phrase — une actu, une déclaration, une idée de post.' });
    }
    if (promptText.length > 300) promptText = promptText.slice(0, 300);
  }

  const visitorId = ensureVisitor(req, res);
  const ipHash    = hashIp(getIp(req));

  try {
    // Identité réelle du média démo (table clients) — jamais débitée :
    // la démo n'appelle pas chargeCredits, le quota visiteur fait office de crédit.
    const client = await loadDemoClient(preset);
    if (!client) {
      return res.status(503).json({ error: 'daily_limit', message: 'La démo est indisponible — crée ton compte pour générer.' });
    }
    // Empreinte de l'identité : un cache généré avec une ancienne charte est ignoré
    const identity = crypto.createHash('sha1').update(JSON.stringify([
      client.logo_url, client.brand_colors, client.font_id, client.font_primary,
      client.font_custom_url, client.mood, client.graphic_style,
    ])).digest('hex').slice(0, 12);

    if (news_id) {
      const { data } = await supabase
        .from('demo_veille')
        .select('id, titre, description')
        .eq('id', news_id)
        .eq('profile_key', preset)
        .maybeSingle();
      news = data;
      if (!news) return res.status(404).json({ error: 'Cette actu n\'est plus sur le board — choisis-en une autre.' });
    }

    // Cache 6h : même actu + même preset + même identité → servi instantanément
    // (uniquement pour les actus du board — un prompt libre n'est jamais identique)
    if (news_id) {
      const { data: cached } = await supabase
        .from('demo_cache')
        .select('payload, created_at')
        .eq('preset', preset)
        .eq('news_id', news_id)
        .maybeSingle();
      if (cached
          && cached.payload?.identity === identity
          && Date.now() - new Date(cached.created_at).getTime() < CACHE_TTL_MS) {
        supabase.from('demo_generations').insert({
          ip_hash: ipHash, visitor_id: visitorId, preset, news_id, cached: true,
        }).then(() => {}, () => {});
        return res.json({ ...cached.payload, cached: true, remaining: await remainingFor(ipHash, visitorId) });
      }
    }

    // Garde-fou 2 : 2 générations réelles / 24h par visiteur (IP OU cookie)
    const remaining = await remainingFor(ipHash, visitorId);
    if (remaining <= 0) {
      return res.status(429).json({
        error: 'rate_limited',
        message: 'Tu as utilisé tes 2 essais démo. Crée ton compte — 50 crédits offerts.',
      });
    }

    // Garde-fou 4 : kill-switch budget global (24h glissantes)
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: dailyCount } = await supabase
      .from('demo_generations')
      .select('id', { count: 'exact', head: true })
      .eq('cached', false)
      .gte('created_at', since24h);
    if ((dailyCount || 0) >= DAILY_LIMIT) {
      return res.status(503).json({
        error: 'daily_limit',
        message: 'Forte affluence sur la démo — crée ton compte pour générer en illimité.',
      });
    }

    // Débit du quota AVANT la génération (même logique que les crédits) ;
    // supprimé si le pipeline échoue.
    const { data: genRow, error: genErr } = await supabase
      .from('demo_generations')
      .insert({ ip_hash: ipHash, visitor_id: visitorId, preset, news_id: news_id || null, cached: false })
      .select('id')
      .single();
    if (genErr) throw genErr;

    let payload;
    try {
      const newsText = news
        ? news.titre + (news.description ? ' — ' + news.description : '')
        : promptText;
      // Même workflow que l'app : imageMode 'ai' (visuel GPT guidé par les
      // photos Serper, fallback photo si échec) + watermark démo (garde-fou 3).
      payload = await runActuPipeline(client, {
        newsText: newsText.slice(0, 600),
        imageMode: 'ai',
        watermark: WATERMARK_TEXT,
      });
    } catch (pipeErr) {
      await supabase.from('demo_generations').delete().eq('id', genRow.id);
      throw pipeErr;
    }

    // Le payload ne sert à rien sans caption pour la démo → on l'allège un peu
    delete payload.caption;
    payload.identity = identity;

    if (news_id) {
      supabase.from('demo_cache').upsert({
        preset, news_id, payload, created_at: new Date().toISOString(),
      }).then(() => {}, (e) => console.warn('[Demo/cache]', e?.message));
    }

    res.json({ ...payload, cached: false, remaining: remaining - 1 });
  } catch (e) {
    console.error('[Demo/generate]', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'La génération a échoué — réessaie.' });
  }
});

async function remainingFor(ipHash, visitorId) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supabase
    .from('demo_generations')
    .select('id', { count: 'exact', head: true })
    .eq('cached', false)
    .gte('created_at', since)
    .or(`ip_hash.eq.${ipHash},visitor_id.eq.${visitorId}`);
  return Math.max(0, VISITOR_LIMIT - (count || 0));
}

// ─── GET /api/demo/media ──────────────────────────────────────────────────────
// Fiche publique des médias démo — les VRAIES infos du compte (table clients),
// filtrées aux champs affichables sur la landing.
router.get('/media', async (_req, res) => {
  try {
    const media = [];
    for (const [key, p] of Object.entries(DEMO_PROFILES)) {
      const c = await loadDemoClient(key);
      if (!c) continue;
      media.push({
        key,
        name: c.name,
        handle: c.instagram_handle || null,
        avatar: c.avatar_url || c.logo_url || null,
        logo: c.logo_url || null,
        palette: c.brand_colors || [],
        font: c.font_primary || null,
        tone: (c.tone_tags || []).map(t => String(t).toLowerCase()),
        topics: c.topics || [],
        domain: p.topic,
        placeholder: p.placeholder,
      });
    }
    res.json({ media });
  } catch (e) {
    console.error('[Demo/media]', e.message);
    res.status(500).json({ error: 'indisponible' });
  }
});

// ─── POST /api/demo/track ─────────────────────────────────────────────────────
const TRACK_EVENTS = new Set([
  'landing_cta_hero_essayer', 'landing_cta_voir_demo', 'landing_cta_pricing', 'landing_cta_final',
  'demo_board_viewed', 'demo_board_tab', 'demo_board_forge_clicked',
  'demo_section_viewed', 'demo_preset_selected', 'demo_news_selected', 'demo_prompt_used',
  'demo_generate_started', 'demo_post_displayed', 'demo_rate_limited', 'demo_daily_limit',
  'demo_cta_clicked', 'demo_cta_post_result', 'demo_cta_rate_limited', 'demo_cta_daily_limit',
]);

router.post('/track', express.json({ limit: '4kb' }), (req, res) => {
  try {
    const { event, props } = req.body || {};
    if (!TRACK_EVENTS.has(event)) return res.status(204).end();
    const visitorId = readCookie(req, 'forje_demo_id');
    supabase.from('demo_events').insert({
      event,
      props: props && typeof props === 'object' ? props : null,
      visitor_id: visitorId,
      ip_hash: hashIp(getIp(req)),
    }).then(() => {}, () => {});
  } catch (_) { /* le tracking ne casse jamais */ }
  res.status(204).end();
});

// ─── GET /api/demo/examples ───────────────────────────────────────────────────
// Exemples réels par format pour la section Formats — fichiers déposés dans
// assets/demo/examples/ quand ils existent (générés avec les presets démo).
router.get('/examples', (_req, res) => {
  const dir = path.join(__dirname, '..', 'assets', 'demo', 'examples');
  const examples = {};
  for (const key of ['actu', 'citation', 'deep_dive']) {
    for (const ext of ['jpg', 'png', 'webp']) {
      if (fs.existsSync(path.join(dir, key + '.' + ext))) {
        examples[key] = 'assets/demo/examples/' + key + '.' + ext;
        break;
      }
    }
  }
  res.json({ examples });
});

// ─── Cron : alimentation du board démo ────────────────────────────────────────
// Toutes les 10 min (appelé par server.js) : rescoring incrémental des deux
// comptes démo via le pipeline existant, puis snapshot des 8 meilleures actus
// (score ≥ 60 affiché, i.e. score_total ≥ 6) dans demo_veille.
async function refreshDemoVeille(scoreForCompte) {
  for (const [key, profile] of Object.entries(DEMO_PROFILES)) {
    try {
      if (typeof scoreForCompte === 'function') {
        await scoreForCompte(profile.compteId, 20, 24).catch(e =>
          console.warn(`[DemoVeille] scoring ${key}:`, e.message));
      }

      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data: scored, error } = await supabase
        .from('news_scored')
        .select('score_total, created_at, news_raw(titre, description, source, url, published_at)')
        .eq('compte_id', profile.compteId)
        .gte('score_total', 6)
        .neq('flag', 'exclu')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;

      // Dédup par URL, tri par fraîcheur de publication, top 8
      const seen = new Set();
      const items = [];
      for (const s of scored || []) {
        const n = s.news_raw;
        if (!n || !n.url || seen.has(n.url)) continue;
        seen.add(n.url);
        items.push({
          profile_key:  key,
          titre:        n.titre,
          description:  (n.description || '').slice(0, 500),
          source:       n.source,
          url:          n.url,
          score:        Math.min(100, Math.round(s.score_total * 10)),
          published_at: n.published_at || s.created_at,
        });
      }
      items.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
      const top = items.slice(0, 8);
      if (!top.length) { console.log(`[DemoVeille] ${key}: rien à publier`); continue; }

      const { error: upErr } = await supabase
        .from('demo_veille')
        .upsert(top, { onConflict: 'profile_key,url' });
      if (upErr) throw upErr;

      // Ne garde que le top 8 sur le board (les vieilles actus sortent)
      const keepUrls = top.map(t => t.url);
      await supabase
        .from('demo_veille')
        .delete()
        .eq('profile_key', key)
        .not('url', 'in', `(${keepUrls.map(u => `"${u}"`).join(',')})`);

      _veilleCache = { at: 0, payload: null }; // invalide le cache API
      console.log(`[DemoVeille] ${key}: board à jour (${top.length} actus)`);
    } catch (e) {
      console.error(`[DemoVeille] ${key}:`, e.message);
    }
  }
}

module.exports = { router, refreshDemoVeille };
