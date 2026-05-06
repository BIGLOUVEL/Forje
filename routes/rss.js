const express   = require('express');
const RSSParser = require('rss-parser');
const https     = require('https');
const { supabase } = require('../lib/supabase');

const NEWSMESH_KEY = process.env.NEWSMESH_API_KEY;

// ─── Fetch NewsMesh par query ─────────────────────────────────────────────────
async function fetchNewsMesh(query, category = null) {
  if (!NEWSMESH_KEY) return { source: 'NewsMesh', inserted: 0, skipped: 0 };
  try {
    let url = `https://api.newsmesh.co/v1/search?apiKey=${NEWSMESH_KEY}&q=${encodeURIComponent(query)}&limit=10&sortBy=date_descending`;
    if (category) url += `&category=${category}`;

    const data = await new Promise((resolve, reject) => {
      https.get(url, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
      }).on('error', reject).setTimeout(10000, function() { this.destroy(); reject(new Error('timeout')); });
    });

    const articles = data.data || [];
    if (!articles.length) return { source: 'NewsMesh', inserted: 0, skipped: 0 };

    const rows = articles
      .filter(a => a.link && a.title)
      .map(a => ({
        url:          a.link,
        source:       a.source || 'NewsMesh',
        titre:        a.title,
        description:  a.description || null,
        published_at: a.published_date ? new Date(a.published_date).toISOString() : null,
      }));

    const { data: inserted, error } = await supabase
      .from('news_raw')
      .upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
      .select('id');

    if (error) throw error;
    return { source: `NewsMesh:${query}`, inserted: inserted?.length ?? 0, skipped: rows.length - (inserted?.length ?? 0) };
  } catch (err) {
    console.error(`[NewsMesh] ${query}: ${err.message}`);
    return { source: `NewsMesh:${query}`, error: err.message };
  }
}

const router = express.Router();
const parser = new RSSParser({
  timeout: 10000,
  headers: {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control':   'no-cache',
  },
});

