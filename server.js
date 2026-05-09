require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const os       = require('os');
const { supabase } = require('./lib/supabase');

const app  = express();
const PORT = process.env.PORT || 3001;

const ROOT = __dirname;
const NM   = path.join(__dirname, 'node_modules');

app.use(cors());
app.use(express.json());

// Fonts pour le Canvas côté client
app.use('/fonts/bebas-neue',       express.static(path.join(NM, '@fontsource/bebas-neue/files')));
app.use('/fonts/playfair-display', express.static(path.join(NM, '@fontsource/playfair-display/files')));
app.use('/fonts/space-grotesk',    express.static(path.join(NM, '@fontsource/space-grotesk/files')));
app.use('/fonts/syne',             express.static(path.join(NM, '@fontsource/syne/files')));
app.use('/fonts/dm-serif-display', express.static(path.join(NM, '@fontsource/dm-serif-display/files')));

// SaaS principal (fichiers statiques à la racine)
app.use(express.static(ROOT));

// ─── Routes API ───────────────────────────────────────────────────────────────
app.use('/api/admin',        require('./routes/admin'));
app.use('/api/onboarding',   require('./routes/onboarding'));
app.use('/api/generate',     require('./routes/generate'));
app.use('/api/brand',        require('./routes/brand'));
app.use('/api/interactions', require('./routes/interactions'));
app.use('/api/agent',        require('./routes/agent'));

const { router: rssRouter,     fetchAllFeeds }                              = require('./routes/rss');
const { router: scoringRouter, scoreForCompte }                             = require('./routes/scoring');
const { router: twitterRouter, fetchAllTwitterAccounts, fetchTwitterSources, evaluateTwitterSources } = require('./routes/twitter');
const { router: learningRouter }                                            = require('./routes/learning');

app.use('/api/rss',      rssRouter);
app.use('/api/resumes',  require('./routes/resumes'));
app.use('/api/scoring',  scoringRouter);
app.use('/api/twitter',  twitterRouter);
app.use('/api/learning', learningRouter);

// ─── Polling RSS toutes les 5 minutes — SANS Twitter (appels API gratuits) ───
const RSS_INTERVAL_MS = 5 * 60 * 1000;

async function rssLoop() {
  try {
    console.log('[RSS] Fetch…');
    const { count } = await fetchAllFeeds()
      .then(r => ({ count: r.reduce((s, x) => s + (x.inserted ?? 0), 0) }))
      .catch(err => { console.error('[RSS] erreur:', err.message); return { count: 0 }; });
    console.log(`[RSS] +${count} articles`);
  } catch (err) {
    console.error('[RSS] crash inattendu:', err.message);
  }
}

// ─── Polling Twitter séparé — TWITTER_INTERVAL_MIN env var (défaut 60 min) ──
// Calcul : N sources × (60 / intervalle_min) appels/heure
// Exemples : 34 sources à 60 min = 34 appels/h | à 120 min = 17 appels/h
const TWITTER_INTERVAL_MS = parseInt(process.env.TWITTER_INTERVAL_MIN || '60') * 60 * 1000;

async function twitterLoop() {
  try {
    if (!process.env.TWITTERAPI_IO_KEY) return;
    console.log('[Twitter] Fetch sources…');
    const { data: comptes } = await supabase.from('comptes').select('id, nom');
    const compteIds = (comptes || []).map(c => c.id);

    const [twManual, ...twSources] = await Promise.all([
      fetchAllTwitterAccounts(),
      ...compteIds.map(id => fetchTwitterSources(id)),
    ]);

    const all      = [twManual, ...twSources].flat();
    const inserted = all.reduce((s, r) => s + (r.inserted ?? 0), 0);
    const errors   = all.filter(r => r.error).map(r => r.error);
    if (errors.length) console.warn(`[Twitter] ${errors.length} erreur(s):`, errors[0]);
    console.log(`[Twitter] +${inserted} tweets`);
  } catch (err) {
    console.error('[Twitter] crash inattendu:', err.message);
  }
}

// Évaluation quotidienne des sources Twitter
async function dailyTwitterEval() {
  const { data: comptes } = await supabase.from('comptes').select('id, nom');
  for (const c of (comptes || [])) {
    evaluateTwitterSources(c.id).catch(err => console.error(`[TwitterEval] ${c.nom}: ${err.message}`));
  }
}
setInterval(dailyTwitterEval, 24 * 60 * 60 * 1000);

// Purge quotidienne — garde 7 jours dans news_raw et news_scored
async function dailyPurge() {
  const { error: e1, count: c1 } = await supabase.from('news_raw')
    .delete({ count: 'exact' }).lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  const { error: e2, count: c2 } = await supabase.from('news_scored')
    .delete({ count: 'exact' }).lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  if (e1 || e2) console.error('[Purge] erreur:', e1?.message || e2?.message);
  else console.log(`[Purge] -${c1 ?? '?'} news_raw | -${c2 ?? '?'} news_scored`);
}
setInterval(dailyPurge, 24 * 60 * 60 * 1000);
dailyPurge();

rssLoop();
setInterval(rssLoop, RSS_INTERVAL_MS);

twitterLoop();
setInterval(twitterLoop, TWITTER_INTERVAL_MS);

// ─── Admin (caché, pas indexé dans le SPA) ───────────────────────────────────
app.get('/admin', (_req, res) => res.sendFile(path.join(ROOT, 'admin.html')));

// ─── SPA fallback ────────────────────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));

process.on('uncaughtException',  err => console.error('[CRASH]', err.message, err.stack));
process.on('unhandledRejection', err => console.error('[REJECT]', err?.message || err));

app.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter(n => n && !n.internal && (n.family === 'IPv4' || n.family === 4))
    .map(n => n.address);
  console.log(`[Forje  🎨] http://localhost:${PORT}`);
  console.log(`[Admin  💰] http://localhost:${PORT}/admin`);
  for (const ip of lan) {
    console.log(`            http://${ip}:${PORT}`);
    console.log(`            http://${ip}:${PORT}/admin`);
  }
});
