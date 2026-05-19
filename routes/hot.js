const express    = require('express');
const { supabase } = require('../lib/supabase');

const router = express.Router();

const STOP_WORDS = new Set([
  'avec','dans','pour','une','les','des','est','que','qui','sur','par','mais',
  'plus','tout','cette','comme','aussi','encore','depuis','après','avant','très',
  'their','that','this','with','from','have','been','will','they','were','about',
  'when','what','your','more','than','just','also','into','would','could','some',
]);

// Compute buzz_score = score_total × freshness multiplier
function buzzScore(item) {
  var ageMin = Math.round((Date.now() - new Date(item.created_at).getTime()) / 60000);
  var decay = ageMin < 30 ? 1.5 : ageMin < 60 ? 1.2 : ageMin < 180 ? 1.0 : ageMin < 360 ? 0.75 : 0.5;
  var base  = item.score_total || 0;
  // Breaking bonus
  if (item.alerte_breaking) base = Math.min(10, base + 1);
  return { buzz: Math.round(base * decay * 10) / 10, age_min: ageMin };
}

// Extract trending keywords from recent news titles
function extractTrending(newsItems) {
  var freq = {};
  (newsItems || []).forEach(function(n) {
    var words = (n.titre || '').toLowerCase()
      .replace(/https?:\/\/\S+/g, '')       // strip URLs
      .replace(/[^a-zéèêëàâùûüîïôœçñ\s]/g, ' ')
      .split(/\s+/);
    words.forEach(function(w) {
      if (w.length > 4 && !STOP_WORDS.has(w)) {
        freq[w] = (freq[w] || 0) + 1;
      }
    });
  });
  return Object.entries(freq)
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 10)
    .map(function([kw, count]) { return { kw: kw, count: count }; });
}

// Niche keyword cache per compte (1h TTL)
var _nicheCache = new Map();

async function getNicheKeywords(compte_id) {
  var cached = _nicheCache.get(compte_id);
  if (cached && Date.now() - cached.ts < 60 * 60 * 1000) return cached.keywords;

  var { data: compte } = await supabase
    .from('comptes')
    .select('niche_principale, sous_niches, keywords_niche, sujets_toujours_traites')
    .eq('id', compte_id)
    .maybeSingle();

  var keywords = [
    compte?.niche_principale,
    ...(compte?.sous_niches || []),
    ...(compte?.keywords_niche || []),
    ...(compte?.sujets_toujours_traites || []),
  ].filter(Boolean).map(function(k) { return k.toLowerCase(); });

  _nicheCache.set(compte_id, { keywords: keywords, ts: Date.now() });
  return keywords;
}

async function buildPayload(compte_id) {
  var sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  var oneHourAgo  = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

  var [{ data: scored }, { data: recent }, nicheKeywords] = await Promise.all([
    supabase
      .from('news_scored')
      .select('*, news_raw(*)')
      .eq('compte_id', compte_id)
      .neq('flag', 'exclu')
      .gte('created_at', sixHoursAgo)
      .order('score_total', { ascending: false })
      .limit(20),
    supabase
      .from('news_raw')
      .select('titre, published_at, created_at')
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: false })
      .limit(150),
    getNicheKeywords(compte_id).catch(function() { return []; }),
  ]);

  var items = (scored || [])
    .map(function(item) {
      var b = buzzScore(item);
      return Object.assign({}, item, { buzz_score: b.buzz, age_min: b.age_min });
    })
    .sort(function(a, b) { return b.buzz_score - a.buzz_score; })
    .slice(0, 5);

  // Trending with niche boost: keywords matching niche get ×2
  var rawTrending = extractTrending(recent);
  var trending = rawTrending.map(function(t) {
    var nicheMatch = nicheKeywords.some(function(k) {
      return t.kw.includes(k) || k.includes(t.kw);
    });
    return Object.assign({}, t, {
      count:      nicheMatch ? t.count * 2 : t.count,
      niche_match: nicheMatch,
    });
  }).sort(function(a, b) { return b.count - a.count; });

  return { items: items, trending: trending, ts: Date.now() };
}

// ─── GET /api/hot/feed — REST snapshot ───────────────────────────────────────
router.get('/feed', async function(req, res) {
  var compte_id = req.query.compte_id;
  if (!compte_id) return res.status(400).json({ error: 'compte_id manquant' });
  try {
    res.json(await buildPayload(compte_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/hot/stream — SSE live ──────────────────────────────────────────
router.get('/stream', async function(req, res) {
  var compte_id = req.query.compte_id;
  if (!compte_id) { res.status(400).end(); return; }

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  var alive = true;

  async function push() {
    if (!alive) return;
    try {
      var payload = await buildPayload(compte_id);
      res.write('data: ' + JSON.stringify(payload) + '\n\n');
    } catch (err) {
      res.write('data: ' + JSON.stringify({ error: err.message }) + '\n\n');
    }
  }

  // Heartbeat every 25s to keep connection alive through proxies
  var heartbeat = setInterval(function() {
    if (alive) res.write(': ping\n\n');
  }, 25000);

  var refresh = setInterval(push, 3 * 60 * 1000);

  req.on('close', function() {
    alive = false;
    clearInterval(heartbeat);
    clearInterval(refresh);
  });

  await push();
});

module.exports = router;
