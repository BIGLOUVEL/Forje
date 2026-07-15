const express    = require('express');
const Anthropic  = require('@anthropic-ai/sdk');
const { supabase }       = require('../lib/supabase');
const { track }          = require('../lib/costTracker');
const { filtrerNews }    = require('../lib/embeddings');

const router = express.Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Suivi scoring en cours (en mémoire) ─────────────────────────────────────
const _scoringStatus = new Map(); // compte_id → { running: boolean, startedAt: number }

// ─── Pré-filtre rapide par mots-clés (0 appel API) ───────────────────────────
function quickKeywordFilter(news, compte) {
  const kws = [
    compte.niche_principale,
    ...(compte.sous_niches || []),
    ...(compte.keywords_niche || []),
    ...(compte.sujets_toujours_traites || []),
  ].filter(Boolean).map(k => k.toLowerCase());

  const avoid = (compte.sujets_a_eviter || []).map(k => k.toLowerCase());

  // Pas assez de mots-clés pour filtrer → passe tout
  if (kws.length < 2) return { pass: news, quickExclu: [] };

  const pass = [], quickExclu = [];
  for (const n of news) {
    const text = ((n.titre || '') + ' ' + (n.description || '')).toLowerCase();
    const blocked = avoid.length && avoid.some(k => text.includes(k));
    if (blocked) { quickExclu.push(n); continue; }
    const relevant = kws.some(k => text.includes(k));
    if (relevant) pass.push(n); else quickExclu.push(n);
  }
  return { pass, quickExclu };
}

// ─── System prompt Agent 2 (injecté dynamiquement) ──────────────────────────
// Schéma volontairement minimal : la caption/le brief sont générés par le
// pipeline "Forjer" (/forge-from-article), pas au scoring. Seuls
// format_suggere et pourquoi_ce_score sont affichés dans l'UI du board.
function buildSystemPrompt(compte) {
  const arr = (v) => (Array.isArray(v) && v.length ? v.join(', ') : '—');
  const val = (v) => v || '—';

  return `Tu es l'agent de veille de ${val(compte.nom)}, média Instagram spécialisé en ${val(compte.niche_principale)}.

━━ PROFIL ÉDITORIAL ━━
Niche : ${val(compte.niche_principale)}
Sous-niches actives : ${arr(compte.sous_niches)}
Angle : ${val(compte.angle_editorial)}
Audience : ${val(compte.audience_age)}, ${val(compte.audience_type)}
Formats qui performent : ${arr(compte.formats_favoris)}
Formats réellement utilisés : ${arr(compte.formats_reellement_utilises)}
Fenêtre breaking : ${val(compte.fenetre_reaction_breaking)}
Fenêtre trending : ${val(compte.fenetre_reaction_trending)}
SUJETS À ÉVITER : ${arr(compte.sujets_a_eviter)}

━━ COMPORTEMENT APPRIS DU USER ━━
Sujets qu'il traite toujours : ${arr(compte.sujets_toujours_traites)}
Sujets qu'il ignore systématiquement : ${arr(compte.sujets_ignores_systematiquement)}
Sujets bonus : ${arr(compte.sujets_bonus)}
Sujets malus : ${arr(compte.sujets_malus)}

━━ AUDIENCE ━━
Topics qui génèrent le plus d'engagement : ${arr(compte.topics_engageants_concurrents)}
Émotions dominantes : ${arr(compte.emotions_dominantes_audience)}

━━ CONCURRENTS (pour évaluer l'originalité) ━━
${arr(compte.concurrents)}

━━ SCORING (0 à 10) ━━
1. Pertinence niche (0-3 pts) : 3=sous-niches actives, 2=adjacent, 1=généraliste, 0=hors niche
2. Timing (0-2 pts) : 2=breaking<30min, 1.5=trending<3h, 1=chaud du jour, 0=evergreen
3. Potentiel engagement (0-2 pts) : 2=polarisant/émotionnel, 1=intéressant neutre, 0=purement informatif
4. Originalité (0-1 pt) : 1=angle non vu chez les concurrents, 0=déjà traité partout
5. Bonus comportemental (-2 à +2) : +1 si sujets_bonus, +1 si format naturel, -1 si sujets_malus, -2 si sujets_ignores_systematiquement

Seuils : <5 exclure | 5-6.9 faible_priorite | 7-8.4 a_traiter | ≥8.5 urgent

━━ FORMAT DE SORTIE ━━
JSON valide uniquement, aucun texte autour :
{
  "resultats": [
    {
      "news_id": "string",
      "score_total": number,
      "score_detail": {
        "pertinence_niche": number,
        "timing": number,
        "potentiel_engagement": number,
        "originalite": number,
        "bonus_comportemental": number
      },
      "flag": "urgent|a_traiter|faible_priorite",
      "format_suggere": "Reel|Carrousel|Story|Post",
      "pourquoi_ce_score": "string, 1 phrase courte",
      "alerte_breaking": boolean,
      "alerte_message": "string|null"
    }
  ]
}
Sois concis : pourquoi_ce_score = 1 seule phrase courte, pas de champs supplémentaires.`;
}

