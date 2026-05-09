const express    = require('express');
const Anthropic  = require('@anthropic-ai/sdk');
const { supabase } = require('../lib/supabase');

const router = express.Router();
const haiku  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const arr = (v) => Array.isArray(v) && v.length ? v.join(', ') : '—';

// ─── POST /api/resumes/generate ───────────────────────────────────────────────
router.post('/generate', async (req, res) => {
  const { news_scored_id, compte_id } = req.body;
  if (!news_scored_id || !compte_id) return res.status(400).json({ error: 'news_scored_id et compte_id requis' });

  try {
    const [{ data: scored }, { data: compte }] = await Promise.all([
      supabase.from('news_scored').select('*, news_raw(*)').eq('id', news_scored_id).single(),
      supabase.from('comptes').select('*').eq('id', compte_id).single(),
    ]);
    if (!scored || !compte) return res.status(404).json({ error: 'Introuvable' });

    const news = scored.news_raw;

    const userPrompt =
      `Génère un résumé enrichi de cette news :\n\n` +
      `Titre : ${news.titre}\n` +
      `Source : ${news.source}\n` +
      `URL : ${news.url}\n` +
      `Description : ${news.description || '—'}\n\n` +
      `Contexte du média :\n` +
      `Niche : ${compte.niche_principale || '—'}\n` +
      `Sous-niches : ${arr(compte.sous_niches)}\n` +
      `Audience : ${compte.audience_age || '—'}, ${compte.audience_type || '—'}\n\n` +
      `Retourne ce JSON exactement :\n` +
      `{\n` +
      `  "resume": "150-200 mots, ton neutre et factuel",\n` +
      `  "titre_optimise": "reformulation plus précise du titre",\n` +
      `  "chiffres_cles": ["chaque chiffre ou stat important"],\n` +
      `  "personnages": ["personnes ou entités impliquées"],\n` +
      `  "contexte_background": "2-3 phrases sur pourquoi cette info est importante maintenant",\n` +
      `  "angles_possibles": [{"angle": "nom", "description": "comment exploiter", "format_ideal": "Reel|Carrousel|Story|Post"}],\n` +
      `  "citations_utiles": ["citations directes trouvées"],\n` +
      `  "sources_consultees": ["URLs consultées"],\n` +
      `  "fenetre_editoriale": "combien de temps cette info reste exploitable",\n` +
      `  "liens_avec_actu": "connexions avec d'autres news récentes dans la niche"\n` +
      `}`;

    const messages = [{ role: 'user', content: userPrompt }];
    let finalText = null;

    for (let i = 0; i < 10; i++) {
      const resp = await haiku.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        tools:      [{ type: 'web_search_20250305', name: 'web_search' }],
        system:     'Tu es un assistant de veille éditoriale. Analyse la news fournie, cherche l\'article original et 2-3 sources complémentaires pour enrichir le contexte. Ton neutre, zéro opinion. Réponds UNIQUEMENT en JSON valide, aucun texte avant ou après.',
        messages,
      });

      messages.push({ role: 'assistant', content: resp.content });

      if (resp.stop_reason === 'end_turn') {
        const tb = resp.content.find(b => b.type === 'text');
        if (tb) finalText = tb.text;
        break;
      }
      if (resp.stop_reason === 'tool_use') {
        const results = resp.content
          .filter(b => b.type === 'tool_use')
          .map(b => ({ type: 'tool_result', tool_use_id: b.id, content: '' }));
        messages.push({ role: 'user', content: results });
      }
    }

    if (!finalText) throw new Error('Pas de réponse du modèle');

    const m = finalText.match(/\{[\s\S]*\}/);
    const resume = JSON.parse(m ? m[0] : finalText);

    const { data: inserted, error: e1 } = await supabase
      .from('resumes_enrichis')
      .insert({ news_scored_id, compte_id, ...resume })
      .select('id').single();
    if (e1) throw e1;

    await supabase.from('news_scored')
      .update({ has_resume: true, resume_id: inserted.id })
      .eq('id', news_scored_id);

    res.json({ ok: true, resume_id: inserted.id, resume });
  } catch (err) {
    console.error('[Resumes/Generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/resumes/:news_scored_id ─────────────────────────────────────────
router.get('/:news_scored_id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('resumes_enrichis').select('*')
      .eq('news_scored_id', req.params.news_scored_id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    res.json({ resume: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