// ─── Feeds généraux ───────────────────────────────────────────────────────────
const DEFAULT_FEEDS = [
  // Presse FR
  { url: 'https://www.lemonde.fr/rss/une.xml',                            source: 'Le Monde' },
  { url: 'https://www.lefigaro.fr/rss/figaro_actualites.xml',             source: 'Le Figaro' },
  { url: 'https://www.lemonde.fr/international/rss_full.xml',             source: 'Le Monde International' },
  { url: 'https://feeds.leparisien.fr/leparisien/rss',                    source: 'Le Parisien' },
  { url: 'https://www.europe1.fr/rss.xml',                                source: 'Europe 1' },
  { url: 'https://www.bfmtv.com/rss/news-24-7/',                          source: 'BFMTV' },
  { url: 'https://www.france24.com/fr/rss',                               source: 'France 24' },
  { url: 'https://www.rfi.fr/fr/rss',                                     source: 'RFI' },
  // Presse internationale
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                   source: 'BBC News' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',        source: 'NYT World' },
  { url: 'https://www.theguardian.com/world/rss',                         source: 'The Guardian' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',                     source: 'Al Jazeera' },
  // Agrégateur dense — inclut dépêches AFP + Reuters
  { url: 'https://news.google.com/rss?hl=fr&gl=FR&ceid=FR:fr',            source: 'Google News FR' },
  // Tech
  { url: 'https://techcrunch.com/feed/',                                  source: 'TechCrunch' },
];

// ─── Feeds niche — matchés sur niche_principale et sources du compte ──────────
const NICHE_FEEDS = {
  football: [
    { url: 'https://www.lefigaro.fr/rss/figaro_sport.xml',                    source: 'Le Figaro Sport' },
    { url: 'https://rmcsport.bfmtv.com/rss/football/',                        source: 'RMC Sport Football' },
    { url: 'https://www.lemonde.fr/sport/rss_full.xml',                       source: 'Le Monde Sport' },
    { url: 'https://feeds.leparisien.fr/leparisien/rss/sports/football',      source: 'Le Parisien Football' },
  ],
  science: [
    { url: 'https://www.futura-sciences.com/rss/actualites.xml',              source: 'Futura Sciences' },
    { url: 'https://www.lemonde.fr/sciences/rss_full.xml',                    source: 'Le Monde Sciences' },
    { url: 'https://www.pourlascience.fr/rss.xml',                            source: 'Pour la Science' },
    { url: 'https://trustmyscience.com/feed/',                                source: 'Trust My Science' },
    { url: 'https://www.numerama.com/feed/',                                  source: 'Numerama' },
  ],
  culture: [
    { url: 'https://www.lesinrocks.com/feed/',                                source: 'Les Inrocks' },
    { url: 'https://www.lefigaro.fr/rss/figaro_culture.xml',                  source: 'Le Figaro Culture' },
    { url: 'https://www.lemonde.fr/culture/rss_full.xml',                     source: 'Le Monde Culture' },
  ],
  tech: [
    { url: 'https://www.theverge.com/rss/index.xml',                          source: 'The Verge' },
    { url: 'https://www.numerama.com/feed/',                                  source: 'Numerama' },
    { url: 'https://techcrunch.com/feed/',                                    source: 'TechCrunch' },
  ],
  business: [
    { url: 'https://www.bfmtv.com/rss/economie/',                             source: 'BFM Économie' },
    { url: 'https://www.lefigaro.fr/rss/figaro_economie.xml',                 source: 'Le Figaro Économie' },
    { url: 'https://www.lemonde.fr/economie/rss_full.xml',                    source: 'Le Monde Économie' },
  ],
};

// ─── Détecte les feeds niche pour un compte ───────────────────────────────────
function getNicheFeeds(compte) {
  const text = [
    compte.niche_principale,
    ...(compte.sous_niches          || []),
    ...(compte.keywords_niche       || []),
    ...(compte.sources_prioritaires || []),
    ...(compte.sources_secondaires  || []),
  ].join(' ').toLowerCase();

  const feeds = new Map();
  const add   = (list) => list.forEach(f => feeds.set(f.url, f));

  const match = (...terms) => terms.some(t => text.includes(t));

  if (match('foot', 'soccer', 'ligue', 'liga', 'premier league', 'transfert', 'équipe', 'rmc sport', 'ballon', 'match', 'buteur', 'mercato'))
    add(NICHE_FEEDS.football);

  if (match('scien', 'vulgar', 'espace', 'biolog', 'physique', 'recherche', 'nature', 'découverte', 'futura', 'astronomie', 'climate', 'médecin'))
    add(NICHE_FEEDS.science);

  if (match('culture', 'art', 'ciném', 'musique', 'série', 'film', 'expo', 'inrocks', 'télérama', 'spectacle', 'théâtre'))
    add(NICHE_FEEDS.culture);

  if (match('tech', 'ia ', 'intelligence artificielle', 'startup', 'digital', 'numérique', 'logiciel', 'appli', 'verge', 'techcrunch', 'gadget', 'web'))
    add(NICHE_FEEDS.tech);

  if (match('business', 'économi', 'finance', 'bourse', 'marché', 'investissement', 'entreprise', 'échos', 'capital', 'cac40'))
    add(NICHE_FEEDS.business);

  return [...feeds.values()];
}

// ─── Fetch + upsert un feed ───────────────────────────────────────────────────
async function fetchFeed({ url, source }) {
  try {
    const feed  = await parser.parseURL(url);
    const items = (feed.items || []).slice(0, 30);

    const rows = items
      .filter(item => item.link && item.title)
      .map(item => ({
        url:          item.link.trim(),
        source:       source || feed.title || 'RSS',
        titre:        item.title?.trim(),
        description:  item.contentSnippet?.trim() || item.summary?.trim() || null,
        published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
      }));

    if (!rows.length) return { source, inserted: 0, skipped: 0 };

    const { data, error } = await supabase
      .from('news_raw')
      .upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
      .select('id');

    if (error) throw error;
    return { source, inserted: data?.length ?? 0, skipped: rows.length - (data?.length ?? 0) };
  } catch (err) {
    console.error(`[RSS] ${source}: ${err.message}`);
    return { source, error: err.message };
  }
}

// ─── Fetch feeds généraux + feeds niche pour tous les comptes actifs ──────────
async function fetchAllFeeds(extraFeeds = []) {
  const { data: comptes } = await supabase
    .from('comptes')
    .select('niche_principale, sous_niches, keywords_niche, sources_prioritaires, sources_secondaires, sources_rss');

  const seen = new Set(DEFAULT_FEEDS.map(f => f.url));
  const customFeeds = [];
  const nicheFeeds  = [];

  for (const c of (comptes || [])) {
    // sources_rss découvertes par Agent 1 — priorité absolue
    for (const f of (c.sources_rss || [])) {
      if (f.url && !seen.has(f.url)) { customFeeds.push(f); seen.add(f.url); }
    }
    // fallback NICHE_FEEDS si pas de sources_rss
    for (const f of getNicheFeeds(c)) {
      if (!seen.has(f.url)) { nicheFeeds.push(f); seen.add(f.url); }
    }
  }

  const feeds   = [...DEFAULT_FEEDS, ...customFeeds, ...nicheFeeds, ...extraFeeds];
  const rssResults = await Promise.allSettled(feeds.map(fetchFeed));

  // NewsMesh : queries courtes (2-3 mots) déduites de la niche de chaque compte
  const newsMeshResults = [];
  if (NEWSMESH_KEY) {
    const NICHE_TO_QUERY = {
      foot: 'football soccer', sport: 'sport', scien: 'science discovery',
      tech: 'technology startup', ia: 'artificial intelligence AI',
      culture: 'cinema film series', cinéma: 'cinema film', streaming: 'netflix streaming series',
      musique: 'music album artist', business: 'business economy finance',
      santé: 'health wellness', mode: 'fashion style', gaming: 'gaming video games',
      'pop culture': 'entertainment pop culture', photo: 'photography art',
    };
    const nmQueries = new Set();
    for (const c of (comptes || [])) {
      const text = [c.niche_principale, ...(c.keywords_niche || [])].join(' ').toLowerCase();
      for (const [key, query] of Object.entries(NICHE_TO_QUERY)) {
        if (text.includes(key)) { nmQueries.add(query); break; }
      }
    }
    if (!nmQueries.size) nmQueries.add('breaking news');
    const nmFetches = await Promise.allSettled([...nmQueries].map(q => fetchNewsMesh(q)));
    nmFetches.forEach(r => newsMeshResults.push(r.status === 'fulfilled' ? r.value : { error: r.reason?.message }));
    const nmInserted = newsMeshResults.reduce((s, r) => s + (r.inserted ?? 0), 0);
    console.log(`[NewsMesh] ${nmQueries.size} queries → +${nmInserted} articles`);
  }

  return [
    ...rssResults.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message }),
    ...newsMeshResults,
  ];
}

