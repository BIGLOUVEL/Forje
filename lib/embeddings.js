'use strict';
const { VoyageAIClient } = require('voyageai');
const { supabase }       = require('./supabase');

const VOYAGE_KEY      = process.env.VOYAGE_API_KEY;
const OPENROUTER_KEY  = process.env.OPENROUTER_API_KEY;
const VOYAGE_MODEL    = 'voyage-3';
const OPENROUTER_MODEL = 'google/gemini-2.0-flash-exp:free';

const voyage = VOYAGE_KEY ? new VoyageAIClient({ apiKey: VOYAGE_KEY }) : null;

// ─── Seuils ──────────────────────────────────────────────────────────────────
const SEUIL_PERTINENT = 0.65;  // passe directement
const SEUIL_AMBIGU    = 0.45;  // passe au niveau 2
// < SEUIL_AMBIGU → éliminé

// ─── Cache embeddings profil (invalidé après mise à jour profil) ─────────────
const _profilCache = new Map(); // compteId → Float32Array

function invalidateEmbeddingCache(compteId) {
  _profilCache.delete(compteId);
}

async function getProfilVecteur(compte) {
  if (_profilCache.has(compte.id)) return _profilCache.get(compte.id);

  const texte = [
    compte.niche_principale,
    ...(compte.sous_niches        || []),
    ...(compte.keywords_niche     || []),
    ...(compte.sources_prioritaires || []),
  ].filter(Boolean).join(' ');

  const res    = await voyage.embed({ input: texte, model: VOYAGE_MODEL });
  const vecteur = res.data[0].embedding;
  _profilCache.set(compte.id, vecteur);
  return vecteur;
}

// ─── Cosine similarity ───────────────────────────────────────────────────────
function cosineSimilarity(a, b) {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  if (!ma || !mb) return 0;
  return dot / (Math.sqrt(ma) * Math.sqrt(mb));
}

// ─── Niveau 1 : batch embeddings Voyage AI ──────────────────────────────────
async function filtrerLotNiveau1(newsItems, compte) {
  if (!voyage) {
    // Voyage non configuré → tout passe (pas de filtrage)
    return newsItems.map(news => ({ news, score: 1, passe: true }));
  }

  const profilVecteur = await getProfilVecteur(compte);

  const textes = newsItems.map(n =>
    `${n.titre || ''} ${n.description || ''}`.trim().slice(0, 2000)
  );

  const res = await voyage.embed({ input: textes, model: VOYAGE_MODEL });

  return newsItems.map((news, i) => {
    const score = cosineSimilarity(res.data[i].embedding, profilVecteur);
    return {
      news,
      score,
      passe: score >= SEUIL_PERTINENT ? true
           : score >= SEUIL_AMBIGU    ? null
           : false,
    };
  });
}

// ─── Niveau 2 : classificateur OpenRouter (Gemini Flash gratuit) ─────────────
async function filtreNiveau2(news, compte) {
  if (!OPENROUTER_KEY) return true; // pas configuré → laisse passer

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer':  'https://forje.app',
      'X-Title':       'Forje Veille',
    },
    body: JSON.stringify({
      model:      OPENROUTER_MODEL,
      max_tokens: 5,
      messages: [
        {
          role:    'system',
          content: 'Tu es un filtre de pertinence pour un média Instagram. Réponds UNIQUEMENT par OUI ou NON, rien d\'autre.',
        },
        {
          role: 'user',
          content: `Média spécialisé en : ${compte.niche_principale}
Sous-niches : ${(compte.sous_niches || []).join(', ')}
News : "${news.titre}"
Cette news peut-elle intéresser ce média ? OUI ou NON`,
        },
      ],
    }),
  });

  if (!res.ok) return true; // erreur → laisse passer
  const data    = await res.json();
  const reponse = (data?.choices?.[0]?.message?.content || '').trim().toUpperCase();
  return reponse === 'OUI';
}

// ─── Pipeline complet : niveau 1 + niveau 2 ──────────────────────────────────
async function filtrerNews(newsItems, compte) {
  if (!newsItems?.length) return [];

  const t0 = Date.now();

  // Niveau 1 : batch Voyage AI
  const resultats1 = await filtrerLotNiveau1(newsItems, compte);

  const pertinents  = [];
  const ambigus     = [];
  const filtres1    = [];

  for (const r of resultats1) {
    if (r.passe === true)  pertinents.push(r.news);
    else if (r.passe === null) ambigus.push(r.news);
    else                   filtres1.push(r.news);
  }

  // Niveau 2 : OpenRouter sur les ambigus, par lots de 5 en parallèle
  const filtres2    = [];
  const pertinents2 = [];

  for (let i = 0; i < ambigus.length; i += 5) {
    const lot = ambigus.slice(i, i + 5);
    const res = await Promise.all(
      lot.map(async n => ({ news: n, ok: await filtreNiveau2(n, compte).catch(() => true) }))
    );
    for (const { news, ok } of res) {
      if (ok) pertinents2.push(news);
      else    filtres2.push(news);
    }
  }

  // Log batch stats
  const total      = newsItems.length;
  const p1         = pertinents.length;
  const p2         = pertinents2.length;
  const f1         = filtres1.length;
  const f2         = filtres2.length;
  const taux       = total > 0 ? +((f1 + f2) / total * 100).toFixed(1) : 0;
  const duree_ms   = Date.now() - t0;

  supabase.from('filtre_stats').insert({
    compte_id: compte.id, total, passes_niveau1: p1, passes_niveau2: p2,
    filtrees_niveau1: f1, filtrees_niveau2: f2, taux_filtrage: taux, duree_ms,
  }).then(() => {}).catch(() => {});

  const final = [...pertinents, ...pertinents2];
  console.log(`[Filtre] ${compte.nom} — ${total} news → ${final.length} pertinentes (${taux}% filtrées) en ${duree_ms}ms`);
  return final;
}

module.exports = { filtrerNews, invalidateEmbeddingCache };
