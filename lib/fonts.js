/*
 * lib/fonts.js — Bibliothèque typographique centrale de Forje Studio.
 *
 * Source de vérité UNIQUE, partagée entre :
 *   - le serveur (CommonJS : require('./lib/fonts')) → embed base64 dans les SVG
 *   - le navigateur (window.ForjeFonts via <script src="/lib/fonts.js">) → aperçu live
 *
 * Toutes les polices sont des Google Fonts (licence libre) servies depuis
 * @fontsource (fichiers .woff locaux dans node_modules → zéro fetch réseau au runtime).
 *
 * Le set "Impact" (Anton) est le défaut imposé à chaque nouveau client.
 */
(function (root, factory) {
  var lib = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = lib; // serveur
  if (typeof window !== 'undefined') window.ForjeFonts = lib;                 // navigateur
})(this, function () {

  // pkg      = package @fontsource (sert au serveur à lire le fichier local)
  // file     = nom du .woff (graisse display retenue pour les titres)
  // weight   = graisse du fichier
  // urlPath  = chemin HTTP servi par Express (voir server.js) → aperçu Canvas/CSS
  var FONT_LIBRARY = [
    // ─── SET IMPACT (défaut) ───────────────────────────────────────────────
    {
      id: 'anton', name: 'Anton', set: 'impact', category: 'Impact',
      description: 'Massif, display, défaut Forje', isDefault: true,
      pkg: '@fontsource/anton', file: 'anton-latin-400-normal.woff',
      weight: 400, style: 'normal', transform: 'uppercase', letterSpacing: '0.02em',
      urlPath: '/fonts/anton/anton-latin-400-normal.woff',
      preview: 'TON TITRE ICI',
    },
    {
      id: 'bebas-neue', name: 'Bebas Neue', set: 'impact', category: 'Impact',
      description: 'Ultra-condensé, impact maximal',
      pkg: '@fontsource/bebas-neue', file: 'bebas-neue-latin-400-normal.woff',
      weight: 400, style: 'normal', transform: 'uppercase', letterSpacing: '0.02em',
      urlPath: '/fonts/bebas-neue/bebas-neue-latin-400-normal.woff',
      preview: 'TON TITRE ICI',
    },
    {
      id: 'oswald', name: 'Oswald', set: 'impact', category: 'Impact',
      description: 'Condensé, presse percutante',
      pkg: '@fontsource/oswald', file: 'oswald-latin-700-normal.woff',
      weight: 700, style: 'normal', transform: 'uppercase', letterSpacing: '0.01em',
      urlPath: '/fonts/oswald/oswald-latin-700-normal.woff',
      preview: 'TON TITRE ICI',
    },
    {
      id: 'archivo-black', name: 'Archivo Black', set: 'impact', category: 'Impact',
      description: 'Gras, moderne, percutant',
      pkg: '@fontsource/archivo-black', file: 'archivo-black-latin-400-normal.woff',
      weight: 400, style: 'normal', transform: 'uppercase', letterSpacing: '-0.01em',
      urlPath: '/fonts/archivo-black/archivo-black-latin-400-normal.woff',
      preview: 'TON TITRE ICI',
    },

    // ─── SET MODERNE ─────────────────────────────────────────────────────────
    {
      id: 'dm-sans', name: 'DM Sans', set: 'moderne', category: 'Moderne',
      description: 'Propre, neutre, crédible',
      pkg: '@fontsource/dm-sans', file: 'dm-sans-latin-700-normal.woff',
      weight: 700, style: 'normal', transform: 'none', letterSpacing: '-0.01em',
      urlPath: '/fonts/dm-sans/dm-sans-latin-700-normal.woff',
      preview: 'Ton titre ici',
    },
    {
      id: 'inter', name: 'Inter', set: 'moderne', category: 'Moderne',
      description: 'Neutre universel, info factuelle',
      pkg: '@fontsource/inter', file: 'inter-latin-800-normal.woff',
      weight: 800, style: 'normal', transform: 'none', letterSpacing: '-0.02em',
      urlPath: '/fonts/inter/inter-latin-800-normal.woff',
      preview: 'Ton titre ici',
    },

    // ─── SET TECH ──────────────────────────────────────────────────────────
    {
      id: 'space-grotesk', name: 'Space Grotesk', set: 'tech', category: 'Tech',
      description: 'Géométrique, médias digitaux',
      pkg: '@fontsource/space-grotesk', file: 'space-grotesk-latin-700-normal.woff',
      weight: 700, style: 'normal', transform: 'none', letterSpacing: '-0.03em',
      urlPath: '/fonts/space-grotesk/space-grotesk-latin-700-normal.woff',
      preview: 'Ton titre ici',
    },
    {
      id: 'sora', name: 'Sora', set: 'tech', category: 'Tech',
      description: 'Moderne, caractère fort',
      pkg: '@fontsource/sora', file: 'sora-latin-700-normal.woff',
      weight: 700, style: 'normal', transform: 'none', letterSpacing: '-0.02em',
      urlPath: '/fonts/sora/sora-latin-700-normal.woff',
      preview: 'Ton titre ici',
    },

    // ─── SET PREMIUM / ÉDITORIAL ─────────────────────────────────────────────
    {
      id: 'montserrat', name: 'Montserrat', set: 'premium', category: 'Premium',
      description: 'Classique premium, polyvalent',
      pkg: '@fontsource/montserrat', file: 'montserrat-latin-800-normal.woff',
      weight: 800, style: 'normal', transform: 'none', letterSpacing: '-0.01em',
      urlPath: '/fonts/montserrat/montserrat-latin-800-normal.woff',
      preview: 'Ton titre ici',
    },
    {
      id: 'playfair-display', name: 'Playfair Display', set: 'premium', category: 'Éditorial',
      description: 'Serif élégant, magazine luxe',
      pkg: '@fontsource/playfair-display', file: 'playfair-display-latin-900-normal.woff',
      weight: 900, style: 'normal', transform: 'none', letterSpacing: '-0.01em',
      urlPath: '/fonts/playfair-display/playfair-display-latin-900-normal.woff',
      preview: 'Ton titre ici',
    },
    {
      id: 'syne', name: 'Syne', set: 'premium', category: 'Premium',
      description: 'Silence et autorité, premium',
      pkg: '@fontsource/syne', file: 'syne-latin-800-normal.woff',
      weight: 800, style: 'normal', transform: 'uppercase', letterSpacing: '-0.04em',
      urlPath: '/fonts/syne/syne-latin-800-normal.woff',
      preview: 'Ton titre ici',
    },
    {
      id: 'dm-serif-display', name: 'DM Serif Display', set: 'premium', category: 'Éditorial',
      description: 'Serif chaleureux, slow media',
      pkg: '@fontsource/dm-serif-display', file: 'dm-serif-display-latin-400-normal.woff',
      weight: 400, style: 'normal', transform: 'none', letterSpacing: '0',
      urlPath: '/fonts/dm-serif-display/dm-serif-display-latin-400-normal.woff',
      preview: 'Ton titre ici',
    },
  ];

  var DEFAULT_FONT = FONT_LIBRARY.filter(function (f) { return f.isDefault; })[0] || FONT_LIBRARY[0];

  function getFontById(id) {
    if (!id) return DEFAULT_FONT;
    return FONT_LIBRARY.filter(function (f) { return f.id === id; })[0] || DEFAULT_FONT;
  }

  function getFontByName(name) {
    if (!name) return DEFAULT_FONT;
    return FONT_LIBRARY.filter(function (f) { return f.name === name; })[0] || DEFAULT_FONT;
  }

  return {
    FONT_LIBRARY: FONT_LIBRARY,
    DEFAULT_FONT: DEFAULT_FONT,
    getFontById: getFontById,
    getFontByName: getFontByName,
  };
});