// ─── GET /api/rss/fetch ───────────────────────────────────────────────────────
router.get('/fetch', async (req, res) => {
  try {
    const results = await fetchAllFeeds();
    const total   = results.reduce((s, r) => s + (r.inserted ?? 0), 0);
    const errors  = results.filter(r => r.error).length;
    res.json({ ok: true, feeds: results.length, new_articles: total, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/rss/news ────────────────────────────────────────────────────────
router.get('/news', async (req, res) => {
  const limit       = parseInt(req.query.limit) || 50;
  const compte_id   = req.query.compte_id || null;
  const source_type = req.query.source_type || null; // 'twitter' | null
  // Twitter : fenêtre 7j pour éviter de perdre les tweets quand RSS domine
  const windowMs    = source_type === 'twitter' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const since       = new Date(Date.now() - windowMs).toISOString();

  try {
    let query = supabase
      .from('news_raw')
      .select('id, url, source, titre, description, published_at, created_at')
      .gte('created_at', since)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (source_type === 'twitter') {
      query = query.like('source', '@%');
    }

    if (compte_id) {
      const { data: scored, error: e1 } = await supabase
        .from('news_scored').select('news_raw_id').eq('compte_id', compte_id)
        .gte('created_at', since);
      if (e1) throw e1;
      const scoredIds = (scored || []).map(s => s.news_raw_id);
      if (scoredIds.length) query = query.not('id', 'in', `(${scoredIds.join(',')})`);
    }

    const { data, error: e2 } = await query;
    if (e2) throw e2;
    res.json({ news: data, total: data.length, unscored: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/rss/refresh?compte_id=X — RSS sync + scoring en arrière-plan ───
router.get('/refresh', async (req, res) => {
  const { compte_id } = req.query;
  if (!compte_id) return res.status(400).json({ error: 'compte_id manquant' });

  try {
    // 1. Fetch RSS + Twitter en parallèle
    const { fetchAllTwitterAccounts, fetchTwitterSources } = require('./twitter');
    const [rssResults, twManualResults, twSourceResults] = await Promise.all([
      fetchAllFeeds(),
      fetchAllTwitterAccounts(compte_id),
      fetchTwitterSources(compte_id),
    ]);
    const inserted = [...rssResults, ...twManualResults, ...twSourceResults].reduce((s, r) => s + (r.inserted ?? 0), 0);

    // 2. Scoring en arrière-plan — ne bloque pas la réponse
    setImmediate(async () => {
      try {
        const { scoreForCompte } = require('./scoring');
        const scored = await scoreForCompte(compte_id);
        console.log(`[Refresh] ${compte_id} → +${scored.scored} scorés`);
      } catch (err) {
        console.error('[Refresh scoring]', err.message);
      }
    });

    res.json({ ok: true, new_articles: inserted, scoring: 'en_cours' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/rss/sources?compte_id=X — liste les sources RSS du compte ──────
router.get('/sources', async (req, res) => {
  const { compte_id } = req.query;
  if (!compte_id) return res.status(400).json({ error: 'compte_id manquant' });
  try {
    const { data, error } = await supabase
      .from('comptes')
      .select('sources_rss, sources_prioritaires, nom, instagram_url, twitter_accounts')
      .eq('id', compte_id)
      .single();
    if (error) throw error;
    res.json({ sources_rss: data.sources_rss || [], sources_noms: data.sources_prioritaires || [], nom: data.nom, instagram_url: data.instagram_url, twitter_accounts: data.twitter_accounts || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/rss/remove-source — supprime une source RSS du compte ──────────
router.post('/remove-source', async (req, res) => {
  const { compte_id, url } = req.body;
  if (!compte_id || !url) return res.status(400).json({ error: 'compte_id et url requis' });
  try {
    const { data: compte } = await supabase.from('comptes').select('sources_rss').eq('id', compte_id).single();
    const updated = (compte?.sources_rss || []).filter(f => f.url !== url);
    await supabase.from('comptes').update({ sources_rss: updated }).eq('id', compte_id);
    res.json({ ok: true, sources_rss: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/rss/add-source — ajoute une source manuellement (cherche RSS) ──
router.post('/add-source', async (req, res) => {
  const { compte_id, source_name } = req.body;
  if (!compte_id || !source_name) return res.status(400).json({ error: 'compte_id et source_name requis' });

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const messages = [{
      role: 'user',
      content: `Trouve l'URL du flux RSS pour "${source_name}". Cherche "${source_name} RSS feed" et "${source_name} flux RSS". Retourne UNIQUEMENT un objet JSON : {"url": "https://...", "source": "${source_name}"} ou {"error": "not_found"} si aucun flux trouvé.`,
    }];

    let rssEntry = null;
    for (let i = 0; i < 8; i++) {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages,
      });
      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') {
        const text = response.content.filter(b => b.type === 'text').pop()?.text?.trim();
        const match = text?.match(/(\{[\s\S]*?\})/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          if (!parsed.error && parsed.url) rssEntry = parsed;
        }
        break;
      }
      if (response.stop_reason === 'tool_use') {
        const results = response.content
          .filter(b => b.type === 'tool_use')
          .map(b => ({ type: 'tool_result', tool_use_id: b.id, content: '' }));
        messages.push({ role: 'user', content: results });
      }
    }

    if (!rssEntry) return res.status(404).json({ error: 'Flux RSS introuvable pour cette source' });

    // Tester que le feed est accessible
    try { await parser.parseURL(rssEntry.url); } catch (e) {
      return res.status(422).json({ error: `URL RSS invalide ou inaccessible : ${e.message}` });
    }

    // Ajouter à sources_rss du compte
    const { data: compte } = await supabase.from('comptes').select('sources_rss').eq('id', compte_id).single();
    const existing = compte?.sources_rss || [];
    if (existing.some(f => f.url === rssEntry.url)) {
      return res.json({ ok: true, already_exists: true, feed: rssEntry });
    }
    const updated = [...existing, rssEntry];
    await supabase.from('comptes').update({ sources_rss: updated }).eq('id', compte_id);

    // Fetch + score immédiatement
    await fetchFeed(rssEntry);
    const { scoreForCompte } = require('./scoring');
    const scored = await scoreForCompte(compte_id);

    res.json({ ok: true, feed: rssEntry, ...scored });
  } catch (err) {
    console.error('[add-source]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, fetchAllFeeds };
