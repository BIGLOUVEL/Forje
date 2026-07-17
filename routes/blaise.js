// routes/blaise.js
// Blaise — directeur artistique IA de Forje Studio.
// Agent conversationnel (boucle agentique Claude Sonnet + tools) qui aide le
// client à structurer son identité et applique les changements VALIDÉS.
// La conversation est gratuite ; seules les générations coûtent des crédits
// (logo 2 cr, retouche 1 cr) — débit/remboursement gérés dans lib/blaise/tools.
//
// POST /api/blaise           { clientId, message, mode: 'onboarding'|'studio' }
// GET  /api/blaise/history   ?clientId=…
// POST /api/blaise/reset     { clientId }  (repart de zéro — dev/onboarding)

const express   = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../lib/supabase');
const { track }    = require('../lib/costTracker');
const { BLAISE_TOOLS, executeTool }   = require('../lib/blaise/tools');
const { buildBlaiseSystemBlocks }     = require('../lib/blaise/systemPrompt');
const { fetchEditorialRules }         = require('../lib/editorialRules');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL          = 'claude-sonnet-4-6';
const MAX_TOKENS     = 800;      // Blaise répond court par design
const MAX_ITERATIONS = 6;        // boucle agentique max par tour
const HISTORY_LIMIT  = 12;       // messages rechargés en contexte (coûts)
const DEADLINE_MS    = 280_000;  // garde-fou sous le maxDuration Vercel (300s
                                 //   — generate_post deep dive prend 60-120s)

// Coût réel d'un appel avec prompt caching (USD) : cache read 0,1× / write 1,25×
function sonnetCostUsd(u) {
  if (!u) return null;
  return ((u.input_tokens || 0) * 3
        + (u.cache_read_input_tokens || 0) * 0.30
        + (u.cache_creation_input_tokens || 0) * 3.75
        + (u.output_tokens || 0) * 15) / 1_000_000;
}

// ─── Auth : Bearer token → user → ownership du client ────────────────────────
async function loadAuthedClient(req, res) {
  const clientId = req.body?.clientId || req.query?.clientId;
  if (!clientId) { res.status(400).json({ error: 'clientId requis' }); return null; }

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'Non autorisé' }); return null; }
  const authResult = await supabase.auth.getUser(token);
  const user = authResult.data?.user;
  if (authResult.error || !user) { res.status(401).json({ error: 'Non autorisé' }); return null; }

  const { data: client } = await supabase.from('clients')
    .select('*').eq('id', clientId).eq('user_id', user.id).maybeSingle();
  if (!client) { res.status(403).json({ error: 'Accès interdit' }); return null; }
  // Mémoire éditoriale → bloc dynamique du system prompt
  client.editorial_rules = await fetchEditorialRules(client.id);
  return client;
}

// ─── Persistance de la conversation ──────────────────────────────────────────
// On ne stocke QUE les tours user + les réponses finales de Blaise (texte),
// jamais les blocs tool_use/tool_result : au rechargement, un tool_use sans
// son tool_result ferait planter l'API. Les events (images générées,
// changements appliqués) sont rangés dans un bloc custom 'blaise_events'
// filtré avant tout envoi à Claude — il ne sert qu'à l'UI.

async function loadConversation(clientId) {
  const { data } = await supabase.from('blaise_messages')
    .select('role, content, images, created_at, is_daily_brief')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  return (data || []).reverse();
}

function toClaudeMessages(rows) {
  const messages = [];
  // Fenêtre pleine = début de conversation probablement tronqué → résumé d'une
  // ligne en tête (l'identité détaillée est déjà dans le bloc system dynamique).
  if (rows.length >= HISTORY_LIMIT) {
    messages.push({
      role: 'user',
      content: [{ type: 'text', text: "(Contexte : ceci est la suite d'une conversation plus ancienne. L'IDENTITÉ ACTUELLE DU CLIENT dans ton contexte système reflète déjà toutes les décisions validées — logo, palette, stratégie.)" }],
    });
  }
  for (const row of rows) {
    const blocks = (Array.isArray(row.content) ? row.content : [])
      .filter(b => b && b.type === 'text' && b.text && b.text.trim());
    if (!blocks.length) continue;
    messages.push({ role: row.role, content: blocks });
  }
  // L'API exige une alternance stricte user/assistant : on fusionne les
  // doublons consécutifs (ex : deux messages user si un tour a échoué).
  const merged = [];
  for (const m of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content = last.content.concat(m.content);
    else merged.push({ role: m.role, content: [...m.content] });
  }
  if (merged.length && merged[0].role === 'assistant') merged.shift();
  return merged;
}

