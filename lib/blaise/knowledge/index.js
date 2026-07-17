// lib/blaise/knowledge/index.js
// Chargement modulaire de la connaissance Blaise : on n'injecte dans le
// system prompt QUE les modules pertinents pour le message courant
// (2 max hors onboarding) — jamais les docs sources entiers.

const { LOGO_KB }     = require('./logos');
const { PALETTE_KB }  = require('./palettes');
const { TYPO_KB }     = require('./typography');
const { NAMING_KB }   = require('./naming');
const { STRATEGY_KB } = require('./strategy');
const { BRAND_KB }    = require('./brand');

function pickModules(message, mode) {
  if (mode === 'onboarding') return [BRAND_KB, NAMING_KB, LOGO_KB, PALETTE_KB];
  const m = String(message || '').toLowerCase();
  const mods = [];
  if (/logo|monogramme|icône|icone|avatar|symbole/.test(m)) mods.push(LOGO_KB);
  if (/couleur|palette|hex/.test(m)) mods.push(PALETTE_KB);
  if (/police|typo|font/.test(m)) mods.push(TYPO_KB);
  if (/nom|renommer|naming|handle/.test(m)) mods.push(NAMING_KB);
  if (/stratégie|strategie|pilier|fréquence|frequence|calendrier édito|calendrier edito|format/.test(m)) mods.push(STRATEGY_KB);
  if (/marque|positionnement|cible|audience|ton|voix|archétype|archetype|mission/.test(m)) mods.push(BRAND_KB);
  const picked = mods.length ? mods.slice(0, 2) : [BRAND_KB]; // défaut : la marque d'abord
  if (process.env.NODE_ENV !== 'production') {
    const names = { [LOGO_KB]: 'LOGO', [PALETTE_KB]: 'PALETTE', [TYPO_KB]: 'TYPO',
                    [NAMING_KB]: 'NAMING', [STRATEGY_KB]: 'STRATEGY', [BRAND_KB]: 'BRAND' };
    console.log('[Blaise/KB]', mode, '→', picked.map(k => names[k]).join('+'));
  }
  return picked;
}

module.exports = { LOGO_KB, PALETTE_KB, TYPO_KB, NAMING_KB, STRATEGY_KB, BRAND_KB, pickModules };
