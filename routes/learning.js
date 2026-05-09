const express   = require('express');
const Anthropic  = require('@anthropic-ai/sdk');
const { supabase } = require('../lib/supabase');
const { track } = require('../lib/costTracker');

const router = express.Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Tu es un agent d'apprentissage comportemental pour un outil de veille Instagram.
Tu reçois les données d'interaction d'un utilisateur avec son board de veille (opens, dismisses, copies, generates)
ainsi que le profil éditorial actuel du compte.

Ton rôle : analyser les patterns comportementaux et mettre à jour les champs d'apprentissage du profil.

RÈGLES :
- Réponds UNIQUEMENT avec un objet JSON valide, aucun texte autour
- N'invente pas de sujets — déduis-les uniquement des titres de news observés
- Si tu manques de données pour un champ, retourne null (pas de tableau vide)
- Les tableaux doivent contenir des strings concises (2-4 mots max par item)
- score_moyen_news_postees et score_moyen_news_ignorees : 1 décimale max

SCHÉMA DE SORTIE :
{
  "sujets_toujours_traites": string[] | null,
  "sujets_ignores_systematiquement": string[] | null,
  "formats_reellement_utilises": string[] | null,
  "score_moyen_news_postees": number | null,
  "score_moyen_news_ignorees": number | null,
  "taux_utilisation_captions_brutes": number | null,
  "modifications_frequentes": string[] | null,
  "sujets_bonus": string[] | null,
  "sujets_malus": string[] | null,
  "analyse": "string max 2 phrases"
}`;

// ─── Collecte les données d'interactions enrichies ────────────────────────────
async function buildLearningPayload(compteId, limit = 100) {
  const [compteRes, interactionsRes] = await Promise.all([
    supabase.from('comptes').select('*').eq('id', compteId).single(),
    supabase
      .from('interactions')
      .select('action, format_utilise, caption_modifiee, modification_type, news_scored(score_total, flag, pourquoi_ce_score, news_raw(titre, source))')
      .eq('compte_id', compteId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  if (compteRes.error) throw compteRes.error;
  if (interactionsRes.error) throw interactionsRes.error;

  const data     = interactionsRes.data || [];
  const opened   = data.filter(r => r.action === 'open');
  const dismissed = data.filter(r => r.action === 'dismiss');
  const copied   = data.filter(r => r.action === 'copy');
  const generated = data.filter(r => r.action === 'generate');

  const avg = (nums) => {
    const v = nums.filter(n => n != null);
    return v.length ? Math.round(v.reduce((s, n) => s + n, 0) / v.length * 10) / 10 : null;
  };

  return {
    compte_profil: {
      niche_principale: compteRes.data.niche_principale,
      sous_niches: compteRes.data.sous_niches,
      ton: compteRes.data.ton,
      formats_favoris: compteRes.data.formats_favoris,
      sujets_a_eviter: compteRes.data.sujets_a_eviter,
    },
    stats: {
      total_interactions: data.length,
      by_action: { open: opened.length, dismiss: dismissed.length, copy: copied.length, generate: generated.length },
      avg_score_opened: avg(opened.map(r => r.news_scored?.score_total)),
      avg_score_dismissed: avg(dismissed.map(r => r.news_scored?.score_total)),
      formats_generes: generated.reduce((acc, r) => { if (r.format_utilise) acc[r.format_utilise] = (acc[r.format_utilise] || 0) + 1; return acc; }, {}),
      caption_modifiee_rate: copied.length ? Math.round(copied.filter(r => r.caption_modifiee).length / copied.length * 100) / 100 : null,
    },
    news_ouvertes: opened.slice(0, 30).map(r => ({
      titre: r.news_scored?.news_raw?.titre,
      source: r.news_scored?.news_raw?.source,
      score: r.news_scored?.score_total,
      flag: r.news_scored?.flag,
    })).filter(r => r.titre),
    news_ignorees: dismissed.slice(0, 30).map(r => ({
      titre: r.news_scored?.news_raw?.titre,
      score: r.news_scored?.score_total,
      flag: r.news_scored?.flag,
    })).filter(r => r.titre),
  };
}

// ─── Appel Agent 3 (Haiku) ────────────────────────────────────────────────────
async function runAgent3(compteId) {
  const payload = await buildLearningPayload(compteId);

  if (payload.stats.total_interactions < 5) {
    return { skipped: true, reason: 'Pas assez de données (<5 interactions)' };
  }

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system:     SYSTEM_PROMPT,
    messages: [{
      role:    'user',
      content: JSON.stringify(payload),
    }],
  });

  track({ feature: 'learning', model: 'claude-haiku-4-5-20251001', inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens, compteId });

  const text  = response.content.find(b => b.type === 'text')?.text || '';
  const match = text.match(/(\{[\s\S]*\})/);
  if (!match) throw new Error('Pas de JSON dans la réponse Agent 3');
  const learned = JSON.parse(match[1]);

  // Patch uniquement les champs non-null retournés par l'agent
  const patch = {};
  const fields = [
    'sujets_toujours_traites','sujets_ignores_systematiquement','formats_reellement_utilises',
    'score_moyen_news_postees','score_moyen_news_ignorees','taux_utilisation_captions_brutes',
    'modifications_frequentes','sujets_bonus','sujets_malus',
  ];
  for (const f of fields) {
    if (learned[f] != null) patch[f] = learned[f];
  }

  if (Object.keys(patch).length) {
    const { error } = await supabase.from('comptes').update(patch).eq('id', compteId);
    if (error) throw error;
  }

  console.log(`[Agent 3] Compte ${compteId} — ${Object.keys(patch).length} champs mis à jour. ${learned.analyse}`);
  return { updated: Object.keys(patch).length, analyse: learned.analyse, patch };
}

// ─── POST /api/learning/run ───────────────────────────────────────────────────
router.post('/run', async (req, res) => {
  const { compte_id } = req.body;
  if (!compte_id) return res.status(400).json({ error: 'compte_id manquant' });

  try {
    const result = await runAgent3(compte_id);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[Agent 3]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, runAgent3 };