// Allège un résultat de tool avant persistance : JAMAIS de base64 ni de gros
// payloads en base — on ne garde que l'essentiel (image_url, applied, postId…).
function compactResult(toolName, result) {
  if (!result || typeof result !== 'object') return result;
  const { _payload, ...rest } = result;
  if (toolName === 'search_references' && Array.isArray(rest.references)) {
    rest.references = rest.references.slice(0, 4);
  }
  return rest;
}

function compactEvents(events) {
  return events.map(e => ({ ...e, result: compactResult(e.tool, e.result) }));
}

async function saveTurn(clientId, userMessage, replyText, events, images) {
  // Les tool_use/results ne sont pas persistés : on garde les URLs des images
  // générées dans un bloc texte dédié pour que Blaise les retrouve au tour
  // suivant ("On prend celui-là" → update_brand_identity(logo_url)). L'UI
  // masque ce bloc (préfixe ⟦images⟧). Idem pour les posts générés (⟦posts⟧).
  const posts = events
    .filter(e => e.tool === 'generate_post' && e.result && e.result.postId)
    .map(e => `${e.result.postId} (${e.result.format}${e.result.title ? ` — "${e.result.title}"` : ''})`);
  const rows = [
    { client_id: clientId, role: 'user', content: [{ type: 'text', text: userMessage }] },
    {
      client_id: clientId, role: 'assistant',
      content: [
        { type: 'text', text: replyText },
        ...(images.length ? [{ type: 'text', text: `⟦images⟧ Images générées dans ce tour : ${images.join(' ')}` }] : []),
        ...(posts.length ? [{ type: 'text', text: `⟦posts⟧ Posts générés dans ce tour : ${posts.join(' · ')}` }] : []),
        ...(events.length ? [{ type: 'blaise_events', events: compactEvents(events) }] : []),
      ],
      images: images.length ? images : null,
    },
  ];
  const { error } = await supabase.from('blaise_messages').insert(rows);
  if (error) console.error('[Blaise] save:', error.message);
}

// ─── Stepper onboarding : stage déduit par le serveur, jamais par le front ───
// 1 Nom · 2 Style · 3 Logo · 4 C'est parti
async function computeOnboardingStage(client, { imagesThisTurn = false, appliedThisTurn = false } = {}) {
  if (appliedThisTurn || client.logo_url || (client.onboarding_step || 0) >= 4) return 4;
  if (imagesThisTurn) return 3;
  const { data } = await supabase.from('blaise_messages')
    .select('id').eq('client_id', client.id).not('images', 'is', null).limit(1);
  if (data && data.length) return 3;
  if (client.name) return 2;
  return 1;
}

