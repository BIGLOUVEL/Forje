const express = require('express');
const https   = require('https');
const { supabase } = require('../lib/supabase');

const TWITTER_KEY = process.env.TWITTERAPI_IO_KEY;
const router = express.Router();

// ─── Détection breaking dans un tweet ────────────────────────────────────────
const SIGNAUX_BREAKING = [
  'breaking', 'urgent', 'officiel', 'exclu', 'just in', 'confirmed',
  'annonce', 'officialise', 'signe', 'transfert confirmé', 'rupture',
  'sources directes', 'en exclusivité', 'on peut confirmer', 'we can confirm',
  'alerte', 'flash', 'breaking news', 'communiqué officiel',
];

function isBreakingTweet(text, sourceVitesse = null) {
  const t = (text || '').toLowerCase();
  if (SIGNAUX_BREAKING.some(s => t.includes(s))) return true;
  return sourceVitesse === 'breaking';
}

// ─── Rate limit guard ─────────────────────────────────────────────────────────
const _rateState = { count: 0, windowStart: Date.now() };
const RATE_MAX_PER_MIN = 60;

function checkRateLimit() {
  const now = Date.now();
  if (now - _rateState.windowStart > 60000) {
    _rateState.count = 0;
    _rateState.windowStart = now;
  }
  if (_rateState.count >= RATE_MAX_PER_MIN) {
    console.warn('[Twitter] Rate limit atteint — pause 60s');
    return false;
  }
  _rateState.count++;
  return true;
}

