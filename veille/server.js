require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const os       = require('os');
const { supabase } = require('./lib/supabase');

const app  = express();
const PORT = process.env.PORT || 3001;

const ROOT  = path.join(__dirname, '..');         // forje/ — main SaaS
const BOARD = path.join(__dirname, 'client');     // veille board

app.use(cors());
app.use(express.json());

// Block direct access to veille/ internals (.env, server.js, node_modules…)
app.use((req, res, next) => {
  if (/^\/veille\//i.test(req.path)) return res.status(403).end();
  next();
});

// Veille board at /board
app.use('/board', express.static(BOARD));

// Pack fonts — served from @fontsource packages for client-side Canvas rendering
const NM = path.join(__dirname, 'node_modules');
app.use('/fonts/bebas-neue',       express.static(path.join(NM, '@fontsource/bebas-neue/files')));
app.use('/fonts/playfair-display', express.static(path.join(NM, '@fontsource/playfair-display/files')));
app.use('/fonts/space-grotesk',    express.static(path.join(NM, '@fontsource/space-grotesk/files')));
app.use('/fonts/syne',             express.static(path.join(NM, '@fontsource/syne/files')));
app.use('/fonts/dm-serif-display', express.static(path.join(NM, '@fontsource/dm-serif-display/files')));

// Main SaaS static files
app.use(express.static(ROOT));

// ─── Routes API ──────────────────────────────────────────────────────────────
app.use('/api/onboarding', require('./routes/onboarding'));
app.use('/api/generate',  require('./routes/generate'));
app.use('/api/brand',     require('./routes/brand'));
const { router: rssRouter, fetchAllFeeds } = require('./routes/rss');
const { router: scoringRouter, scoreForCompte } = require('./routes/scoring');
const { router: twitterRouter, fetchAllTwitterAccounts, fetchTwitterSources, evaluateTwitterSources } = require('./routes/twitter');
app.use('/api/rss', rssRouter);
app.use('/api/scoring', scoringRouter);
app.use('/api/twitter', twitterRouter);
app.use('/api/interactions', require('./routes/interactions'));
const { router: learningRouter } = require('./routes/learning');
app.use('/api/learning', learningRouter);

// ─── Polling RSS toutes les 5 minutes ────────────────────────────────────────
const RSS_INTERVAL_MS = 2 * 60 * 1000;

async function rssLoop() {
  console.log('[RSS] Fetch…');
  const { data: comptes } = await supabase.from('comptes').select('id, nom');
  const compteIds = (comptes || []).map(c => c.id);

  const [rssResults, twManualResults, ...twSourceResults] = await Promise.all([
    fetchAllFeeds(),
    fetchAllTwitterAccounts(),
    ...compteIds.map(id => fetchTwitterSources(id)),
  ]);

  const results  = [rssResults, twManualResults, ...twSourceResults].flat();
  const inserted = results.reduce((s, r) => s + (r.inserted ?? 0), 0);
  const errors   = results.filter(r => r.error).length;
  console.log(`[RSS] +${inserted} articles | ${errors} erreur(s)`);

  if (inserted > 0) {
    (async () => {
      for (const c of (comptes || [])) {
        await new Promise(r => setTimeout(r, 5000));
        scoreForCompte(c.id)
          .then(r => console.log(`[Score] ${c.nom} → +${r.scored} scorés, ${r.skipped} rejetés`))
          .catch(err => console.error(`[Score] ${c.nom}: ${err.message}`));
      }
    })();
  }
}

// Évaluation quotidienne des sources Twitter (qualité + désactivation auto)
async function dailyTwitterEval() {
  const { data: comptes } = await supabase.from('comptes').select('id, nom');
  for (const c of (comptes || [])) {
    evaluateTwitterSources(c.id).catch(err => console.error(`[TwitterEval] ${c.nom}: ${err.message}`));
  }
}
setInterval(dailyTwitterEval, 24 * 60 * 60 * 1000);

rssLoop(); // premier fetch au démarrage
setInterval(rssLoop, RSS_INTERVAL_MS);

// ─── SPA fallbacks ───────────────────────────────────────────────────────────
app.get('/board', (_req, res) => res.sendFile(path.join(BOARD, 'index.html')));
app.get('/board/*', (_req, res) => res.sendFile(path.join(BOARD, 'index.html')));
app.get('*', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && !n.internal && (n.family === 'IPv4' || n.family === 4))
    .map((n) => n.address);
  console.log(`[Forje  🎨] http://localhost:${PORT}`);
  console.log(`[Board  ⚡] http://localhost:${PORT}/board`);
  for (const ip of lan) {
    console.log(`            http://${ip}:${PORT}`);
    console.log(`            http://${ip}:${PORT}/board`);
  }
});