const extractText = (response) =>
  (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

// ─── POST /api/blaise — le tour de conversation ──────────────────────────────
router.post('/', async (req, res) => {
  const { message, mode = 'studio', imageB64, imageMime } = req.body || {};
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'message requis' });

  const client = await loadAuthedClient(req, res);
  if (!client) return;

  const startedAt = Date.now();
  const events = [];
  const images = [];

  try {
    // Image de référence jointe par le client : uploadée en storage, montrée à
    // Claude pour CE tour, et mémorisée en URL dans le message persisté.
    let userContent = String(message);
    let persistedMessage = String(message);
    if (imageB64) {
      try {
        const buf = Buffer.from(String(imageB64).replace(/^data:[^;]+;base64,/, ''), 'base64');
        const ext = /jpe?g/.test(imageMime || '') ? 'jpg' : /webp/.test(imageMime || '') ? 'webp' : 'png';
        const path = `blaise/${client.id}/upload-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('brand-assets')
          .upload(path, buf, { contentType: imageMime || 'image/png', upsert: true });
        if (!upErr) {
          const url = supabase.storage.from('brand-assets').getPublicUrl(path).data.publicUrl;
          userContent = [
            { type: 'image', source: { type: 'url', url } },
            { type: 'text', text: `${message}\n(Image de référence jointe : ${url})` },
          ];
          persistedMessage = `${message}\n⟦image-jointe⟧ ${url}`;
        }
      } catch (e) { console.warn('[Blaise] upload image jointe:', e.message); }
    }

    const history = toClaudeMessages(await loadConversation(client.id));
    let messages = [...history, { role: 'user', content: userContent }];
    let iterations = 0;
    let lastText = '';

    // client "vivant" : les tools (update/save) modifient l'identité en cours
    // de tour — on recharge après chaque exécution pour que Blaise voie l'état réel
    let liveClient = client;

    while (iterations < MAX_ITERATIONS && (Date.now() - startedAt) < DEADLINE_MS) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // Blocs system : stable (cache) + KB (cache) + identité (dynamique).
        // Le tableau tools porte cache_control sur son dernier élément.
        system: buildBlaiseSystemBlocks(liveClient, mode, message),
        tools: BLAISE_TOOLS,
        messages,
      });

      const u = response.usage || {};
      track({
        feature: 'blaise_chat', model: MODEL,
        inputTokens: u.input_tokens, outputTokens: u.output_tokens,
        costUsd: sonnetCostUsd(u),
        meta: { cache_read: u.cache_read_input_tokens || 0, cache_write: u.cache_creation_input_tokens || 0 },
      });
      // Recherches web (server tool exécuté côté Anthropic) — ~$10/1000
      const searches = (response.content || []).filter(b => b.type === 'server_tool_use').length;
      for (let s = 0; s < searches; s++) track({ feature: 'blaise_search', model: 'web_search' });

      if (response.stop_reason !== 'tool_use') {
        const reply = extractText(response) || lastText || '…';
        await saveTurn(client.id, persistedMessage, reply, events, images);
        return res.json({
          reply, events, images,
          onboardingStage: mode === 'onboarding' ? await turnStage(liveClient, events, images) : undefined,
          creditsLeft: await currentCredits(client.id),
        });
      }

      lastText = extractText(response) || lastText;
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const block of response.content.filter(b => b.type === 'tool_use')) {
        const result = await executeTool(block.name, block.input, liveClient, client.id);
        events.push({ tool: block.name, input: sanitizeInput(block.name, block.input), result });
        if (result && result.image_url) images.push(result.image_url);
        toolResults.push({
          type: 'tool_result', tool_use_id: block.id,
          // _payload (fonds base64 des posts) réservé au front — jamais à Claude
          content: JSON.stringify(compactResult(block.name, result)),
        });
        if (block.name === 'update_brand_identity' || block.name === 'save_strategy') {
          const { data: fresh } = await supabase.from('clients').select('*').eq('id', client.id).maybeSingle();
          if (fresh) { fresh.editorial_rules = liveClient.editorial_rules; liveClient = fresh; }
        }
        if (block.name === 'save_editorial_rule' && result && result.saved) {
          liveClient.editorial_rules = await fetchEditorialRules(client.id);
        }
      }
      messages.push({ role: 'user', content: toolResults });
      iterations++;
    }

    // 6 itérations (ou deadline) sans réponse finale : dernier état + reprise
    const reply = lastText || 'On a bien avancé — dis-moi comment tu veux continuer.';
    await saveTurn(client.id, persistedMessage, reply, events, images);
    res.json({
      reply, events, images, truncated: true,
      onboardingStage: mode === 'onboarding' ? await turnStage(liveClient, events, images) : undefined,
      creditsLeft: await currentCredits(client.id),
    });

  } catch (err) {
    console.error('[Blaise]', err.message);
    // Si des générations ont DÉJÀ abouti dans ce tour (logo, post…), on ne les
    // perd jamais : on persiste + renvoie ce qui existe au lieu d'un 500 sec.
    // (Incident réel du 16/07 : crédit API épuisé APRÈS un generate_logo réussi
    //  → l'image existait en storage mais l'user ne l'a jamais vue.)
    if (images.length || events.some(e => e.result && !e.result.error)) {
      const reply = "J'ai eu un souci de connexion en finalisant ma réponse, mais voilà où on en est — dis-moi ce que tu en penses.";
      try { await saveTurn(client.id, String(message), reply, events, images); } catch (_) {}
      return res.json({ reply, events, images, degraded: true, creditsLeft: await currentCredits(client.id) });
    }
    res.status(500).json({ error: 'Blaise a rencontré un souci — réessaie dans un instant.' });
  }
});

// Stage du stepper après ce tour (sans requête DB si les flags du tour suffisent)
function turnStage(liveClient, events, images) {
  const applied = events.some(e => e.tool === 'update_brand_identity' && e.result && !e.result.error);
  return computeOnboardingStage(liveClient, { imagesThisTurn: images.length > 0, appliedThisTurn: applied });
}

// Ne renvoie au front que ce qui est utile à l'affichage (pas les prompts)
function sanitizeInput(toolName, input) {
  if (toolName === 'search_references') return { query: input.query };
  if (toolName === 'generate_logo') return { archetype: input.archetype, include_wordmark: !!input.include_wordmark };
  if (toolName === 'edit_image') return { image_url: input.image_url };
  if (toolName === 'update_brand_identity' || toolName === 'save_strategy') return input;
  if (toolName === 'generate_post') return { format: input.format, variant: input.variant, slide_count: input.slide_count };
  if (toolName === 'save_editorial_rule') return { rule: input.rule };
  if (toolName === 'schedule_post') return { post_id: input.post_id, scheduled_at: input.scheduled_at };
  return {};
}

async function currentCredits(clientId) {
  const { data } = await supabase.from('clients').select('credits').eq('id', clientId).maybeSingle();
  return data ? data.credits : null;
}

// ─── GET /api/blaise/history — recharge le fil pour l'UI ─────────────────────
router.get('/history', async (req, res) => {
  const client = await loadAuthedClient(req, res);
  if (!client) return;

  const rows = await loadConversation(client.id);
  const thread = rows.map(r => {
    const blocks = Array.isArray(r.content) ? r.content : [];
    // Blocs techniques masqués à l'UI : ⟦images⟧ (mémoire des URLs pour Claude)
    // et marqueur ⟦image-jointe⟧ transformé en pièce jointe affichable.
    let attachment = null;
    const text = blocks
      .filter(b => b.type === 'text' && !String(b.text).startsWith('⟦images⟧') && !String(b.text).startsWith('⟦posts⟧'))
      .map(b => b.text).join('\n')
      .replace(/\n?⟦image-jointe⟧\s*(\S+)/, (_, url) => { attachment = url; return ''; })
      .replace(/\n?⟦ref⟧\s*\S+/g, '')
      .trim();
    const eventsBlock = blocks.find(b => b.type === 'blaise_events');
    return {
      role: r.role, text, attachment,
      events: eventsBlock ? eventsBlock.events : [],
      images: r.images || [],
      is_daily_brief: !!r.is_daily_brief,
      created_at: r.created_at,
    };
  });
  res.json({
    thread,
    onboardingStage: await computeOnboardingStage(client),
    creditsLeft: client.credits,
  });
});

// ─── POST /api/blaise/daily-brief — le brief du jour (cron) ──────────────────
// Appelé toutes les heures par GitHub Actions (blaise-daily-brief.yml) avec le
// secret DEMO_REFRESH_SECRET — même pattern que /api/demo/refresh. PAS de
// recherche web : le brief pioche dans le board de veille déjà scoré (coût =
// un appel Haiku court par client). Silencieux si le board est faible.
//
// Query : ?force=1 (ignore l'heure — tests) · ?clientId=… (un seul client)

const BRIEF_MIN_SCORE = 6;      // score_total /10 — équivalent "60"
const BRIEF_MODEL     = 'claude-haiku-4-5-20251001';

function parisHour() {
  return parseInt(new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Paris' }).format(new Date()), 10);
}

async function buildDailyBriefFor(client) {
  // 1. Déjà briefé aujourd'hui (minuit Paris) ? → skip
  const now = new Date();
  const dayStartParis = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  dayStartParis.setHours(0, 0, 0, 0);
  const offsetMs = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' })).getTime();
  const dayStartUtc = new Date(dayStartParis.getTime() + offsetMs);
  const { data: existing } = await supabase.from('blaise_messages')
    .select('id').eq('client_id', client.id).eq('is_daily_brief', true)
    .gte('created_at', dayStartUtc.toISOString()).limit(1);
  if (existing && existing.length) return { skipped: 'already_sent' };

  // 2. Board de veille du user (comptes.user_id → news_scored dernières 24h)
  const { data: comptes } = await supabase.from('comptes')
    .select('id').eq('user_id', client.user_id);
  if (!comptes || !comptes.length) return { skipped: 'no_compte' };
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: news } = await supabase.from('news_scored')
    .select('score_total, format_suggere, pourquoi_ce_score, news_raw(title, source, url)')
    .in('compte_id', comptes.map(c => c.id))
    .gte('created_at', since)
    .gte('score_total', BRIEF_MIN_SCORE)
    .neq('flag', 'exclu')
    .order('score_total', { ascending: false })
    .limit(10);
  if (!news || !news.length) return { skipped: 'board_empty' }; // pas de bruit

  // 3. Un appel Claude court → 3 idées au gabarit + une reco
  const lines = news.map((n, i) =>
    `${i + 1}. [${n.score_total}/10] ${n.news_raw?.title || '?'} (${n.news_raw?.source || '?'})${n.format_suggere ? ' — format suggéré : ' + n.format_suggere : ''}`
  ).join('\n');
  const rules = require('../lib/editorialRules').editorialRulesLine(client);
  const prompt = `Tu es Blaise, directeur artistique du média Instagram "${client.name || 'du client'}". Tu tutoies, direct et chaleureux.
${client.strategy ? `Stratégie : cible ${client.strategy.target_audience || '—'} · piliers ${(client.strategy.content_pillars || []).join(', ') || '—'}.` : ''}${rules}

Les meilleures actus du board de veille ce matin :
${lines}

Écris le BRIEF DU JOUR (court, énergique, zéro blabla) :
- Une phrase d'ouverture (une seule).
- 3 idées de posts, une ligne chacune, gabarit STRICT :
  "1. **Titre accrocheur** — contexte en quelques mots → Actu · 2 cr" (formats : Actu · 2 cr / Citation · 1 cr / Deep Dive · 3 cr)
- Une reco finale en une phrase : laquelle tu ferais en premier et pourquoi.
Termine par la ligne exacte : [chips: Génère la 1 | Génère la 2 | Génère la 3]
RETOURNE UNIQUEMENT LE BRIEF.`;

  const resp = await anthropic.messages.create({
    model: BRIEF_MODEL, max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });
  track({ feature: 'blaise_daily_brief', model: BRIEF_MODEL, inputTokens: resp.usage?.input_tokens, outputTokens: resp.usage?.output_tokens });
  const text = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if (!text) return { skipped: 'empty_brief' };

  const { error } = await supabase.from('blaise_messages').insert({
    client_id: client.id, role: 'assistant',
    content: [{ type: 'text', text }],
    is_daily_brief: true,
  });
  if (error) return { error: error.message };
  return { sent: true };
}

router.post('/daily-brief', async (req, res) => {
  const secret = (req.headers.authorization || '').replace('Bearer ', '');
  if (!process.env.DEMO_REFRESH_SECRET || secret !== process.env.DEMO_REFRESH_SECRET) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  const force = req.query.force === '1';
  const hour = parisHour();

  try {
    let q = supabase.from('clients')
      .select('id, user_id, name, strategy, notif_prefs, onboarding_completed');
    if (req.query.clientId) q = q.eq('id', req.query.clientId);
    const { data: clients } = await q;

    const results = {};
    for (const client of clients || []) {
      const prefs = client.notif_prefs || {};
      if (prefs.daily_brief_enabled === false) { results[client.id] = 'disabled'; continue; }
      const briefHour = Number.isFinite(+prefs.daily_brief_hour) ? +prefs.daily_brief_hour : 8;
      if (!force && briefHour !== hour) { results[client.id] = 'not_time'; continue; }
      try {
        client.editorial_rules = await fetchEditorialRules(client.id);
        const r = await buildDailyBriefFor(client);
        results[client.id] = r.sent ? 'sent' : (r.skipped || r.error || '?');
      } catch (e) {
        results[client.id] = 'error: ' + e.message;
        console.error('[Blaise/brief]', client.id, e.message);
      }
    }
    res.json({ ok: true, hour, results });
  } catch (err) {
    console.error('[Blaise/brief]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/blaise/reset — efface la conversation ─────────────────────────
router.post('/reset', async (req, res) => {
  const client = await loadAuthedClient(req, res);
  if (!client) return;
  const { error } = await supabase.from('blaise_messages').delete().eq('client_id', client.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