// ─── Appel Agent 2 ────────────────────────────────────────────────────────────
// Le scoring passe par OpenRouter (modèle cheap, ~10x moins cher que Haiku) si
// OPENROUTER_API_KEY est défini. Fallback automatique sur Haiku (Anthropic) en
// cas d'erreur, de timeout ou de JSON invalide — le board ne casse jamais.
const SCORING_MODEL   = process.env.SCORING_MODEL || 'google/gemini-2.5-flash-lite';
const SCORING_TIMEOUT = 45_000;

function buildUserMessage(newsLot) {
  return JSON.stringify({
    instructions: 'Score ces news pour ce compte. Ne retourne que celles avec score ≥ 5.',
    news: newsLot.map(n => ({
      id:           n.id,
      titre:        n.titre,
      description:  n.description,
      source:       n.source,
      published_at: n.published_at,
      age_minutes:  Math.round((Date.now() - new Date(n.created_at).getTime()) / 60000),
    })),
  });
}

function parseAgent2Json(text) {
  const match = text.match(/(\{[\s\S]*\})/);
  if (!match) throw new Error('Pas de JSON dans la réponse Agent 2');
  try {
    return JSON.parse(match[1]);
  } catch (e) {
    // Tentative de récupération : extraire juste le tableau resultats
    const arrMatch = text.match(/"resultats"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
    if (arrMatch) {
      try { return { resultats: JSON.parse(arrMatch[1]) }; } catch {}
    }
    throw new Error(`JSON Agent 2 invalide : ${e.message}`);
  }
}

async function runOpenRouter(compte, newsLot) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(SCORING_TIMEOUT),
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type':  'application/json',
      'X-Title':       'Forje Studio - scoring veille',
    },
    body: JSON.stringify({
      model:      SCORING_MODEL,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(compte) },
        { role: 'user',   content: buildUserMessage(newsLot) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();

  if (data.choices?.[0]?.finish_reason === 'length') {
    console.warn(`[Agent 2] Réponse tronquée à max_tokens (lot ${newsLot.length} news) — les dernières news du lot peuvent être perdues`);
  }

  track({
    feature: 'scoring', model: SCORING_MODEL,
    inputTokens:  data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
    costUsd:      data.usage?.cost, // coût exact facturé par OpenRouter
    compteId: compte.id,
  });

  return parseAgent2Json(data.choices?.[0]?.message?.content || '');
}

async function runHaiku(compte, newsLot) {
  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 6000,
    system:     buildSystemPrompt(compte),
    messages:   [{ role: 'user', content: buildUserMessage(newsLot) }],
  });

  track({ feature: 'scoring', model: 'claude-haiku-4-5-20251001', inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens, compteId: compte.id });

  const text = response.content.find(b => b.type === 'text')?.text || '';
  return parseAgent2Json(text);
}

async function runAgent2(compte, newsLot) {
  if (process.env.OPENROUTER_API_KEY) {
    try {
      return await runOpenRouter(compte, newsLot);
    } catch (err) {
      console.error(`[Agent 2] OpenRouter (${SCORING_MODEL}) KO → fallback Haiku :`, err.message);
    }
  }
  return runHaiku(compte, newsLot);
}

