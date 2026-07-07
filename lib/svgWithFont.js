/*
 * lib/svgWithFont.js — Assemble un SVG complet en embarquant la police (base64).
 *
 * Usage :
 *   const { defs, fontName, weight, style } = await buildFontDefs(client);
 *   const svg = wrapSvgWithFont({ defs, svgContent, width, height });
 *   await sharp(base).composite([{ input: Buffer.from(svg) }]).toBuffer();
 */
function wrapSvgWithFont({ defs, svgContent, width, height }) {
  return (
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
    (defs || '') +
    (svgContent || '') +
    `</svg>`
  );
}

module.exports = { wrapSvgWithFont };
