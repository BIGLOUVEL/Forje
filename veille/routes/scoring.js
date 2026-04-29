const express    = require('express');
const Anthropic  = require('@anthropic-ai/sdk');
const { supabase } = require('../lib/supabase');

const router = express.Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── System prompt Agent 2 (injecté dynamiquement) ──────────────────────────
function buildSystemPrompt(compte) {
  const arr = (v) => (Array.isArray(v) && v.length ? v.join(', ') : '—');
  const val = (v) => v || '—';

  return `Tu es l'agent de veille de ${val(compte.nom)}, média Instagram spécialisé en ${val(compte.niche_principale)}.

━━ PROFIL ÉDITORIAL ━━
Niche : ${val(compte.niche_principale)}
Sous-niches actives : ${arr(compte.sous_niches)}
Ton : ${val(compte.ton)}
Angle : ${val(compte.angle_editorial)}
Audience : ${val(compte.audience_age)}, ${val(compte.audience_type)}
Niveau expertise audience : ${val(compte.niveau_expertise_audience)}
Références culturelles : ${arr(compte.references_culturelles)}
Formats qui performent : ${arr(compte.formats_favoris)}
Ratio éditorial : ${val(compte.ratio_contenu)}
Fenêtre breaking : ${val(compte.fenetre_reaction_breaking)}
Fenêtre trending : ${val(compte.fenetre_reaction_trending)}
Créneaux engagement : ${arr(compte.horaires_pic_engagement)}
SUJETS À ÉVITER : ${arr(compte.sujets_a_eviter)}

━━ CE QUE TU AS APPRIS DE CE USER ━━
Formats qu'il utilise vraiment : ${arr(compte.formats_reellement_utilises)}
Sujets qu'il traite toujours : ${arr(compte.sujets_toujours_traites)}
Sujets qu'il ignore systématiquement : ${arr(compte.sujets_ignores_systematiquement)}
Il modifie les captions pour : ${arr(compte.modifications_frequentes)}
Taux utilisation captions brutes : ${Math.round((compte.taux_utilisation_captions_brutes || 0) * 100)}%
Score moyen news qu'il poste : ${val(compte.score_moyen_news_postees)}
Score moyen news qu'il ignore : ${val(compte.score_moyen_news_ignorees)}
Sujets bonus (toujours traités) : ${arr(compte.sujets_bonus)}
Sujets malus (toujours ignorés) : ${arr(compte.sujets_malus)}

━━ CE QUE TU AS APPRIS DE L'AUDIENCE VIA LES COMMENTAIRES ━━
Topics qui génèrent le plus d'engagement : ${arr(compte.topics_engageants_concurrents)}
Émotions dominantes de l'audience : ${arr(compte.emotions_dominantes_audience)}
Questions fréquentes posées en commentaires : ${arr(compte.questions_frequentes_audience)}
Vocabulaire et expressions de l'audience : ${arr(compte.vocabulaire_audience)}
Intègre ces insights dans tes captions.

━━ CONCURRENTS (pour évaluer l'originalité) ━━
${arr(compte.concurrents)}

━━ SCORING (0 à 10) ━━
1. Pertinence niche (0-3 pts) : 3=sous-niches actives, 2=adjacent, 1=généraliste, 0=hors niche
2. Timing (0-2 pts) : 2=breaking<30min, 1.5=trending<3h, 1=chaud du jour, 0=evergreen
3. Potentiel engagement (0-2 pts) : 2=polarisant/émotionnel, 1=intéressant neutre, 0=purement informatif
4. Originalité (0-1 pt) : 1=angle non vu chez les concurrents, 0=déjà traité partout
5. Bonus comportemental (-2 à +2) : +1 si sujets_bonus, +1 si format naturel, -1 si sujets_malus, -2 si sujets_ignores_systematiquement

Seuils : <5 exclure | 5-6.9 faible_priorite | 7-8.4 a_traiter | ≥8.5 urgent

━━ CAPTIONS (urgent ≥ 8.5 uniquement) ━━
- Pour les articles flag="urgent" SEULEMENT, génère une caption. Les autres : caption=null.
- Ton : ${val(compte.ton)}
- Jamais de langue de bois, angle spécifique
- Utilise le vocabulaire naturel de l'audience : ${arr(compte.vocabulaire_audience)}
- ${(compte.modifications_frequentes || []).includes('raccourcissement') ? 'Génère déjà COURT (user raccourcit souvent)' : ''}
- ${(compte.modifications_frequentes || []).includes('ajout_humour') ? 'Intègre de l\'humour directement' : ''}
- Termine par une question ou un CTA implicite

━━ FORMAT DE SORTIE ━━
JSON valide uniquement, aucun texte autour :
{
  "timestamp_analyse": "ISO8601",
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
      "fenetre": {
        "age_news_minutes": number,
        "temps_restant_minutes": number,
        "code_couleur": "🟢|🟡|🔴"
      },
      "suggestion": {
        "format": "Reel|Carrousel|Story|Post",
        "raison_format": "string",
        "caption": "string|null",
        "hashtags": ["string"],
        "angle": "string",
        "timing_optimal": "string"
      },
      "pourquoi_ce_score": "string max 2 phrases",
      "alerte_breaking": boolean,
      "alerte_message": "string|null"
    }
  ],
  "signaux_tendances": [
    { "keyword": "string", "intensite": number, "tendance": "montante|stable|descendante", "depuis_minutes": number }
  ],
  "meta": {
    "news_analysees": number,
    "news_retenues": number,
    "news_filtrees": number,
    "raison_filtrage_principale": "string"
  }
}`;
}

