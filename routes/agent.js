const express    = require('express');
const { supabase } = require('../lib/supabase');
const { track }  = require('../lib/costTracker');

const router = express.Router();

const arr = (v) => (Array.isArray(v) && v.length ? v.join(', ') : '—');
const val = (v) => v || '—';

router.post('/chat', async (req, res) => {
  const { message, compte_id, conversation_history = [] } = req.body;
  if (!message || !compte_id) return res.status(400).json({ error: 'message et compte_id requis' });

  try {
    const { data: compte, error: e1 } = await supabase
      .from('comptes').select('*').eq('id', compte_id).single();
    if (e1) throw e1;

    const [{ data: recentNews }, { data: recentResumes }] = await Promise.all([
      supabase.from('news_scored').select('*, news_raw(*)')
        .eq('compte_id', compte_id).neq('flag', 'exclu')
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('resumes_enrichis').select('titre_optimise, resume, angles_possibles')
        .eq('compte_id', compte_id)
        .order('created_at', { ascending: false }).limit(5),
    ]);

    const newsLines = (recentNews || [])
      .map(n => `- ${n.news_raw?.titre || '?'} (${n.news_raw?.source || '?'}, score: ${n.score_total})`)
      .join('\n') || '— Aucune news scorée pour l\'instant —';

    const resumeLines = (recentResumes || []).length > 0
      ? '\n\n━━ RÉSUMÉS ENRICHIS DISPONIBLES (utilise-les si la question est liée) ━━\n' +
        recentResumes.map(r => `- ${r.titre_optimise} : ${r.resume}`).join('\n')
      : '';

    const systemPrompt = `Tu es l'agent personnel de ${val(compte.nom)}, un média Instagram spécialisé en ${val(compte.niche_principale)}.
Tu réponds aux demandes du créateur de contenu en temps réel.
Tu as accès au web via web_search et tu connais parfaitement ce compte.

━━ PROFIL DU COMPTE ━━
Niche : ${val(compte.niche_principale)}
Sous-niches : ${arr(compte.sous_niches)}
Ton : ${val(compte.ton)}
Angle éditorial : ${val(compte.angle_editorial)}
Audience : ${val(compte.audience_age)}, ${val(compte.audience_type)}
Formats favoris : ${arr(compte.formats_favoris)}
Sujets toujours traités : ${arr(compte.sujets_toujours_traites)}
Vocabulaire audience : ${arr(compte.vocabulaire_audience)}
Références culturelles : ${arr(compte.references_culturelles)}
Hashtags typiques : ${arr(compte.hashtags_typiques)}

━━ NEWS DÉJÀ DANS LE BOARD ━━
${newsLines}${resumeLines}

━━ TON COMPORTEMENT ━━
- Tu es direct et actionnable, pas verbeux
- Tu cherches sur le web AVANT de répondre quand c'est une demande d'actualité
- Tu génères des captions prêtes à copier, pas des suggestions vagues
- Tu précises toujours le format recommandé (Reel/Carrousel/Story/Post)
- Tu indiques la fenêtre d'opportunité si c'est du breaking
- Tu t'adaptes au ton du compte dans toutes tes captions
- Si la demande est vague, tu proposes 3 options différentes

━━ FORMAT DE RÉPONSE (JSON strict, aucun texte autour) ━━
{
  "message": "string",
  "items": [
    {
      "titre": "string",
      "source": "string",
      "url": "string|null",
      "age": "string",
      "format": "Reel|Carrousel|Story|Post",
      "caption": "string",
      "hashtags": ["string"],
      "fenetre": "string|null",
      "hype_score": number|null
    }
  ],
  "suggestion_suivante": "string|null"
}
Si la demande ne nécessite pas de news : items = [].`;

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: systemPrompt,
        messages: [
          ...conversation_history,
          { role: 'user', content: message },
        ],
      }),
    });

    const data = await apiRes.json();
    if (!apiRes.ok) throw new Error(data.error?.message || 'Erreur API Anthropic');

    track({ feature: 'agent_chat', model: 'claude-sonnet-4-6', inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens, compteId: compte_id });
    const searches = (data.content || []).filter(b => b.type === 'tool_use').length;
    for (let i = 0; i < searches; i++) track({ feature: 'agent_chat_search', model: 'web_search', compteId: compte_id });

    const textBlock = data.content?.find(b => b.type === 'text');
    if (!textBlock) throw new Error('Pas de réponse texte de l\'agent');

    let parsed;
    try {
      const match = textBlock.text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : textBlock.text);
    } catch {
      parsed = { message: textBlock.text, items: [], suggestion_suivante: null };
    }

    res.json({ ok: true, response: parsed });
  } catch (err) {
    console.error('[Agent Chat]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
