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
7. TWITTER SOURCES — Identifie les 10 meilleurs comptes Twitter/X à surveiller dans cette niche.
   Fais des recherches web : "meilleurs comptes Twitter [niche]", "best [niche] Twitter accounts journalists",
   "[niche] insider Twitter breaking news", "[niche] journalists Twitter verified".
   - FIABLES uniquement : journalistes vérifiés, médias officiels, insiders reconnus dans le milieu
   - RAPIDES : connus pour breaker l'info avant tout le monde dans leur domaine
   - SPÉCIALISÉS : experts de cette niche précise, pas des comptes généralistes
   - Ne retourne QUE des comptes avec fiabilite >= 7 sur 10
   - Pour chaque compte retourne exactement ce schéma :
     {"handle": string, "nom": string, "type": "insider|media_officiel|journaliste|club_officiel|aggregateur",
      "pourquoi": string, "vitesse": "breaking|rapide|analyse", "langue": string, "fiabilite": number}

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
  "comptes_twitter_sources": [{"handle": string, "nom": string, "type": string, "pourquoi": string, "vitesse": string, "langue": string, "fiabilite": number}],
  "score_confiance": number
}`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Tronque les vieux résultats de recherche pour borner les input tokens.
// web_search_20250305 retourne des blocs "web_search_tool_result" dans response.content.
// Après N recherches, l'historique dépasse facilement 30k tokens (limite org).
// On conserve les KEEP_RECENT derniers résultats complets, les anciens sont résumés.
const KEEP_RECENT = 4;
const TRUNCATE_TO = 350; // chars par vieux résultat

function pruneSearchHistory(msgs) {
  let seenResults = 0;
  // Parcourir à rebours pour identifier les N plus récents
  const recentSet = new WeakSet();
  for (let i = msgs.length - 1; i >= 0; i--) {
    const content = msgs[i].content;
    if (!Array.isArray(content)) continue;
    for (let j = content.length - 1; j >= 0; j--) {
      const b = content[j];
      if (b.type === 'web_search_tool_result') {
        seenResults++;
        if (seenResults <= KEEP_RECENT) recentSet.add(b);
      }
    }
  }
  if (seenResults <= KEEP_RECENT) return msgs; // rien à faire

  return msgs.map(msg => {
    if (!Array.isArray(msg.content)) return msg;
    const newContent = msg.content.map(b => {
      if (b.type !== 'web_search_tool_result' || recentSet.has(b)) return b;
      // Tronque les vieux résultats
      let summary;
      if (typeof b.content === 'string') {
        summary = b.content.slice(0, TRUNCATE_TO) + (b.content.length > TRUNCATE_TO ? '…' : '');
      } else if (Array.isArray(b.content)) {
        // Extrait le texte brut des blocs de contenu
        const text = b.content.map(c => c.text || c.content || '').join(' ').slice(0, TRUNCATE_TO);
        summary = text + '…';
      } else {
        summary = '[résultat tronqué]';
      }
      return { ...b, content: summary };
    });
    return { ...msg, content: newContent };
  });
}

// Retry avec backoff exponentiel sur les rate limits (429)
async function callWithRetry(client, params, maxRetries = 4) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.messages.create(params);
    } catch (err) {
      const isRateLimit = err.status === 429 || err.message?.includes('rate_limit');
      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt + 1) * 5000; // 10s, 20s, 40s
        console.warn(`[Agent 1] Rate limit — retry dans ${delay / 1000}s… (tentative ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
}

// ─── Boucle agentique Agent 1 ────────────────────────────────────────────────
async function runAgent1(url) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages = [{ role: 'user', content: `Analyse ce compte Instagram : ${url}` }];

  for (let i = 0; i < 12; i++) {
    if (i > 0) await sleep(2000); // 2s entre chaque appel

    const response = await callWithRetry(client, {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: SYSTEM_PROMPT,
      messages: pruneSearchHistory(messages), // historique élagué
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.filter(b => b.type === 'text').pop();
      if (!textBlock) throw new Error('Aucune réponse texte de Claude');
      const raw = textBlock.text.trim();

      // Extrait le JSON — supporte JSON brut, JSON dans markdown ```json...```, ou JSON avec texte parasite
      const patterns = [
        /```json\s*([\s\S]*?)\s*```/,   // ```json...```
        /```\s*([\{][\s\S]*?)\s*```/,   // ```{...}```
        /(\{[\s\S]*\})/,                // greedy {…}
      ];
      let parsed = null;
      for (const pat of patterns) {
        const m = raw.match(pat);
        if (m) {
          try { parsed = JSON.parse(m[1]); break; }
          catch (_) { /* essaie le pattern suivant */ }
        }
      }
      if (!parsed) {
        console.error('[Agent 1] Réponse sans JSON — raw (500 chars):', raw.slice(0, 500));
        throw new Error('Pas de JSON dans la réponse Claude');
      }
      return parsed;
    }

    if (response.stop_reason === 'tool_use') {
      // web_search_20250305 est server-side : les résultats sont déjà dans response.content
      // (web_search_tool_result blocks). On envoie juste un accusé de réception vide.
      const toolResults = response.content
        .filter(b => b.type === 'tool_use')
        .map(b => ({ type: 'tool_result', tool_use_id: b.id, content: '' }));
      if (toolResults.length > 0) messages.push({ role: 'user', content: toolResults });
    }

    if (response.stop_reason === 'max_tokens') {
      console.warn(`[Agent 1] max_tokens hit à l'itération ${i}`);
    }
  }

  throw new Error('Boucle agent dépassée (35 itérations)');
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
      user_id:                    req.body.user_id || null,
    };

    const { data, error } = await supabase
      .from('comptes')
      .upsert(row, { onConflict: 'instagram_url' })
      .select('id')
      .single();

    if (error) throw error;

    const compteId = data.id;

    // Sauvegarde des sources Twitter sélectionnées par l'utilisateur
    const twitterSourcesToSave = req.body.twitter_sources || [];
    if (twitterSourcesToSave.length > 0) {
      const tsRows = twitterSourcesToSave.map(s => ({
        compte_id: compteId,
        handle:    s.handle,
        nom:       s.nom    || null,
        type:      s.type   || null,
        pourquoi:  s.pourquoi || null,
        vitesse:   s.vitesse  || null,
        langue:    s.langue   || null,
        fiabilite: s.fiabilite ?? null,
        actif:     true,
      }));
      const { error: tsErr } = await supabase
        .from('twitter_sources')
        .upsert(tsRows, { onConflict: 'compte_id,handle' });
      if (tsErr) console.error('[Onboarding] twitter_sources save:', tsErr.message);
      else console.log(`[Onboarding] ${tsRows.length} source(s) Twitter sauvegardées`);
    }

    res.json({ compte_id: compteId });

    // Pipeline automatique en arrière-plan : RSS + Twitter sources → scoring
    setImmediate(async () => {
      try {
        console.log(`[Onboarding] Pipeline RSS+score pour ${row.nom} (${compteId})…`);
        const { fetchAllFeeds } = require('./rss');
        const { fetchTwitterSources } = require('./twitter');
        const { scoreForCompte } = require('./scoring');
        const [rssResults, twResults] = await Promise.all([
          fetchAllFeeds(),
          fetchTwitterSources(compteId),
        ]);
        const inserted = [...rssResults, ...twResults].reduce((s, r) => s + (r.inserted ?? 0), 0);
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
