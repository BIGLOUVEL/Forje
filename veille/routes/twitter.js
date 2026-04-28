const express = require('express');
const https   = require('https');
const { supabase } = require('../lib/supabase');

const TWITTER_KEY = process.env.TWITTERAPI_IO_KEY;
const router = express.Router();

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function twitterGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.twitterapi.io', path, headers: { 'X-API-Key': TWITTER_KEY } },
      res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error(`JSON parse error: ${body.slice(0, 100)}`)); }
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
    .select('handle')
    .eq('compte_id', compteId)
    .eq('actif', true);

  if (!sources?.length) return [];

  const results = [];
  const windowMs = 2 * 60 * 60 * 1000; // 2h pour ne pas louper de tweets entre deux polls

  for (const { handle } of sources) {
    try {
      const data   = await twitterGet(`/twitter/user/last_tweets?userName=${encodeURIComponent(handle)}`);
      const tweets = data.tweets || data.data?.tweets || [];

      const recent = tweets.filter(t => {
        const ts = t.createdAt || t.created_at;
        return ts && Date.now() - new Date(ts).getTime() < windowMs;
      });

      if (!recent.length) { results.push({ source: `@${handle}`, inserted: 0, skipped: 0 }); continue; }

      const rows = recent.map(t => {
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
      }

      results.push({ source: `@${handle}`, inserted: n, skipped: rows.length - n });
    } catch (err) {
      console.error(`[TwitterSources] @${handle}: ${err.message}`);
      results.push({ source: `@${handle}`, error: err.message });
    }
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

module.exports = { router, fetchAllTwitterAccounts, fetchTwitterSources, evaluateTwitterSources };
