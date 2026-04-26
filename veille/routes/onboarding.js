const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../lib/supabase');

const router = express.Router();

// ─── System prompt Agent 1 ───────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es un agent d'analyse de comptes Instagram pour un outil de veille éditoriale.
Tu reçois l'URL d'un compte Instagram public. Tu dois effectuer plusieurs recherches
web pour analyser ce compte en profondeur, puis retourner un JSON de profil complet.

RECHERCHES À EFFECTUER (dans cet ordre) :
1. Recherche directe du compte (nom, description, nb abonnés, posts récents)
2. Recherche "[nom du compte] Instagram" pour trouver des articles ou mentions
3. Recherche des 3-5 concurrents directs dans la même niche
4. Analyse des captions visibles pour déduire le ton éditorial
5. Analyse des commentaires visibles pour comprendre l'audience
6. CRITIQUE — Pour chaque source médiatique identifiée (sources_prioritaires + sources_secondaires),
   cherche son flux RSS avec web_search "[nom de la source] RSS feed" ou "[nom de la source] flux RSS".
   - Extrais l'URL RSS directe depuis les résultats (format .xml, /feed, /rss, etc.)
   - N'inclus une source dans sources_rss QUE si tu as trouvé une URL RSS valide
   - Cherche au minimum pour les 5 sources les plus importantes du compte

RÈGLES :
- Réponds UNIQUEMENT avec un objet JSON valide
- Aucun texte avant ou après, aucun markdown, aucune explication
- Si le compte est privé ou introuvable : {"error": "compte_introuvable"}
- Si données insuffisantes pour un champ : null
- score_confiance entre 0 et 1 selon la quantité d'infos trouvées

SCHÉMA DE SORTIE (uniquement les vraies données trouvées) :
{
  "instagram_url": string,
  "nom": string,
  "langue": string,
  "niche_principale": string,
  "sous_niches": string[],
  "ton": string,
  "angle_editorial": string,
  "niveau_expertise_audience": string,
  "references_culturelles": string[],
  "sujets_a_eviter": string[],
  "formats_favoris": string[],
  "ratio_contenu": string,
  "horaires_pic_engagement": string[],
  "fenetre_reaction_breaking": string,
  "fenetre_reaction_trending": string,
  "audience_age": string,
  "audience_type": string,
  "abonnes": number | null,
  "sources_prioritaires": string[],
  "sources_secondaires": string[],
  "sources_rss": [{"url": string, "source": string}],
  "concurrents": string[],
  "keywords_niche": string[],
  "hashtags_typiques": string[],
  "score_confiance": number
}`;

// ─── Boucle agentique Agent 1 ────────────────────────────────────────────────
async function runAgent1(url) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages = [{ role: 'user', content: `Analyse ce compte Instagram : ${url}` }];

  for (let i = 0; i < 25; i++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: SYSTEM_PROMPT,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.filter(b => b.type === 'text').pop();
      if (!textBlock) throw new Error('Aucune réponse texte de Claude');
      const raw = textBlock.text.trim();
      // Extract the first JSON object found (robuste face au texte parasite)
      const match = raw.match(/(\{[\s\S]*\})/);
      if (!match) throw new Error('Pas de JSON dans la réponse Claude');
      return JSON.parse(match[1]);
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = response.content
        .filter(b => b.type === 'tool_use')
        .map(b => ({ type: 'tool_result', tool_use_id: b.id, content: '' }));
      messages.push({ role: 'user', content: toolResults });
    }
  }

  throw new Error('Boucle agent dépassée (25 itérations)');
}

// ─── POST /api/onboarding/analyze ────────────────────────────────────────────
router.post('/analyze', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL manquante' });

  try {
    const profil = await runAgent1(url.trim());
    if (profil.error) return res.status(404).json({ error: profil.error });
    res.json({ profil });
  } catch (err) {
    console.error('[Agent 1]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/onboarding/save ───────────────────────────────────────────────
router.post('/save', async (req, res) => {
  const { profil } = req.body;
  if (!profil) return res.status(400).json({ error: 'Profil manquant' });

  try {
    const row = {
      instagram_url:              profil.instagram_url,
      nom:                        profil.nom,
      langue:                     profil.langue,
      niche_principale:           profil.niche_principale,
      sous_niches:                profil.sous_niches,
      ton:                        profil.ton,
      angle_editorial:            profil.angle_editorial,
      niveau_expertise_audience:  profil.niveau_expertise_audience,
      references_culturelles:     profil.references_culturelles,
      sujets_a_eviter:            profil.sujets_a_eviter,
      formats_favoris:            profil.formats_favoris,
      ratio_contenu:              profil.ratio_contenu,
      horaires_pic_engagement:    profil.horaires_pic_engagement,
      fenetre_reaction_breaking:  profil.fenetre_reaction_breaking,
      fenetre_reaction_trending:  profil.fenetre_reaction_trending,
      audience_age:               profil.audience_age,
      audience_type:              profil.audience_type,
      abonnes:                    profil.abonnes,
      sources_prioritaires:       profil.sources_prioritaires,
      sources_secondaires:        profil.sources_secondaires,
      concurrents:                profil.concurrents,
      keywords_niche:             profil.keywords_niche,
      hashtags_typiques:          profil.hashtags_typiques,
      sources_rss:                profil.sources_rss || [],
      score_confiance_onboarding: profil.score_confiance,
    };

    const { data, error } = await supabase
      .from('comptes')
      .upsert(row, { onConflict: 'instagram_url' })
      .select('id')
      .single();

    if (error) throw error;

    // Pipeline automatique en arrière-plan : RSS niche → scoring
    const compteId = data.id;
    res.json({ compte_id: compteId });

    setImmediate(async () => {
      try {
        console.log(`[Onboarding] Pipeline RSS+score pour ${row.nom} (${compteId})…`);
        const { fetchAllFeeds } = require('./rss');
        const { scoreForCompte } = require('./scoring');
        const results  = await fetchAllFeeds();
        const inserted = results.reduce((s, r) => s + (r.inserted ?? 0), 0);
        console.log(`[Onboarding] +${inserted} articles fetchés`);
        const scored = await scoreForCompte(compteId);
        console.log(`[Onboarding] ${row.nom} → +${scored.scored} scorés`);
      } catch (err) {
        console.error('[Onboarding pipeline]', err.message);
      }
    });

  } catch (err) {
    console.error('[Onboarding Save]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
