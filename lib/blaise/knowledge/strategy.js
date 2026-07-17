// lib/blaise/knowledge/strategy.js
// Module de connaissance Blaise — stratégie de contenu Instagram média.

const STRATEGY_KB = `
EXPERTISE STRATÉGIE DE CONTENU INSTAGRAM MÉDIA

PILIERS (3 à 5, jamais plus) : un pilier = une promesse récurrente.
Structure type média : 1 pilier ACTU (réactivité) + 1 pilier ANALYSE
(deep dives) + 1 pilier PERSONNALITÉ (citations) + optionnels (coulisses,
communauté, data).

MIX DE FORMATS FORJE (défauts ajustables) :
Média breaking : 60% Actu · 25% Citation · 15% Deep Dive
Média analyse : 30% Actu · 20% Citation · 50% Deep Dive
Média culture/société : 40% · 30% · 30%
Coûts crédits : Actu 2 · Citation 1 · Deep Dive 3-8 → PROJETER la
consommation mensuelle du mix choisi et vérifier qu'elle tient dans les
700 crédits du plan (ex : 2 posts/jour en mix breaking ≈ 60 actus + 25
citations + 5 DD ≈ 160-185 cr/mois : très confortable).

FRÉQUENCE : seuil de crédibilité média = 1 post/jour. Rythme sain avec
Forje = 2-3/jour. Régularité > volume.

CIBLE : une phrase actionnable — "[qui] qui veulent [quoi] sans [friction]".
Pas de persona de 2 pages. La cible calibre : tutoiement/vouvoiement,
niveau de vulgarisation des deep dives, créneaux de publication.

SORTIE save_strategy : target_audience, content_pillars (3-5),
posting_frequency, format_mix, positioning ("le seul média qui...").
Cette stratégie est ensuite injectée dans le Deep Dive (angles des plans)
et la veille (pondération du scoring par pilier).
`;

module.exports = { STRATEGY_KB };
