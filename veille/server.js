require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const os       = require('os');
const { supabase } = require('./lib/supabase');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client')));

// ─── Routes API ──────────────────────────────────────────────────────────────
app.use('/api/onboarding', require('./routes/onboarding'));
const { router: rssRouter, fetchAllFeeds } = require('./routes/rss');
const { router: scoringRouter, scoreForCompte } = require('./routes/scoring');
app.use('/api/rss', rssRouter);
app.use('/api/scoring', scoringRouter);
app.use('/api/interactions', require('./routes/interactions'));
const { router: learningRouter } = require('./routes/learning');
app.use('/api/learning', learningRouter);

// ─── Polling RSS toutes les 5 minutes ────────────────────────────────────────
const RSS_INTERVAL_MS = 5 * 60 * 1000;

async function rssLoop() {
  console.log('[RSS] Fetch…');
  const results  = await fetchAllFeeds();
  const inserted = results.reduce((s, r) => s + (r.inserted ?? 0), 0);
  const errors   = results.filter(r => r.error).length;
  console.log(`[RSS] +${inserted} articles | ${errors} erreur(s)`);

  // Auto-score tous les comptes dès qu'il y a de nouveaux articles
  if (inserted > 0) {
    const { data: comptes } = await supabase.from('comptes').select('id, nom');
    for (const c of (comptes || [])) {
      scoreForCompte(c.id)
        .then(r => console.log(`[Score] ${c.nom} → +${r.scored} scorés, ${r.skipped} rejetés`))
        .catch(err => console.error(`[Score] ${c.nom}: ${err.message}`));
    }
  }
}

rssLoop(); // premier fetch au démarrage
setInterval(rssLoop, RSS_INTERVAL_MS);

// ─── SPA fallback ────────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && !n.internal && (n.family === 'IPv4' || n.family === 4))
    .map((n) => n.address);
  console.log(`[Veille ⚡] http://localhost:${PORT}`);
  for (const ip of lan) console.log(`           http://${ip}:${PORT}`);
});
