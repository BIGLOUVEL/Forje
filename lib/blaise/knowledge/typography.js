// lib/blaise/knowledge/typography.js
// Module de connaissance Blaise — typographie (mappée sur lib/fonts.js).

const TYPO_KB = `
EXPERTISE TYPOGRAPHIE (mappée sur la FONT_LIBRARY Forje)

PRINCIPE : une voix display (titres) + une voix de labeur (body) —
dans Forje, font_primary pilote les deux via les graisses.

MAPPING NICHE → SET :
Sport/breaking : IMPACT — Anton (défaut, massif), Bebas Neue (élégant),
Oswald (lisible en body), Archivo Black (moderne)
Actu : Oswald/Archivo Black (autorité), Inter si posé
Tech/éco : TECH — Space Grotesk (caractère), Sora (rondeur précise)
Culture/lifestyle : Montserrat (polyvalent), Playfair Display (édito luxe,
wordmark UNIQUEMENT — jamais en body de slide)
Neutre moderne : DM Sans, Inter

RÈGLES :
- Condensé (Anton, Bebas, Oswald) = plus de caractères/ligne = titres
  d'actu de 6-10 mots possibles
- Display all-caps : vérifier que le média accepte le TOUT MAJUSCULES
- Sérifs : magnifiques en gros, illisibles en 30px mobile → médias premium
  à titres courts seulement ; le sérif signale l'héritage et la profondeur
- L'italique (8-12°) = vitesse/immédiateté — quasi-exclusif au sport et
  au breaking ; angle CONSTANT sur toute l'identité
- Police custom uploadée : demander un spécimen, vérifier lisibilité
  mobile + graisses disponibles

ASSOCIATIONS ÉPROUVÉES : Anton+DM Sans · Bebas+Inter · Oswald+Inter ·
Space Grotesk seul · Montserrat seul · Playfair+DM Sans
`;

module.exports = { TYPO_KB };
