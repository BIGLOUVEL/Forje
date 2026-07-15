// Normalisation one-shot des logos existants (ère "crop mockup") :
// certains badges ont d'énormes marges transparentes → ils paraissent minuscules
// partout à taille de boîte égale. On recadre plein cadre (trim), et on ne
// ré-applique le masque circulaire QUE si l'image est déjà un disque
// (aspect ~carré + coins transparents) — jamais sur un wordmark uploadé.
//
// Usage : node scripts/normalize-logos.js [--dry]
require('dotenv').config();
const sharp = require('sharp');
const { supabase } = require('../lib/supabase');

const DRY = process.argv.includes('--dry');

function download(url) {
  return fetch(url).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.arrayBuffer().then(b => Buffer.from(b));
  });
}

async function normalize(buf) {
  const before = await sharp(buf).metadata();

  let trimmed;
  try { trimmed = await sharp(buf).trim({ threshold: 10 }).png().toBuffer(); }
  catch (_) { return null; } // image vide / illisible
  const meta = await sharp(trimmed).metadata();

  // Déjà plein cadre (le trim n'enlève presque rien) → rien à faire
  if (meta.width >= (before.width || 1) * 0.94 && meta.height >= (before.height || 1) * 0.94) return null;

  const squarish = Math.abs(meta.width - meta.height) / Math.max(meta.width, meta.height) < 0.06;

  const squared = await sharp(trimmed)
    .resize(800, 800, { fit: squarish ? 'cover' : 'contain', position: 'centre', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Coins transparents + forme carrée → c'est un disque : masque circulaire propre
  if (squarish) {
    const { data, info } = await sharp(squared).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const a = (x, y) => data[(y * info.width + x) * 4 + 3];
    const cornersClear = a(4, 4) < 16 && a(795, 4) < 16 && a(4, 795) < 16 && a(795, 795) < 16;
    if (cornersClear) {
      const mask = Buffer.from('<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg"><circle cx="400" cy="400" r="400" fill="#fff"/></svg>');
      return sharp(squared).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    }
  }
  return squared;
}

(async () => {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, logo_url, logo_badge_url')
    .or('logo_url.not.is.null,logo_badge_url.not.is.null');
  if (error) throw error;

  for (const c of clients || []) {
    const src = c.logo_badge_url || c.logo_url;
    if (!src) continue;
    try {
      const raw = await download(src);
      const out = await normalize(raw);
      if (!out) { console.log(`— ${c.name}: déjà plein cadre, rien à faire`); continue; }
      if (DRY) { console.log(`≈ ${c.name}: serait normalisé (${raw.length} → ${out.length} octets)`); continue; }

      const path = `logos/${c.id}/badge-normalized-${Date.now()}.png`;
      const up = await supabase.storage.from('brand-assets').upload(path, out, { contentType: 'image/png', upsert: true });
      if (up.error) throw up.error;
      const url = supabase.storage.from('brand-assets').getPublicUrl(path).data.publicUrl;
      const upd = await supabase.from('clients').update({ logo_badge_url: url, logo_url: url }).eq('id', c.id);
      if (upd.error) throw upd.error;
      console.log(`✓ ${c.name}: normalisé → ${url}`);
    } catch (e) {
      console.error(`✗ ${c.name}: ${e.message}`);
    }
  }
  console.log('Terminé.');
})();
