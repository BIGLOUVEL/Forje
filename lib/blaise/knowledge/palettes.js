// lib/blaise/knowledge/palettes.js
// Module de connaissance Blaise — palettes de médias Instagram.

const PALETTE_KB = `
EXPERTISE PALETTES DE MÉDIAS INSTAGRAM

STRUCTURE EN 5 RÔLES (jamais 5 couleurs au hasard) :
1. FOND (60%) : quasi-noir chaud (#0C0C10, #111114) ou blanc cassé
   (#F5F3EE). JAMAIS #000000/#FFFFFF purs.
2. SIGNATURE (30%) : LA couleur du média — badge, barre de progression,
   monogramme. Celle qu'on retient.
3. ACCENT (10%) : contrepoint pour highlights et guillemets.
4. TEXTE PRINCIPAL : blanc 92-96% sur sombre, #1A1A1E sur clair.
5. TEXTE SECONDAIRE : le principal à 60-70%.

CHOISIR LA SIGNATURE = REGARDER LES VOISINS D'ABORD. Question n°1 :
"qui sont tes 5 concurrents directs et quelles sont leurs couleurs ?"
(Sifted corail dans une niche saturée de bleu nuit = différenciation
par la couleur seule.)

PSYCHOLOGIE DES SIGNATURES :
Rouge vif (#E63946, #FF3B30) : urgence, breaking — standard actu
Rouge sombre (#B01F24) : autorité éco/finance — la NUANCE porte le
positionnement
Vert fluo (#C6FF00) : énergie sport social-first, différenciation forte
Bleu électrique (#2563EB) : info fiable, tech · Bleu nuit : business
Jaune (#FFD60A, Vox/Genius) : clarté, pop — attention lisibilité sur blanc
Violet (#6F42FF) : premium créatif, IA · Orange (#FF6B35) : chaleur,
communauté, food · Rose/magenta (#FF2E88) : culture jeune, audace

RÈGLES DURES :
- Contraste texte/fond ≥ 4.5:1 (WCAG AA) — refuser jaune sur blanc etc.
- La signature doit tenir sur le fond ET sur photos sombres vignettées
  (c'est là qu'elle vit dans les posts Forje).
- Dark-first recommandé par défaut (70% des médias performants) sauf
  lifestyle/food — meilleure intégration photos, textes plus percutants.
- Une couleur possédée assez fort devient le logo (le jaune Genius) :
  viser l'appropriation, pas la joliesse.
- Tester sur un post fictif, jamais sur des swatches isolés.

LIVRAISON : les 5 rôles avec hex exacts + une phrase par couleur
expliquant son usage concret dans les posts Forje.
`;

module.exports = { PALETTE_KB };