// ─── INSERT résultats en DB ───────────────────────────────────────────────────
async function saveScores(compteId, resultats) {
  if (!resultats?.length) return 0;

  const rows = resultats.map(r => ({
    news_raw_id:              r.news_id,
    compte_id:                compteId,
    score_total:              r.score_total,
    score_pertinence_niche:   r.score_detail?.pertinence_niche,
    score_timing:             r.score_detail?.timing,
    score_potentiel_engagement: r.score_detail?.potentiel_engagement,
    score_originalite:        r.score_detail?.originalite,
    score_bonus_comportemental: r.score_detail?.bonus_comportemental,
    flag:                     r.flag,
    // format_suggere désormais à la racine (r.suggestion = compat ancien schéma)
    format_suggere:           r.format_suggere || r.suggestion?.format,
    pourquoi_ce_score:        r.pourquoi_ce_score,
    alerte_breaking:          r.alerte_breaking ?? false,
    alerte_message:           r.alerte_message,
  }));

  const { data, error } = await supabase.from('news_scored').insert(rows).select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

// ─── Pipeline complet pour un compte ─────────────────────────────────────────
async function scoreForCompte(compteId, batchSize = 25, windowHours = 24) {
  _scoringStatus.set(compteId, { running: true, startedAt: Date.now() });
  try {
    return await _scoreForCompteInner(compteId, batchSize, windowHours);
  } finally {
    _scoringStatus.set(compteId, { running: false });
  }
}

async function _scoreForCompteInner(compteId, batchSize, windowHours) {
  // Charger le profil
  const { data: compte, error: e1 } = await supabase
    .from('comptes').select('*').eq('id', compteId).single();
  if (e1) throw e1;

  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const { data: scored, error: e2 } = await supabase
    .from('news_scored').select('news_raw_id').eq('compte_id', compteId);
  if (e2) throw e2;

  const scoredIds = new Set((scored || []).map(s => s.news_raw_id));

  const { data: allNews, error: e3 } = await supabase
    .from('news_raw').select('*').gte('created_at', since)
    .order('created_at', { ascending: false }).limit(200);
  if (e3) throw e3;

  const unscored = (allNews || []).filter(n => !scoredIds.has(n.id));
  if (!unscored.length) return { scored: 0, skipped: 0 };

  // Filtre embeddings niveau 1+2 avant d'envoyer à Claude
  const pertinentes = await filtrerNews(unscored, compte).catch(err => {
    console.error('[Filtre] Erreur — passage de tout le lot:', err.message);
    return unscored;
  });

  // Marque les news filtrées comme 'exclu' pour ne pas les re-scorer
  const pertinentesIds = new Set(pertinentes.map(n => n.id));
  const filtrees = unscored.filter(n => !pertinentesIds.has(n.id));
  if (filtrees.length) {
    await supabase.from('news_scored').insert(
      filtrees.map(n => ({ news_raw_id: n.id, compte_id: compteId, flag: 'exclu', score_total: 0 }))
    );
  }

  if (!pertinentes.length) return { scored: 0, skipped: unscored.length };

  // Traite par lots de batchSize
  let totalScored = 0;
  for (let i = 0; i < pertinentes.length; i += batchSize) {
    const lot    = pertinentes.slice(i, i + batchSize);
    const result = await runAgent2(compte, lot);
    const saved  = await saveScores(compteId, result.resultats || []);
    totalScored += saved;

    // Marquer les articles rejetés (score < 5) pour éviter de les re-scorer
    const savedIds = new Set((result.resultats || []).map(r => r.news_id));
    const rejected = lot.filter(n => !savedIds.has(n.id));
    if (rejected.length) {
      await supabase.from('news_scored').insert(
        rejected.map(n => ({ news_raw_id: n.id, compte_id: compteId, flag: 'exclu', score_total: 0 }))
      );
    }
  }

  return { scored: totalScored, skipped: unscored.length - totalScored, filtered: filtrees.length };
}

// ─── GET /api/scoring/status — scoring en cours ? ────────────────────────────
router.get('/status', (req, res) => {
  const { compte_id } = req.query;
  if (!compte_id) return res.status(400).json({ error: 'compte_id manquant' });
  const s = _scoringStatus.get(compte_id);
  res.json({ running: !!(s && s.running), startedAt: s?.startedAt || null });
});

// ─── POST /api/scoring/run — déclenche le scoring pour un compte ──────────────
router.post('/run', async (req, res) => {
  const { compte_id } = req.body;
  if (!compte_id) return res.status(400).json({ error: 'compte_id manquant' });

  try {
    // Fenêtre 48h pour les runs manuels (vs 6h pour l'auto-score du RSS loop)
    const result = await scoreForCompte(compte_id, 25, 48);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[Agent 2]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/scoring/board — news scorées pour le board ──────────────────────
router.get('/board', async (req, res) => {
  const { compte_id, limit = 50, flag } = req.query;
  if (!compte_id) return res.status(400).json({ error: 'compte_id manquant' });

  try {
    let query = supabase
      .from('news_scored')
      .select('*, news_raw(*)')
      .eq('compte_id', compte_id)
      .neq('flag', 'exclu')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (flag) query = query.eq('flag', flag);

    const { data, error } = await query;
    if (error) throw error;

    // Séparer alertes breaking.
    // Le champ `alerte_breaking` du modèle est peu fiable (le modèle de scoring
    // cheap ne le renseigne quasi jamais). On le classe donc de façon
    // déterministe : actu forte (score ≥ 8.5) ET fraîche (publiée < 2h).
    // Le flag explicite du modèle reste honoré s'il existe.
    const BREAKING_MIN_SCORE = 8.5;
    const BREAKING_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2h
    const isBreaking = (n) => {
      if (n.alerte_breaking) return true;
      if ((n.score_total ?? 0) < BREAKING_MIN_SCORE) return false;
      const ts = n.news_raw?.published_at || n.news_raw?.created_at || n.created_at;
      const t = ts ? new Date(ts).getTime() : NaN;
      return Number.isFinite(t) && (Date.now() - t) < BREAKING_MAX_AGE_MS;
    };
    const breaking = (data || []).filter(isBreaking);
    const board    = (data || []).filter(n => !isBreaking(n));

    res.json({ breaking, board, total: data?.length ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, scoreForCompte, runAgent2 };