// ─── Cache tendances (30 min par compte) ─────────────────────────────────────
const _trendsCache = new Map(); // compteId → { data, fetchedAt }

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function twitterGet(path) {
  if (!checkRateLimit()) return Promise.reject(new Error('rate_limit'));
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.twitterapi.io', path, headers: { 'X-API-Key': TWITTER_KEY } },
      res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            // Detect API-level error responses (quota, auth, etc.)
            if (data.error || data.errors ||
                (typeof data.status === 'string' && data.status !== 'success') ||
                (typeof data.code === 'number' && data.code >= 400)) {
              reject(new Error(`twitterapi.io: ${JSON.stringify(data).slice(0, 300)}`));
              return;
            }
            resolve(data);
          } catch (e) { reject(new Error(`JSON parse error: ${body.slice(0, 100)}`)); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// ─── Fetch les tweets d'un handle et upsert dans news_raw ────────────────────
async function fetchTweetsForHandle(handle) {
  if (!TWITTER_KEY) {
    console.warn('[Twitter] TWITTERAPI_IO_KEY non configurée');
    return { source: `@${handle}`, inserted: 0, skipped: 0 };
  }
  try {
    const data   = await twitterGet(`/twitter/user/last_tweets?userName=${encodeURIComponent(handle)}`);
    const tweets = data.tweets || data.data?.tweets || [];

    if (!tweets.length) return { source: `@${handle}`, inserted: 0, skipped: 0 };

    const rows = tweets.slice(0, 20)
      .filter(t => t.text && t.text.length > 10)
      .map(t => {
        const tweetId = t.id || t.rest_id;
        const url     = t.url || (tweetId ? `https://x.com/${handle}/status/${tweetId}` : null);
        if (!url) return null;
        return {
          url,
          source:       `@${handle}`,
          titre:        t.text.replace(/\s+/g, ' ').trim().slice(0, 500),
          description:  null,
          published_at: t.createdAt || t.created_at
            ? new Date(t.createdAt || t.created_at).toISOString()
            : null,
        };
      })
      .filter(Boolean);

    if (!rows.length) return { source: `@${handle}`, inserted: 0, skipped: 0 };

    const { data: inserted, error } = await supabase
      .from('news_raw')
      .upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
      .select('id');

    if (error) throw error;
    return { source: `@${handle}`, inserted: inserted?.length ?? 0, skipped: rows.length - (inserted?.length ?? 0) };
  } catch (err) {
    console.error(`[Twitter] @${handle}: ${err.message}`);
    return { source: `@${handle}`, error: err.message };
  }
}

// ─── Fetch tous les comptes Twitter configurés (optionnel: filtré par compte_id)
async function fetchAllTwitterAccounts(compteId = null) {
  let query = supabase.from('comptes').select('id, nom, twitter_accounts');
  if (compteId) query = query.eq('id', compteId);
  const { data: comptes } = await query;

  const results = [];
  for (const compte of (comptes || [])) {
    for (const handle of (compte.twitter_accounts || [])) {
      const r = await fetchTweetsForHandle(handle);
      results.push(r);
      if (r.inserted > 0) console.log(`[Twitter] @${handle} → +${r.inserted} tweets`);
    }
  }
  return results;
}

// ─── GET /api/twitter/accounts?compte_id=X ───────────────────────────────────
router.get('/accounts', async (req, res) => {
  const { compte_id } = req.query;
  if (!compte_id) return res.status(400).json({ error: 'compte_id manquant' });
  try {
    const { data, error } = await supabase
      .from('comptes').select('twitter_accounts').eq('id', compte_id).single();
    if (error) throw error;
    res.json({ accounts: data.twitter_accounts || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/twitter/add-account ───────────────────────────────────────────
router.post('/add-account', async (req, res) => {
  const { compte_id, handle } = req.body;
  if (!compte_id || !handle) return res.status(400).json({ error: 'compte_id et handle requis' });

  // Normalise : @handle, x.com/handle, twitter.com/handle → handle
  const clean = handle
    .replace(/^@/, '')
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\//, '')
    .split(/[/?]/)[0]
    .trim();

  if (!clean) return res.status(400).json({ error: 'Handle invalide' });

  try {
    const { data: compte } = await supabase.from('comptes').select('twitter_accounts').eq('id', compte_id).single();
    const existing = compte?.twitter_accounts || [];
    if (existing.includes(clean)) return res.json({ ok: true, already_exists: true, handle: clean });

    const updated = [...existing, clean];
    await supabase.from('comptes').update({ twitter_accounts: updated }).eq('id', compte_id);

    // Fetch tweets immédiatement + score en background
    const result = await fetchTweetsForHandle(clean);
    if (result.inserted > 0) {
      const { scoreForCompte } = require('./scoring');
      setImmediate(() => scoreForCompte(compte_id).catch(() => {}));
    }

    res.json({ ok: true, handle: clean, inserted: result.inserted, error: result.error });
  } catch (err) {
    console.error('[Twitter add-account]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/twitter/remove-account ────────────────────────────────────────
router.post('/remove-account', async (req, res) => {
  const { compte_id, handle } = req.body;
  if (!compte_id || !handle) return res.status(400).json({ error: 'compte_id et handle requis' });
  const clean = handle.replace(/^@/, '');
  try {
    const { data: compte } = await supabase.from('comptes').select('twitter_accounts').eq('id', compte_id).single();
    const updated = (compte?.twitter_accounts || []).filter(h => h !== clean);
    await supabase.from('comptes').update({ twitter_accounts: updated }).eq('id', compte_id);
    res.json({ ok: true, accounts: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Fetch tweets des sources curatées (twitter_sources table) ───────────────
async function fetchTwitterSources(compteId) {
  if (!TWITTER_KEY) return [];

  const { data: sources } = await supabase
    .from('twitter_sources')
    .select('handle, vitesse')
    .eq('compte_id', compteId)
    .eq('actif', true);

  if (!sources?.length) return [];

  const results = [];
  let hasBreaking = false;

  for (const { handle, vitesse } of sources) {
    try {
      const data   = await twitterGet(`/twitter/user/last_tweets?userName=${encodeURIComponent(handle)}`);
      const tweets = data.tweets || data.data?.tweets || [];

      if (!tweets.length) { results.push({ source: `@${handle}`, inserted: 0, skipped: 0 }); continue; }

      const rows = tweets.slice(0, 20).map(t => {
        const tweetId = t.id || t.rest_id;
        const url     = t.url || (tweetId ? `https://x.com/${handle}/status/${tweetId}` : null);
        if (!url) return null;
        return {
          url,
          source:       `@${handle}`,
          titre:        t.text.replace(/\s+/g, ' ').trim().slice(0, 500),
          description:  null,
          published_at: t.createdAt || t.created_at
            ? new Date(t.createdAt || t.created_at).toISOString() : null,
        };
      }).filter(Boolean);

      const { data: inserted, error } = await supabase
        .from('news_raw')
        .upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
        .select('id');

      if (error) throw error;

      const n = inserted?.length ?? 0;
      if (n > 0) {
        // Mise à jour des stats de la source
        const { data: cur } = await supabase
          .from('twitter_sources')
          .select('nb_news_generees')
          .eq('compte_id', compteId).eq('handle', handle).single();
        await supabase.from('twitter_sources').update({
          derniere_news_at: new Date().toISOString(),
          nb_news_generees: (cur?.nb_news_generees || 0) + n,
        }).eq('compte_id', compteId).eq('handle', handle);

        // Vérifie si un des tweets insérés est breaking
        const breakingFound = rows.some(r => isBreakingTweet(r.titre, vitesse));
        if (breakingFound) {
          hasBreaking = true;
          console.log(`[TwitterSources] @${handle} ⚡ breaking détecté — scoring immédiat`);
        }
      }

      results.push({ source: `@${handle}`, inserted: n, skipped: rows.length - n });
    } catch (err) {
      if (err.message === 'rate_limit') {
        console.warn(`[TwitterSources] @${handle} skippé — rate limit`);
        results.push({ source: `@${handle}`, error: 'rate_limit' });
        break;
      }
      console.error(`[TwitterSources] @${handle}: ${err.message}`);
      results.push({ source: `@${handle}`, error: err.message });
    }
  }

  // Score immédiat si breaking détecté, sinon les tweets attendent le prochain refresh manuel
  if (hasBreaking) {
    setImmediate(async () => {
      try {
        const { scoreForCompte } = require('./scoring');
        const r = await scoreForCompte(compteId);
        console.log(`[TwitterSources] Breaking scoring → +${r.scored} scorés`);
      } catch (err) { console.error('[TwitterSources] Breaking scoring:', err.message); }
    });
  }

  return results;
}

// ─── Évaluation quotidienne des sources Twitter ───────────────────────────────
async function evaluateTwitterSources(compteId) {
  const { data: sources } = await supabase
    .from('twitter_sources')
    .select('id, handle, nb_news_generees, taux_pertinence')
    .eq('compte_id', compteId);

  if (!sources?.length) return;

  for (const source of sources) {
    if ((source.nb_news_generees || 0) < 50) continue; // pas assez de données

    // Articles de cette source scorés pour ce compte
    const { data: rawNews } = await supabase
      .from('news_raw').select('id').eq('source', `@${source.handle}`);
    if (!rawNews?.length) continue;

    const rawIds = rawNews.map(n => n.id);
    const { data: scored } = await supabase
      .from('news_scored').select('id').eq('compte_id', compteId).in('news_raw_id', rawIds);
    if (!scored?.length) continue;

    const scoredIds = scored.map(s => s.id);
    const { count: usedCount } = await supabase
      .from('interactions')
      .select('id', { count: 'exact', head: true })
      .eq('compte_id', compteId)
      .in('action', ['copy', 'generate'])
      .in('news_scored_id', scoredIds);

    const rate   = (usedCount || 0) / rawNews.length;
    const actif  = rate > 0.2;

    await supabase.from('twitter_sources')
      .update({ taux_pertinence: Math.round(rate * 100) / 100, actif })
      .eq('id', source.id);

    if (!actif) console.log(`[TwitterSources] @${source.handle} désactivé — taux pertinence: ${Math.round(rate * 100)}%`);
    else if (rate > 0.7) console.log(`[TwitterSources] @${source.handle} ⭐ source top — taux: ${Math.round(rate * 100)}%`);
  }
}

// ─── GET /api/twitter/curated-sources?compte_id=X ────────────────────────────
router.get('/curated-sources', async (req, res) => {
  const { compte_id } = req.query;
  if (!compte_id) return res.status(400).json({ error: 'compte_id manquant' });
  try {
    const { data, error } = await supabase
      .from('twitter_sources')
      .select('id, handle, nom, type, pourquoi, vitesse, langue, fiabilite, actif, nb_news_generees, taux_pertinence, derniere_news_at')
      .eq('compte_id', compte_id)
      .order('fiabilite', { ascending: false });
    if (error) throw error;
    res.json({ sources: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/twitter/curated-sources/:id — toggle actif ───────────────────
router.patch('/curated-sources/:id', async (req, res) => {
  const { id } = req.params;
  const { actif } = req.body;
  try {
    const { error } = await supabase
      .from('twitter_sources')
      .update({ actif })
      .eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/twitter/trends?compte_id=X — tendances filtrées par niche ──────
router.get('/trends', async (req, res) => {
  const { compte_id } = req.query;
  if (!compte_id) return res.status(400).json({ error: 'compte_id manquant' });
  if (!TWITTER_KEY) return res.json({ tendances: [], cached: false });

  const cached = _trendsCache.get(compte_id);
  if (cached && Date.now() - cached.fetchedAt < 30 * 60 * 1000) {
    return res.json({ tendances: cached.data, cached: true });
  }

  try {
    const { data: compte } = await supabase
      .from('comptes')
      .select('niche_principale, keywords_niche, sous_niches')
      .eq('id', compte_id)
      .single();

    // Fetch trends FR + Monde en parallèle
    const [dataFR, dataMonde] = await Promise.all([
      twitterGet('/twitter/trends?woeid=23424819'),
      twitterGet('/twitter/trends?woeid=1'),
    ]);

    // Normalise la réponse twitterapi.io (peut être array ou objet imbriqué)
    const normalizeTrends = (data, geo) => {
      const list = Array.isArray(data) ? data
        : data?.trends?.[0]?.trends || data?.trends || [];
      return list.map(t => ({ name: t.name, tweet_volume: t.tweet_volume || 0, geo }));
    };

    const tous = [
      ...normalizeTrends(dataFR, 'FR'),
      ...normalizeTrends(dataMonde, 'MONDE'),
    ];

    // Marque les tendances pertinentes pour la niche (sans filtrer — toutes sont visibles)
    const keywords = [
      compte?.niche_principale,
      ...(compte?.keywords_niche || []),
      ...(compte?.sous_niches    || []),
    ].filter(Boolean).map(k => k.toLowerCase());

    const tendances = tous
      .filter(t => t.name)
      .map(t => {
        const name = t.name.replace(/^#/, '').toLowerCase();
        const pertinent = keywords.length === 0 || keywords.some(k =>
          name.includes(k) || k.includes(name) || levenshteinClose(name, k)
        );
        return { ...t, pertinent };
      })
      // Pertinent en premier, puis par volume
      .sort((a, b) => {
        if (a.pertinent !== b.pertinent) return a.pertinent ? -1 : 1;
        return (b.tweet_volume || 0) - (a.tweet_volume || 0);
      })
      .slice(0, 15);

    _trendsCache.set(compte_id, { data: tendances, fetchedAt: Date.now() });
    res.json({ tendances, cached: false });
  } catch (err) {
    console.error('[Trends]', err.message);
    // En cas d'erreur retourne le cache périmé s'il existe plutôt que rien
    const stale = _trendsCache.get(compte_id);
    if (stale) return res.json({ tendances: stale.data, cached: true, stale: true });
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/twitter/refresh — fetch manuel avec guard 30min + estimation coût
const _refreshCooldown = new Map(); // compte_id → last fetch timestamp
const REFRESH_COOLDOWN_MS = 30 * 60 * 1000; // 30 min entre deux fetches manuels

router.post('/refresh', async (req, res) => {
  const { compte_id } = req.body;
  if (!compte_id) return res.status(400).json({ error: 'compte_id manquant' });
  if (!TWITTER_KEY) return res.status(503).json({ error: 'Twitter API non configurée' });

  const lastFetch = _refreshCooldown.get(compte_id) || 0;
  const waitSec   = Math.ceil((REFRESH_COOLDOWN_MS - (Date.now() - lastFetch)) / 1000);
  if (waitSec > 0) {
    return res.status(429).json({
      error: `Cooldown actif — attends encore ${Math.ceil(waitSec / 60)} min avant de relancer.`,
      retry_after_seconds: waitSec,
    });
  }

  try {
    // Compte les sources actives pour estimer le coût AVANT de fetcher
    const { data: sources } = await supabase
      .from('twitter_sources').select('handle').eq('compte_id', compte_id).eq('actif', true);
    const { data: compte }  = await supabase
      .from('comptes').select('twitter_accounts').eq('id', compte_id).single();

    const nSources = (sources?.length || 0) + (compte?.twitter_accounts?.length || 0);
    const estCredits = nSources * 20; // ~20 tweets max par handle

    _refreshCooldown.set(compte_id, Date.now());

    // Fetch en parallèle avec cap de 10 sources max pour limiter le coût
    const handles = [
      ...(sources || []).map(s => s.handle).slice(0, 8),
      ...(compte?.twitter_accounts || []).slice(0, 2),
    ];

    let inserted = 0;
    for (const handle of handles) {
      const r = await fetchTweetsForHandle(handle);
      inserted += r.inserted || 0;
    }

    res.json({ ok: true, inserted, sources_fetched: handles.length, credits_used_est: handles.length * 20 });
  } catch (err) {
    console.error('[Twitter/refresh]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/twitter/trends/log — log un clic sur une tendance ─────────────
router.post('/trends/log', async (req, res) => {
  const { compte_id, trend_name, tweet_volume, geo } = req.body;
  if (!compte_id || !trend_name) return res.status(400).json({ error: 'compte_id et trend_name requis' });
  try {
    await supabase.from('tendances_log').insert({ compte_id, trend_name, tweet_volume: tweet_volume || null, geo: geo || null, clique: true });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Matching approximatif court (pour capturer "mbappe" ↔ "mbappé" etc.)
function levenshteinClose(a, b) {
  if (Math.abs(a.length - b.length) > 3) return false;
  let diff = 0;
  const shorter = a.length <= b.length ? a : b;
  const longer  = a.length <= b.length ? b : a;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] !== longer[i]) diff++;
    if (diff > 2) return false;
  }
  return true;
}

module.exports = { router, fetchTweetsForHandle, isBreakingTweet };