// ─── Appel Agent 2 ────────────────────────────────────────────────────────────
async function runAgent2(compte, newsLot) {
  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: [{ type: 'text', text: buildSystemPrompt(compte), cache_control: { type: 'ephemeral' } }],
    messages: [{
      role:    'user',
      content: JSON.stringify({
        instructions: 'Score ces news pour ce compte. Ne retourne que celles avec score ≥ 5.',
        news: newsLot.map(n => ({
          id:           n.id,
          titre:        n.titre,
          description:  n.description,
          source:       n.source,
          published_at: n.published_at,
          age_minutes:  Math.round((Date.now() - new Date(n.created_at).getTime()) / 60000),
        })),
      }),
    }],
  });

  const text = response.content.find(b => b.type === 'text')?.text || '';
  const match = text.match(/(\{[\s\S]*\})/);
  if (!match) throw new Error('Pas de JSON dans la réponse Agent 2');
  try {
    return JSON.parse(match[1]);
  } catch (e) {
    // Tentative de récupération : extraire juste le tableau resultats
    const arrMatch = text.match(/"resultats"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
    if (arrMatch) {
      try { return { resultats: JSON.parse(arrMatch[1]), signaux_tendances: [], meta: {} }; } catch {}
    }
    throw new Error(`JSON Agent 2 invalide : ${e.message}`);
  }
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
    fenetre_age_minutes:      r.fenetre?.age_news_minutes,
    fenetre_temps_restant_minutes: r.fenetre?.temps_restant_minutes,
    fenetre_code_couleur:     r.fenetre?.code_couleur,
    format_suggere:           r.suggestion?.format,
    raison_format:            r.suggestion?.raison_format,
    caption:                  r.suggestion?.caption,
    hashtags:                 r.suggestion?.hashtags,
    angle:                    r.suggestion?.angle,
    timing_optimal:           r.suggestion?.timing_optimal,
    pourquoi_ce_score:        r.pourquoi_ce_score,
    alerte_breaking:          r.alerte_breaking ?? false,
    alerte_message:           r.alerte_message,
  }));

  const { data, error } = await supabase.from('news_scored').insert(rows).select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

// ─── Pipeline complet pour un compte ─────────────────────────────────────────
async function scoreForCompte(compteId, batchSize = 10) {
  // Charger le profil
  const { data: compte, error: e1 } = await supabase
    .from('comptes').select('*').eq('id', compteId).single();
  if (e1) throw e1;

  // News non encore scorées pour ce compte (dernières 24h)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: scored, error: e2 } = await supabase
    .from('news_scored').select('news_raw_id').eq('compte_id', compteId);
  if (e2) throw e2;

  const scoredIds = new Set((scored || []).map(s => s.news_raw_id));

  const { data: allNews, error: e3 } = await supabase
    .from('news_raw').select('*').gte('created_at', since)
    .order('created_at', { ascending: false }).limit(100);
  if (e3) throw e3;

  const unscored = (allNews || []).filter(n => !scoredIds.has(n.id));
  if (!unscored.length) return { scored: 0, skipped: 0 };

  // Traite par lots de batchSize
  let totalScored = 0;
  for (let i = 0; i < unscored.length; i += batchSize) {
    const lot    = unscored.slice(i, i + batchSize);
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

  return { scored: totalScored, skipped: unscored.length - totalScored };
}

// ─── POST /api/scoring/run — déclenche le scoring pour un compte ──────────────
router.post('/run', async (req, res) => {
  const { compte_id } = req.body;
  if (!compte_id) return res.status(400).json({ error: 'compte_id manquant' });

  try {
    const result = await scoreForCompte(compte_id);
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

    // Séparer alertes breaking
    const breaking = (data || []).filter(n => n.alerte_breaking);
    const board    = (data || []).filter(n => !n.alerte_breaking);

    res.json({ breaking, board, total: data?.length ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, scoreForCompte };
