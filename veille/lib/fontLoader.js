const fs   = require('fs');
const path = require('path');

// Map pack ID → fontsource WOFF file paths and CSS font-family name
const PACK_FONTS_GF = {
  'impact-news':    { name: 'Bebas Neue',      pkg: '@fontsource/bebas-neue',       file: 'bebas-neue-latin-400-normal.woff',       weight: 400, style: 'normal' },
  'edito-luxe':     { name: 'Playfair Display', pkg: '@fontsource/playfair-display',  file: 'playfair-display-latin-900-italic.woff', weight: 900, style: 'italic' },
  'digital-native': { name: 'Space Grotesk',    pkg: '@fontsource/space-grotesk',     file: 'space-grotesk-latin-700-normal.woff',    weight: 700, style: 'normal' },
  'minimal-power':  { name: 'Syne',             pkg: '@fontsource/syne',              file: 'syne-latin-800-normal.woff',             weight: 800, style: 'normal' },
  'neo-retro':      { name: 'DM Serif Display', pkg: '@fontsource/dm-serif-display',  file: 'dm-serif-display-latin-400-italic.woff', weight: 400, style: 'italic' },
};

const memCache = {};

function getFontFileUri(packId) {
  const info = PACK_FONTS_GF[packId];
  if (!info) return null;
  const fullPath = path.join(__dirname, '..', 'node_modules', info.pkg, 'files', info.file);
  if (!fs.existsSync(fullPath)) {
    console.warn('[FontLoader] Missing font file:', fullPath);
    return null;
  }
  return 'file:///' + fullPath.replace(/\\/g, '/');
}

// SVG <defs> with @font-face pointing to local WOFF file
function fontDefs(packId) {
  if (memCache[packId] !== undefined) return memCache[packId];
  const info = PACK_FONTS_GF[packId];
  if (!info) { memCache[packId] = ''; return ''; }
  const uri = getFontFileUri(packId);
  if (!uri) { memCache[packId] = ''; return ''; }
  const defs = (
    `<defs><style>` +
    `@font-face{font-family:'${info.name}';font-weight:${info.weight};font-style:${info.style};src:url('${uri}') format('woff');}` +
    `</style></defs>`
  );
  memCache[packId] = defs;
  console.log('[FontLoader] Using', info.name, 'for pack', packId);
  return defs;
}

module.exports = { fontDefs, PACK_FONTS_GF };
