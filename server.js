require('dotenv').config();

// Strip BOM (U+FEFF) injecté par PowerShell/Windows sur toutes les env vars
Object.keys(process.env).forEach(k => {
  if (typeof process.env[k] === 'string') {
    process.env[k] = process.env[k].replace(/^﻿/, '').trim();
  }
});

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

// ─── Stripe webhook : raw body AVANT express.json (vérif signature) ──────────
const { router: billingRouter, webhook: stripeWebhook } = require('./routes/billing');
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(express.json({ limit: '20mb' }));

// Fonts pour le Canvas côté client (bibliothèque ForjeFonts — voir lib/fonts.js)
app.use('/fonts/anton',            express.static(path.join(NM, '@fontsource/anton/files')));
app.use('/fonts/bebas-neue',       express.static(path.join(NM, '@fontsource/bebas-neue/files')));
app.use('/fonts/oswald',           express.static(path.join(NM, '@fontsource/oswald/files')));
app.use('/fonts/archivo-black',    express.static(path.join(NM, '@fontsource/archivo-black/files')));
app.use('/fonts/dm-sans',          express.static(path.join(NM, '@fontsource/dm-sans/files')));
app.use('/fonts/inter',            express.static(path.join(NM, '@fontsource/inter/files')));
app.use('/fonts/space-grotesk',    express.static(path.join(NM, '@fontsource/space-grotesk/files')));
app.use('/fonts/sora',             express.static(path.join(NM, '@fontsource/sora/files')));
app.use('/fonts/montserrat',       express.static(path.join(NM, '@fontsource/montserrat/files')));
app.use('/fonts/playfair-display', express.static(path.join(NM, '@fontsource/playfair-display/files')));
// legacy packs (encore référencés par d'anciens kits)
app.use('/fonts/syne',             express.static(path.join(NM, '@fontsource/syne/files')));
app.use('/fonts/dm-serif-display', express.static(path.join(NM, '@fontsource/dm-serif-display/files')));

// Libs front servies localement (pas de CDN) — ex : JSZip pour l'export ZIP du carousel
app.use('/vendor/jszip', express.static(path.join(NM, 'jszip/dist')));

// SaaS principal (fichiers statiques à la racine)
app.use(express.static(ROOT));

// ─── Health check (debug) ─────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const { supabase } = require('./lib/supabase');
  let sbOk = false;
  let sbErr = null;
  try {
    const { error } = await supabase.from('clients').select('id').limit(1);
    sbOk = !error;
    sbErr = error?.message;
  } catch(e) { sbErr = e.message; }
  res.json({
    ok: true,
    env: {
      SUPABASE_URL:         !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
      ANTHROPIC_API_KEY:    !!process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY:       !!process.env.OPENAI_API_KEY,
      GOOGLE_API_KEY:       !!process.env.GOOGLE_API_KEY,
    },
    supabase: { ok: sbOk, error: sbErr }
  });
});

// ─── Routes API ───────────────────────────────────────────────────────────────
app.use('/api/admin',        require('./routes/admin'));
app.use('/api/onboarding',   require('./routes/onboarding'));
app.use('/api/generate',     require('./routes/generate'));
app.use('/api/brand',        require('./routes/brand'));
app.use('/api/interactions', require('./routes/interactions'));
app.use('/api/agent',        require('./routes/agent'));
app.use('/api/billing',      billingRouter);
app.use('/api/instagram',    require('./routes/instagram'));
app.use('/api/account',      require('./routes/account'));

const { router: rssRouter,     fetchAllFeeds }                              = require('./routes/rss');
const { router: scoringRouter, scoreForCompte, getBreakerState }            = require('./routes/scoring');
const { router: twitterRouter }  = require('./routes/twitter');
const { router: learningRouter } = require('./routes/learning');

app.use('/api/rss',      rssRouter);
app.use('/api/resumes',  require('./routes/resumes'));
app.use('/api/scoring',  scoringRouter);
app.use('/api/twitter',  twitterRouter);
app.use('/api/learning', learningRouter);
app.use('/api/hot',      require('./routes/hot'));

// ─── Démo publique de la landing (board de veille + génération sans compte) ──
const { router: demoRouter, refreshDemoVeille } = require('./routes/demo');
app.use('/api/demo', demoRouter);

// ─── Polling RSS toutes les 5 minutes — SANS Twitter (appels API gratuits) ───
const RSS_INTERVAL_MS = 5 * 60 * 1000;

async function rssLoop() {
  try {
    console.log('[RSS] Fetch…');
    const { count } = await fetchAllFeeds()
      .then(r => ({ count: r.reduce((s, x) => s + (x.inserted ?? 0), 0) }))
      .catch(err => { console.error('[RSS] erreur:', err.message); return { count: 0 }; });
    console.log(`[RSS] +${count} articles`);

    // Auto-score pour tous les comptes actifs après chaque fetch
    if (count > 0) {
      const { data: comptes } = await supabase.from('comptes').select('id, nom');
      for (const c of (comptes || [])) {
        scoreForCompte(c.id, 25, 24).catch(err => console.error(`[AutoScore] ${c.nom}: ${err.message}`));
      }
    }
  } catch (err) {
    console.error('[RSS] crash inattendu:', err.message);
  }
}

// ─── Twitter : loop automatique DÉSACTIVÉ — manuel uniquement via UI ─────────
// Raison : 34 sources × 20 tweets = 680 crédits/loop → 25k crédits cramés en 4h
// Le fetch Twitter se déclenche uniquement via POST /api/twitter/refresh depuis l'UI

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

// ─── Watchdog de coûts API : budgets/jour, solde OpenRouter, fallback Haiku ──
// Alerte en console + table cost_alerts (visible dans /admin). Seuils via env :
// BUDGET_ANTHROPIC_JOUR_USD, BUDGET_TOTAL_JOUR_USD, OPENROUTER_SOLDE_MIN_USD.
const { runCostWatchdog } = require('./lib/costWatchdog');
setTimeout(() => runCostWatchdog(getBreakerState), 30 * 1000);
setInterval(() => runCostWatchdog(getBreakerState), 60 * 60 * 1000);

// ─── Board de veille démo (landing) — rescoring + snapshot toutes les 10 min ─
const DEMO_VEILLE_INTERVAL_MS = 10 * 60 * 1000;
setTimeout(() => refreshDemoVeille(scoreForCompte), 20 * 1000); // premier passage juste après le boot
setInterval(() => refreshDemoVeille(scoreForCompte), DEMO_VEILLE_INTERVAL_MS);

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
