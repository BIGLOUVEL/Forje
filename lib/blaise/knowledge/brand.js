// lib/blaise/knowledge/brand.js
// Module de connaissance Blaise — plateforme de marque (le socle, module par défaut).
// Distillé de docs/blaise/brand-reference.md.

const BRAND_KB = `
EXPERTISE PLATEFORME DE MARQUE, CIBLE, POSITIONNEMENT, TON
(distillée de /docs/blaise/brand-reference.md)

ORDRE DE CONSTRUCTION : PLATEFORME → NOM → VISUEL. Jamais l'inverse.
Un logo sans positionnement est une décoration. En conversation tu peux
zigzaguer, mais tu sais toujours quelle brique manque : mission, cible,
positionnement, personnalité, voix, preuve.

ARCHÉTYPES DE PERSONNALITÉ (un dominant + un secondaire MAX — trois = zéro
personnalité). Correspondances médias observées :
Rebelle (Vice, So Foot) → N&B brut, typo qui gratte, ton cash
Homme du peuple (Brut, 20 Minutes) → accessible, du côté des gens
Sage (Le Monde, Vox, Axios) → sobriété, pédagogie, nuance
Bouffon (Konbini, Oh My Goal) → couleurs franches, complicité, fun
Explorateur (Morning Brew, Sifted) → découvrir avant les autres
Héros (L'Équipe, ESPN) → performance, italique vitesse, rouge
Créateur (Pitchfork) → goût, curation pointue
Souverain (Bloomberg, Les Échos) → autorité, référence, sobriété radicale
L'archétype choisi ALIGNE ensuite couleurs, typo, ton, formats.

LA CIBLE EN UNE PHRASE (jamais un persona de 2 pages) :
"[qui] qui veulent [quoi] sans [friction]"
Ex : Brut = "les 18-34 qui veulent comprendre l'actu sans la TV de leurs
parents" ; Morning Brew = "les jeunes actifs qui veulent le business sans
le jargon". Cette phrase calibre MÉCANIQUEMENT : tutoiement/vouvoiement,
niveau de vulgarisation, référents culturels, créneaux de publication.

JOBS-TO-BE-DONE (pourquoi on suit un média — en servir 1-2, pas 5) :
1. S'informer vite → mix breaking (Actu, alertes)
2. Comprendre en profondeur → Deep Dives, autorité
3. Appartenir → codes communautaires, citations, ton complice
4. Se divertir → émotion, punchlines
5. Paraître informé → récaps screenshotables, stats partageables

POSITIONNEMENT — LA CARTE À 2 AXES :
VITESSE ↔ PROFONDEUR × SÉRIEUX ↔ COMPLICE.
Méthode : placer les 5 concurrents du client sur la carte → viser le
quadrant le moins occupé → formuler : "Le seul média [niche] qui
[différence] pour [cible]." TEST : un positionnement qu'un concurrent
pourrait signer n'en est pas un.

TON DE VOIX — 4 CURSEURS (à régler avec des exemples concrets, pas en
abstrait : "cette actu en version factuelle vs émotionnelle — laquelle
te ressemble ?") :
formel↔familier · factuel↔émotionnel · sérieux↔joueur · expert↔accessible
Le réglage alimente tone_tags et mood → directement les titres générés.
Une fois réglés, les curseurs sont VERROUILLÉS : la reconnaissance naît
de la répétition — c'est le rôle de Forje de tenir ce verrou.

TEST DE COHÉRENCE FINAL : "si on masque le logo, reconnaît-on le média
à un post ?" La marque = des récurrences. Rappelle-le à un client qui
veut changer de style toutes les semaines.
`;

module.exports = { BRAND_KB };
