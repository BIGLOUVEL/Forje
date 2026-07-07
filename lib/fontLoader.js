/*
 * lib/fontLoader.js — Chargement des polices côté serveur pour le rendu SVG/Sharp.
 *
 * POINT CRITIQUE : resvg/librsvg (sous Sharp) ne connaît pas les polices par leur
 * nom. Il faut embarquer la police DANS le SVG via @font-face + base64. Sinon le
 * changement de police reste cosmétique (visible à l'aperçu mais pas sur les posts).
 *
 * Deux sources :
 *   - bibliothèque  → fichier .woff local @fontsource (lecture disque)
 *   - police custom → URL Supabase (fetch + cache mémoire)
 */
const fs   = require('fs');
const path = require('path');
const { FONT_LIBRARY, DEFAULT_FONT, getFontByName, getFontById } = require('./fonts');

// cache base64 par clé (évite de relire le disque / re-télécharger à chaque post)
const b64Cache = new Map();

// Résout la police effective d'un client (custom > id > nom > défaut Impact)
function resolveFont(client) {
  client = client || {};
  if (client.font_is_custom && client.font_custom_url) {
    return {
      fontName:  client.font_primary || 'CustomFont',
      isCustom:  true,
      customUrl: client.font_custom_url,
      urlPath:   client.font_custom_url, // chargeable directement par le navigateur
      weight:    700,
      style:     'normal',
      transform: 'none',
      letterSpacing: '0',
    };
  }
  // Bibliothèque : priorité à font_id, fallback sur font_primary, sinon défaut
  const font = client.font_id
    ? getFontById(client.font_id)
    : (client.font_primary ? getFontByName(client.font_primary) : DEFAULT_FONT);
  return {
    fontName:  font.name,
    fontId:    font.id,
    set:       font.set,
    isCustom:  false,
    filePath:  path.join(__dirname, '..', 'node_modules', font.pkg, 'files', font.file),
    urlPath:   font.urlPath, // servi par Express → aperçu Canvas côté client
    weight:    font.weight,
    style:     font.style,
    transform: font.transform || 'none',
    letterSpacing: font.letterSpacing || '0',
  };
}

// Récupère le base64 du fichier woff (local) ou de l'URL custom (fetch), avec cache
async function loadFontBase64(resolved) {
  const cacheKey = resolved.isCustom ? ('custom:' + resolved.customUrl)
                                     : ('lib:' + resolved.filePath);
  if (b64Cache.has(cacheKey)) return b64Cache.get(cacheKey);

  let buffer, mime;
  if (resolved.isCustom) {
    const res = await fetch(resolved.customUrl);
    if (!res.ok) throw new Error('Police custom inaccessible : ' + resolved.fontName);
    buffer = Buffer.from(await res.arrayBuffer());
    mime = mimeFromUrl(resolved.customUrl);
  } else {
    if (!fs.existsSync(resolved.filePath)) {
      console.warn('[FontLoader] Fichier manquant :', resolved.filePath);
      return null;
    }
    buffer = fs.readFileSync(resolved.filePath);
    mime = 'font/woff';
  }
  const entry = { b64: buffer.toString('base64'), mime };
  b64Cache.set(cacheKey, entry);
  return entry;
}

function mimeFromUrl(url) {
  const ext = (url.split('.').pop() || '').toLowerCase().split(/[?#]/)[0];
  return ({ ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' })[ext] || 'font/ttf';
}
function formatFromMime(mime) {
  return ({ 'font/ttf': 'truetype', 'font/otf': 'opentype', 'font/woff': 'woff', 'font/woff2': 'woff2' })[mime] || 'truetype';
}

// Construit le bloc <defs> @font-face base64 à injecter dans un SVG.
// Retourne aussi les métadonnées utiles au rendu (fontName, weight, style, transform).
async function buildFontDefs(client) {
  const resolved = resolveFont(client);
  let defs = '';
  try {
    const loaded = await loadFontBase64(resolved);
    if (loaded) {
      defs =
        `<defs><style type="text/css">` +
        `@font-face{font-family:'${resolved.fontName}';font-weight:${resolved.weight};font-style:${resolved.style};` +
        `src:url('data:${loaded.mime};base64,${loaded.b64}') format('${formatFromMime(loaded.mime)}');}` +
        `</style></defs>`;
      console.log('[FontLoader] embed', resolved.fontName, resolved.isCustom ? '(custom)' : '(lib)');
    }
  } catch (e) {
    console.warn('[FontLoader]', e.message, '→ fallback police système');
  }
  return { defs, ...resolved };
}

module.exports = { resolveFont, buildFontDefs, loadFontBase64, FONT_LIBRARY };
