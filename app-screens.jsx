/* global React, AppIcon, Btn */
var { useState, useEffect, useRef } = React;

// ─── Canvas renderer : texte actu avec les vraies Google Fonts ───────────────
async function renderActuCanvas(data) {
  var W = 1080, H = 1350;
  var canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');

  // 1. Draw server background (photo + gradient + accent bar + logo)
  var bg = new Image();
  await new Promise(function(res, rej) { bg.onload = res; bg.onerror = rej; bg.src = data.bgImage; });
  ctx.drawImage(bg, 0, 0, W, H);

  // 2. Resolve typography — la police effective vient du serveur (data.font), source de
  //    vérité unique (bibliothèque ForjeFonts ou police custom). Le Canvas charge CETTE
  //    police → effectivité réelle (l'aperçu reflète exactement le post généré).
  var df = data.font || null;
  var headWeight, headStyleV, headSpacing, doUppercase;
  var headFamily, catFamily = 'DM Sans,Arial,sans-serif';
  if (df && df.name) {
    headWeight  = df.weight || 700;
    headStyleV  = df.style  || 'normal';
    doUppercase = df.transform === 'uppercase';
    // letterSpacing fourni en em → converti en px (taille titre 88px)
    var lsNum = parseFloat(df.letterSpacing || '0');
    headSpacing = (df.letterSpacing && /em$/.test(df.letterSpacing)) ? Math.round(lsNum * 88) : (lsNum || 0);
    headFamily  = "'" + df.name + "',Impact,sans-serif";
  } else {
    headWeight = 400; headStyleV = 'normal'; headSpacing = 1; doUppercase = true;
    headFamily = "'Anton',Impact,sans-serif";
  }

  // 3. Load font via @font-face injection + document.fonts.load() (fiable pour Canvas)
  if (df && df.name && df.url) {
    var fam = df.name;
    var ext = (df.url.split('.').pop() || '').toLowerCase().split(/[?#]/)[0];
    var fmt = ({ ttf:'truetype', otf:'opentype', woff:'woff', woff2:'woff2' })[ext] || 'woff';
    var styleId = 'ff-forje-' + fam.replace(/\s+/g, '-').toLowerCase();
    if (!document.getElementById(styleId)) {
      var style = document.createElement('style');
      style.id = styleId;
      style.textContent = "@font-face{font-family:'" + fam + "';src:url('" + df.url + "') format('" + fmt + "');font-weight:" + headWeight + ";font-style:" + headStyleV + ";}";
      document.head.appendChild(style);
    }
    try {
      await Promise.race([
        document.fonts.load(headStyleV + ' ' + headWeight + " 72px '" + fam + "'"),
        new Promise(function(_, rej){ setTimeout(function(){ rej(new Error('font timeout')); }, 4000); }),
      ]);
    } catch(e) { console.warn('[Font]', e.message); }
  }

  // 4. Text-wrap helper (uses ctx.measureText)
  function wrapLines(text, maxW, font) {
    ctx.font = font;
    var words = String(text).split(' ');
    var lines = []; var cur = '';
    words.forEach(function(w) {
      var candidate = cur ? cur + ' ' + w : w;
      if (ctx.measureText(candidate).width > maxW && cur) { lines.push(cur); cur = w; }
      else { cur = candidate; }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // 5. Compute layout (badge → title → subtitle stacked from bottom)
  var titleText = doUppercase ? data.title.toUpperCase() : data.title;
  var headFont  = headStyleV + ' ' + headWeight + ' 88px ' + headFamily;
  var titleLines = wrapLines(titleText, W - 120, headFont);
  var lineH = 100;
  var titleH = titleLines.length * lineH;

  var subFont = '400 28px DM Sans,Arial,sans-serif';
  var subLines = wrapLines(data.subtitle, W - 120, subFont);
  var subH = subLines.length * 40;

  var badgeH = 48;
  var gap = 18;
  var totalH = badgeH + gap + titleH + gap + subH;
  var startY = H - 64 - totalH;

  // 6. Badge
  var BADGE_COLORS = { SPORT:'#E11D48', POLITIQUE:'#7C3AED', ECONOMIE:'#0EA5E9', CULTURE:'#F59E0B', TECH:'#10B981', SOCIETE:'#6366F1' };
  var badgeColor = data.primaryColor || BADGE_COLORS[data.category] || '#6366F1';
  var catLabel = data.category.toUpperCase();
  ctx.font = '700 19px ' + catFamily;
  var catW = ctx.measureText(catLabel).width + 36;
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 18; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 4;
  ctx.fillStyle = badgeColor;
  ctx.beginPath(); ctx.roundRect(60, startY, catW, badgeH, 4); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 19px ' + catFamily;
  ctx.letterSpacing = '2px';
  ctx.fillText(catLabel, 78, startY + 33);
  ctx.letterSpacing = '0px';

  // 7. Title
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = 24; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#ffffff';
  ctx.font = headFont;
  ctx.letterSpacing = headSpacing + 'px';
  var ty = startY + badgeH + gap;
  titleLines.forEach(function(line, i) { ctx.fillText(line, 60, ty + 88 + i * lineH); });
  ctx.letterSpacing = '0px';

  // 8. Subtitle
  ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = subFont;
  var sy = ty + titleH + gap;
  subLines.forEach(function(line, i) { ctx.fillText(line, 60, sy + 28 + i * 40); });

  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  return canvas.toDataURL('image/jpeg', 0.92);
}
window.__renderActuCanvas = renderActuCanvas;

// ─── Canvas renderer : citation avec la vraie police du client ───────────────
// Sharp/librsvg ignore les @font-face base64 (rend toujours un serif système), donc
// on compose le texte ici, sur Canvas, où document.fonts charge la vraie police.
async function renderCitationCanvas(data) {
  var W = 1080, H = 1350;
  var canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');

  // 1. Fond serveur (photo + vignette + logo)
  var bg = new Image();
  await new Promise(function(res, rej) { bg.onload = res; bg.onerror = rej; bg.src = data.bgImage; });
  ctx.drawImage(bg, 0, 0, W, H);

  // 2. Police effective (source de vérité : serveur → data.font)
  var df = data.font || null;
  var headWeight = (df && df.weight) || 700;
  var headStyleV = (df && df.style)  || 'normal';
  var headName   = (df && df.name)   || 'Anton';
  var headFamily = "'" + headName + "',Impact,sans-serif";

  // 3. Charge la police (@font-face + document.fonts.load) — fiable pour Canvas
  if (df && df.name && df.url) {
    var ext = (df.url.split('.').pop() || '').toLowerCase().split(/[?#]/)[0];
    var fmt = ({ ttf:'truetype', otf:'opentype', woff:'woff', woff2:'woff2' })[ext] || 'woff';
    var styleId = 'ff-forje-' + headName.replace(/\s+/g, '-').toLowerCase();
    if (!document.getElementById(styleId)) {
      var style = document.createElement('style');
      style.id = styleId;
      style.textContent = "@font-face{font-family:'" + headName + "';src:url('" + df.url + "') format('" + fmt + "');font-weight:" + headWeight + ";font-style:" + headStyleV + ";}";
      document.head.appendChild(style);
    }
    try {
      await Promise.race([
        document.fonts.load(headStyleV + ' ' + headWeight + " 64px '" + headName + "'"),
        new Promise(function(_, rej){ setTimeout(function(){ rej(new Error('font timeout')); }, 4000); }),
      ]);
    } catch(e) { console.warn('[Font]', e.message); }
  }

  var accent = data.accentColor || '#FFFFFF';
  var maxW = W - 200;

  function wrapLines(text, font) {
    ctx.font = font;
    var words = String(text).split(' '), lines = [], cur = '';
    words.forEach(function(w) {
      var cand = cur ? cur + ' ' + w : w;
      if (ctx.measureText(cand).width > maxW && cur) { lines.push(cur); cur = w; }
      else { cur = cand; }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // 4. Citation — taille adaptée à la longueur
  var qText = String(data.quoteText || '');
  var qSize = qText.length > 140 ? 44 : qText.length > 90 ? 52 : 60;
  var qFont = headStyleV + ' ' + headWeight + ' ' + qSize + 'px ' + headFamily;
  var qLines = wrapLines(qText, qFont);
  var qLineH = Math.round(qSize * 1.26);
  var qH = qLines.length * qLineH;

  // 5. Métriques auteur
  var nameText = String(data.authorName || '').toUpperCase();
  var titleText = data.authorTitle ? String(data.authorTitle) : '';
  var markH = 70, gap1 = 28, sepGap = 40, nameH = 40, titleH = titleText ? 34 : 0;
  var total = markH + gap1 + qH + sepGap + nameH + titleH;
  var startY = Math.round((H - total) / 2) + 50;

  ctx.textAlign = 'center';
  var cx = W / 2;

  // 6. Guillemet décoratif (accent)
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.5;
  ctx.font = "700 120px Georgia,serif";
  ctx.fillText('“', cx, startY + markH);
  ctx.globalAlpha = 1;

  // 7. Citation (blanc, ombre pour lisibilité)
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#ffffff';
  ctx.font = qFont;
  var qy = startY + markH + gap1;
  qLines.forEach(function(line, i) { ctx.fillText(line, cx, qy + qSize + i * qLineH); });

  // 8. Trait séparateur (accent)
  var sepY = qy + qH + Math.round(sepGap / 2);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = accent; ctx.globalAlpha = 0.75; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 50, sepY); ctx.lineTo(cx + 50, sepY); ctx.stroke();
  ctx.globalAlpha = 1;

  // 9. Nom de l'auteur (police du client) + fonction
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#ffffff';
  ctx.font = headStyleV + ' ' + headWeight + ' 32px ' + headFamily;
  ctx.letterSpacing = '1px';
  var nameY = sepY + 20 + nameH;
  ctx.fillText(nameText, cx, nameY);
  ctx.letterSpacing = '0px';
  if (titleText) {
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(255,255,255,0.66)';
    ctx.font = '400 23px DM Sans,Arial,sans-serif';
    ctx.fillText(titleText, cx, nameY + 34);
  }

  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.textAlign = 'left';
  return canvas.toDataURL('image/jpeg', 0.92);
}
window.__renderCitationCanvas = renderCitationCanvas;

// ─── Canvas renderer : slide Deep Dive avec la vraie police du client ─────────
// Le serveur renvoie le FOND de chaque slide (photo + overlay/panneau selon le
// layout + logo). On peint ICI le texte (titre/body/stat/liste/CTA) avec la
// police effective du média, le numéro de slide et la barre de progression —
// librsvg (Sharp) ne sait pas appliquer une @font-face base64, le Canvas si.
// Helpers pour un fond importé manuellement (dessiné côté client, sans serveur)
function _ddDrawCover(ctx, img, W, H) {
  var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  var s = Math.max(W / iw, H / ih), w = iw * s, h = ih * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}
function _ddDrawOverlay(ctx, layout, W, H) {
  if (layout === 'full_impact') {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0.50)'); g.addColorStop(0.42, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); return;
  }
  if (layout === 'stat_focus') { ctx.fillStyle = 'rgba(0,0,0,0.66)'; ctx.fillRect(0, 0, W, H); return; }
  if (layout === 'split_bottom') {
    var ph = 470;
    var g2 = ctx.createLinearGradient(0, H - ph - 120, 0, H - ph);
    g2.addColorStop(0, 'rgba(12,12,16,0)'); g2.addColorStop(1, 'rgba(12,12,16,0.97)');
    ctx.fillStyle = g2; ctx.fillRect(0, H - ph - 120, W, 120);
    ctx.fillStyle = 'rgba(12,12,16,0.97)'; ctx.fillRect(0, H - ph, W, ph); return;
  }
  var op = layout === 'cta_clean' ? 0.96 : 0.94;
  ctx.fillStyle = 'rgba(12,12,16,' + op + ')'; ctx.fillRect(0, 0, W, H);
}
async function _ddDrawLogo(ctx, logoUrl, W) {
  if (!logoUrl) return;
  var lg = new Image(); lg.crossOrigin = 'anonymous';
  var ok = await new Promise(function(r){ lg.onload = function(){ r(true); }; lg.onerror = function(){ r(false); }; lg.src = logoUrl; });
  if (!ok) return;
  var h = 60, w = (lg.naturalWidth / lg.naturalHeight) * h || 60;
  ctx.drawImage(lg, W - 56 - w, 54, w, h);
}

async function renderDeepDiveSlideCanvas(slide, shared, skipLogo) {
  var W = 1080, H = 1350;
  var canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');

  // 1. Fond : image importée manuellement (dessinée ICI, instantané, zéro serveur)
  //    sinon le fond composé par le serveur (photo web / dégradé de marque).
  if (slide.customBg) {
    var cb = new Image();
    await new Promise(function(res){ cb.onload = res; cb.onerror = res; cb.src = slide.customBg; });
    try { _ddDrawCover(ctx, cb, W, H); } catch(_) {}
    _ddDrawOverlay(ctx, slide.layout || 'split_bottom', W, H);
    if (!skipLogo) { try { await _ddDrawLogo(ctx, (shared.brand || {}).logo, W); } catch(_) {} }
  } else {
    var bg = new Image();
    await new Promise(function(res){ bg.onload = res; bg.onerror = res; bg.src = slide.bg; });
    try { ctx.drawImage(bg, 0, 0, W, H); } catch(_) {}
  }

  // 2. Police effective + couleurs (source de vérité : serveur → shared.font / shared.brand)
  var df       = shared.font  || {};
  var brand    = shared.brand || {};
  var primary  = brand.primary || '#FF3B30';
  var headName   = df.name   || 'Anton';
  var headWeight = df.weight || 700;
  var headStyle  = df.style  || 'normal';
  var doUpper    = df.transform === 'uppercase';
  var headFamily = "'" + headName + "',Impact,sans-serif";
  var SANS = 'DM Sans,Arial,sans-serif';

  // 3. Charge la police (@font-face + document.fonts.load) — fiable pour Canvas
  if (df.name && df.url) {
    var ext = (df.url.split('.').pop() || '').toLowerCase().split(/[?#]/)[0];
    var fmt = ({ ttf:'truetype', otf:'opentype', woff:'woff', woff2:'woff2' })[ext] || 'woff';
    var styleId = 'ff-forje-' + headName.replace(/\s+/g, '-').toLowerCase();
    if (!document.getElementById(styleId)) {
      var st = document.createElement('style');
      st.id = styleId;
      st.textContent = "@font-face{font-family:'" + headName + "';src:url('" + df.url + "') format('" + fmt + "');font-weight:" + headWeight + ";font-style:" + headStyle + ";}";
      document.head.appendChild(st);
    }
    try {
      await Promise.race([
        document.fonts.load(headStyle + ' ' + headWeight + " 72px '" + headName + "'"),
        new Promise(function(_, rej){ setTimeout(function(){ rej(new Error('font timeout')); }, 4000); }),
      ]);
    } catch(e) { console.warn('[Font]', e.message); }
  }

  function wrap(text, maxW, font) {
    ctx.font = font;
    var words = String(text || '').split(' '), lines = [], cur = '';
    words.forEach(function(w) {
      var cand = cur ? cur + ' ' + w : w;
      if (ctx.measureText(cand).width > maxW && cur) { lines.push(cur); cur = w; }
      else { cur = cand; }
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function noShadow() { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
  function headFont(px) { return headStyle + ' ' + headWeight + ' ' + px + 'px ' + headFamily; }

  var layout = slide.layout || 'split_bottom';
  var title  = doUpper ? String(slide.title || '').toUpperCase() : String(slide.title || '');

  // ─── LAYOUT 1 : full_impact (hook / climax) — titre énorme ancré en bas ──────
  if (layout === 'full_impact') {
    var big      = title.length > 28 ? 88 : 108;
    var tFont    = headFont(big);
    var tLines   = wrap(title, W - 120, tFont).slice(0, 4);
    var lineH    = big + 8;
    var bFont    = '400 34px ' + SANS;
    var bLines   = slide.body ? wrap(slide.body, W - 140, bFont).slice(0, 2) : [];
    var titleH   = tLines.length * lineH;
    var bodyH    = bLines.length * 44;
    var blockBot = H - 235;
    var bodyTop  = blockBot - bodyH;
    var titleBot = bodyTop - (bLines.length ? 34 : 0);
    var titleTop = titleBot - titleH;

    ctx.fillStyle = primary;
    ctx.fillRect(60, titleTop - 34, 90, 8);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 5;
    ctx.font = tFont;
    tLines.forEach(function(l, i) { ctx.fillText(l, 60, titleTop + big + i * lineH); });
    if (bLines.length) {
      ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
      ctx.font = bFont; ctx.fillStyle = 'rgba(255,255,255,0.80)';
      bLines.forEach(function(l, i) { ctx.fillText(l, 60, bodyTop + 30 + i * 44); });
    }
    noShadow();
  }

  // ─── LAYOUT 2 : split_bottom (setup / content) — texte dans le panneau bas ───
  else if (layout === 'split_bottom') {
    var panelTop = H - 470, ix = 60;
    ctx.textAlign = 'left';
    // Trait accent + chiffre éventuel (si ce slide portait un "stat")
    var y2 = panelTop + 78;
    ctx.fillStyle = primary; ctx.fillRect(ix, y2 - 18, 90, 8);
    if (slide.stat) {
      ctx.font = headFont(56); ctx.fillStyle = primary;
      ctx.fillText(String(slide.stat), ix, y2 + 44);
      y2 += 78;
    }
    var tFont2  = headFont(48);
    var tLines2 = wrap(slide.title, W - 120, tFont2).slice(0, slide.stat ? 2 : 3);
    ctx.font = tFont2; ctx.fillStyle = '#fff';
    y2 += 48;
    tLines2.forEach(function(l, i) { ctx.fillText(l, ix, y2 + i * 58); });
    var by2 = y2 + tLines2.length * 58 + 16;
    var bFont2  = '400 29px ' + SANS;
    var bLines2 = wrap(slide.body, W - 120, bFont2).slice(0, slide.stat ? 3 : 5);
    ctx.font = bFont2; ctx.fillStyle = 'rgba(255,255,255,0.75)';
    bLines2.forEach(function(l, i) { ctx.fillText(l, ix, by2 + i * 42); });
  }

  // ─── LAYOUT 3 : stat_focus — chiffre géant centré ────────────────────────────
  else if (layout === 'stat_focus') {
    var cx = W / 2;
    var stat = String(slide.stat || slide.title || '');
    var statSize = stat.length > 6 ? 138 : stat.length > 4 ? 176 : stat.length > 2 ? 210 : 240;
    ctx.textAlign = 'center';
    ctx.fillStyle = primary; ctx.font = headFont(statSize);
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 4;
    ctx.fillText(stat, cx, H / 2 - 10);

    var lbl = slide.stat ? (slide.body || slide.title || '') : (slide.body || '');
    var lFont = '500 38px ' + SANS;
    var lLines = wrap(lbl, W - 200, lFont).slice(0, 3);
    ctx.shadowBlur = 8; ctx.font = lFont; ctx.fillStyle = '#fff';
    lLines.forEach(function(l, i) { ctx.fillText(l, cx, H / 2 + 78 + i * 50); });
    noShadow(); ctx.textAlign = 'left';
  }

  // ─── LAYOUT 4 : list_recap — la slide qu'on screenshot ───────────────────────
  else if (layout === 'list_recap') {
    var lix = 70;
    ctx.textAlign = 'left';
    var tFont4 = headFont(58);
    var tLines4 = wrap(title, W - 140, tFont4).slice(0, 2);
    ctx.font = tFont4; ctx.fillStyle = '#fff';
    var ty4 = 300;
    tLines4.forEach(function(l, i) { ctx.fillText(l, lix, ty4 + i * 66); });
    var afterT = ty4 + tLines4.length * 66;
    ctx.fillStyle = primary; ctx.fillRect(lix, afterT + 4, 90, 8);

    var points = String(slide.body || '').split(/\s*[•\n;|]\s*/).map(function(s){ return s.trim(); }).filter(Boolean).slice(0, 4);
    var py = afterT + 96;
    var pFont = '500 32px ' + SANS;
    points.forEach(function(pt, i) {
      var lines = wrap(pt, W - lix - 56 - 60, pFont);
      var cyc = py + 14;
      ctx.beginPath(); ctx.fillStyle = primary; ctx.arc(lix + 17, cyc, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '800 20px ' + SANS;
      ctx.fillText(String(i + 1), lix + 17, cyc + 7);
      ctx.textAlign = 'left'; ctx.font = pFont; ctx.fillStyle = 'rgba(255,255,255,0.90)';
      lines.forEach(function(l, j) { ctx.fillText(l, lix + 58, py + 8 + j * 42); });
      py += Math.max(66, lines.length * 42 + 30);
    });
  }

  // ─── LAYOUT 5 : cta_clean — épuré, centré ────────────────────────────────────
  else {
    var ccx = W / 2;
    var tFont5 = headFont(64);
    var tLines5 = wrap(title, W - 160, tFont5).slice(0, 3);
    var bFont5 = '400 34px ' + SANS;
    var bLines5 = wrap(slide.body, W - 220, bFont5).slice(0, 4);
    var titleH5 = tLines5.length * 76, bodyH5 = bLines5.length * 48;
    var startY5 = (H - (titleH5 + 50 + bodyH5)) / 2 - 20;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.font = tFont5;
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 3;
    tLines5.forEach(function(l, i) { ctx.fillText(l, ccx, startY5 + 64 + i * 76); });
    var by5 = startY5 + titleH5 + 52;
    ctx.shadowBlur = 8;
    ctx.font = bFont5; ctx.fillStyle = 'rgba(255,255,255,0.78)';
    bLines5.forEach(function(l, i) { ctx.fillText(l, ccx, by5 + i * 48); });
    noShadow();
    ctx.fillStyle = primary; ctx.fillRect(ccx - 45, by5 + bodyH5 + 28, 90, 8);
    ctx.textAlign = 'left';
  }

  // ─── Éléments communs : numéro de slide (haut gauche) + barre de progression ──
  if (slide.position > 1) {
    ctx.textAlign = 'left';
    ctx.font = '600 24px ' + SANS;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 1;
    ctx.fillText(String(slide.position).padStart(2, '0') + ' / ' + String(shared.total || 1).padStart(2, '0'), 60, 90);
    noShadow();
  }
  var pct = (slide.position || 1) / (shared.total || 1);
  ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(0, H - 6, W, 6);
  ctx.fillStyle = primary; ctx.fillRect(0, H - 6, Math.round(W * pct), 6);

  // Un logo cross-origin sans en-têtes CORS peut « tainter » le canvas → export impossible.
  // Dans ce cas, on re-rend le fond importé SANS le logo (le reste est garanti exportable).
  try {
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch (e) {
    if (slide.customBg && !skipLogo) return renderDeepDiveSlideCanvas(slide, shared, true);
    throw e;
  }
}
window.__renderDeepDiveSlideCanvas = renderDeepDiveSlideCanvas;

// Rend toutes les slides d'un carousel Deep Dive → tableau de data URLs
async function renderDeepDiveCarousel(data) {
  var shared = { font: data.font, brand: data.brand, total: data.total || (data.slides || []).length };
  var out = [];
  for (var i = 0; i < (data.slides || []).length; i++) {
    out.push(await renderDeepDiveSlideCanvas(data.slides[i], shared));
  }
  return out;
}
window.__renderDeepDiveCarousel = renderDeepDiveCarousel;

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE — hub (Higgsfield-like) + creation (2 variations via tweak)
// ═══════════════════════════════════════════════════════════════════════════
const GenerateScreen = ({ layoutVariant, preset, onPickPreset, onBack, onGoToBoard, brandScore, onGoBrand }) => {
  if (preset) {
    return layoutVariant === 'chat'
      ? <GenerateChat preset={preset} onBack={onBack} onGoToBoard={onGoToBoard} brandScore={brandScore} onGoBrand={onGoBrand} onPickPreset={onPickPreset}/>
      : <GenerateStudio preset={preset} onBack={onBack} onGoToBoard={onGoToBoard} brandScore={brandScore} onGoBrand={onGoBrand} onPickPreset={onPickPreset}/>;
  }
  return <GenerateHub onPick={onPickPreset}/>;
};

const PRESETS = [
  { id: 'actu',     label: 'Actualité', desc: 'Du breaking au post en 90 secondes',
    tag: 'Le plus utilisé', icon: 'news',   img: 'assets/actu.webp',      vid: 'assets/actu-loop.mp4',      visual: 'actu'  },
  { id: 'citation', label: 'Citation',  desc: 'Une phrase forte, mise en image',
    icon: 'quote',  img: 'assets/citation.webp',  vid: 'assets/citation-loop.mp4',  visual: 'quote' },
  { id: 'deepdive', label: 'Deep Dive', desc: 'Carousel 7-10 slides — le format le plus sauvegardé',
    tag: 'Meilleur reach', icon: 'layers', img: 'assets/deep-dive.webp',  vid: 'assets/deep-dive-loop.mp4', visual: 'bts'   },
];

const HUB_PLACEHOLDERS = [
  '« L\'IA vient de dépasser les médecins sur les diagnostics cancer du sein. On en parle ? »',
  '« Notre nouvelle collection automne arrive jeudi — faut créer l\'élan maintenant. »',
  '« Citation de notre CEO ce matin en conf : "L\'excellence, c\'est la répétition faite belle." »',
  '« Article du Monde sur la relocalisation textile en France — angle parfait pour nous. »',
  '« On vient de recevoir le prix Innovation Durable 2026 — comment on annonce ça ? »',
];

// ─── Format detector state partagé (survit entre re-renders) ─────────────────
var _hubDetectedFormat = null; // { format, label } affiché en temps réel

const GenerateHub = ({ onPick }) => {
  var [text,         setText]        = useState('');
  var [detecting,    setDetecting]   = useState(false);
  var [detectedFmt,  setDetectedFmt] = useState(null);
  var [err,          setErr]         = useState('');
  var [attachments,  setAttachments] = useState([]); // [{name, dataUrl, type}]
  var [dragging,     setDragging]    = useState(false);
  var debounceRef  = useRef(null);
  var taRef        = useRef(null);
  var fileInputRef = useRef(null);
  var placeholder  = HUB_PLACEHOLDERS[Math.floor(Date.now() / 30000) % HUB_PLACEHOLDERS.length];

  useEffect(function() {
    var el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [text]);

  var processFiles = function(files) {
    var allowed = Array.from(files).filter(function(f) {
      return f.type.startsWith('image/') || f.type === 'application/pdf';
    }).slice(0, 4); // max 4 fichiers
    allowed.forEach(function(file) {
      if (file.type.startsWith('image/')) {
        var reader = new FileReader();
        reader.onload = function(e) {
          setAttachments(function(prev) {
            if (prev.some(function(a) { return a.name === file.name; })) return prev;
            return [...prev, { name: file.name, dataUrl: e.target.result, type: 'image' }];
          });
        };
        reader.readAsDataURL(file);
      } else {
        setAttachments(function(prev) {
          if (prev.some(function(a) { return a.name === file.name; })) return prev;
          return [...prev, { name: file.name, dataUrl: null, type: 'file' }];
        });
      }
    });
  };

  var handlePaste = function(e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var imageFound = false;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        var file = items[i].getAsFile();
        if (file) { e.preventDefault(); imageFound = true; processFiles([file]); break; }
      }
    }
    return imageFound;
  };

  var handleDragOver = function(e) { e.preventDefault(); e.stopPropagation(); setDragging(true); };
  var handleDragLeave = function(e) { e.preventDefault(); e.stopPropagation(); setDragging(false); };
  var handleDrop = function(e) {
    e.preventDefault(); e.stopPropagation(); setDragging(false);
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  };
  var removeAttachment = function(i) {
    setAttachments(function(prev) { return prev.filter(function(_, j) { return j !== i; }); });
  };

  // Détection optimiste en tâche de fond dès 60 car (sans spinner, sans bloquer)
  var triggerSilentDetect = function(t) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (t.length < 60) { setDetectedFmt(null); return; }
    debounceRef.current = setTimeout(async function() {
      try {
        var res = await veilleFetch('/generate/detect-format', {
          method: 'POST',
          body: JSON.stringify({ text: t }),
        });
        var data = await res.json();
        if (res.ok && data.format) {
          var preset = PRESETS.find(function(p) { return p.id === data.format; }) || PRESETS[0];
          _hubDetectedFormat = { ...data, preset };
          setDetectedFmt({ id: data.format, label: preset.label });
        }
      } catch (_) { /* silencieux */ }
    }, 900); // 900ms debounce
  };

  var handleDetect = async function() {
    var t = text.trim();
    if (!t || detecting) return;
    var attachedImages = attachments.filter(function(a) { return a.type === 'image'; });

    // Si on a déjà une détection en cache (préchargée), on l'utilise directement
    if (_hubDetectedFormat && _hubDetectedFormat.preset) {
      var cached = _hubDetectedFormat;
      _hubDetectedFormat = null;
      onPick({ ...cached.preset, prefill: { ...cached, attachedImages }, autoStart: true });
      return;
    }

    setDetecting(true); setErr('');
    try {
      var res = await veilleFetch('/generate/detect-format', {
        method: 'POST',
        body: JSON.stringify({ text: t }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      var formatId = data.format || 'actu';
      var preset = PRESETS.find(function(p) { return p.id === formatId; }) || PRESETS[0];
      _hubDetectedFormat = null;
      onPick({ ...preset, prefill: { ...data, attachedImages }, autoStart: true });
    } catch (e) {
      setErr(e.message);
      setDetecting(false);
    }
  };

  var fmtBadgeLabel = detectedFmt
    ? { actu:'Actualité', citation:'Citation', deepdive:'Deep Dive' }[detectedFmt.id] || detectedFmt.label
    : null;

  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <h1 className="page-title">Que veux-tu raconter ?</h1>
          <p className="page-subtitle">
            Décris ton idée — Forje détecte le bon format et génère le post.
          </p>
        </div>
      </div>

      <div
        className={`aiprompt${text.length > 0 || attachments.length > 0 ? ' aiprompt--active' : ''}${dragging ? ' aiprompt--dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="aiprompt-glow"/>

        {/* Drag overlay */}
        {dragging && (
          <div className="aiprompt-drop-overlay">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Dépose ici
          </div>
        )}

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="aiprompt-attachments">
            {attachments.map(function(att, i) {
              return att.type === 'image'
                ? (
                  <div key={i} className="aiprompt-att-img">
                    <img src={att.dataUrl} alt={att.name}/>
                    <button className="aiprompt-att-remove" onClick={function() { removeAttachment(i); }} title="Supprimer">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div key={i} className="aiprompt-att-file">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
                    </svg>
                    <span>{att.name.length > 18 ? att.name.slice(0, 16) + '…' : att.name}</span>
                    <button className="aiprompt-att-remove aiprompt-att-remove--inline" onClick={function() { removeAttachment(i); }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                );
            })}
          </div>
        )}

        <textarea
          ref={taRef}
          className="aiprompt-ta"
          value={text}
          onChange={function(e) {
            var v = e.target.value;
            setText(v); setErr('');
            if (!detecting) triggerSilentDetect(v.trim());
          }}
          onKeyDown={function(e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleDetect(); }}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={1}
          autoFocus
        />

        <div className="aiprompt-bar">
          {/* Left: clip button + hint */}
          <div className="aiprompt-left">
            <button
              className="aiprompt-clip"
              onClick={function() { fileInputRef.current && fileInputRef.current.click(); }}
              title="Joindre image ou fichier">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              style={{ display:'none' }}
              onChange={function(e) { if (e.target.files) processFiles(e.target.files); e.target.value = ''; }}
            />
            <div className="aiprompt-hint">
              {err
                ? <span className="aiprompt-hint--err">{err}</span>
                : text.length > 0 && text.length < 10
                  ? <span className="aiprompt-hint--warn">Continue un peu…</span>
                  : fmtBadgeLabel && !detecting
                    ? <span className="aiprompt-hint--fmt">
                        <span className="aiprompt-fmt-dot"/>
                        <b>{fmtBadgeLabel}</b>
                        <span className="aiprompt-fmt-rest">détecté · ⌘↵ pour générer</span>
                      </span>
                    : <span className="aiprompt-hint--idle">
                        {detecting ? 'Analyse en cours…' : attachments.length > 0 ? 'Image jointe · ⌘↵ pour envoyer' : '⌘↵ pour envoyer · glisse une image'}
                      </span>}
            </div>
          </div>

          {/* Right: count + send */}
          <div className="aiprompt-right">
            {text.length > 0 && (
              <span className={`aiprompt-count${text.length > 500 ? ' aiprompt-count--over' : ''}`}>{text.length}</span>
            )}
            <button
              className={`aiprompt-send${detecting ? ' aiprompt-send--loading' : !text.trim() ? ' aiprompt-send--empty' : ' aiprompt-send--ready'}`}
              onClick={handleDetect}
              disabled={!text.trim() || detecting}
              title="Générer (⌘↵)">
              {detecting
                ? <span className="gen-bounce-loader--sm"/>
                : <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 13L8 3M8 3L3.5 7.5M8 3L12.5 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>}
            </button>
          </div>
        </div>
      </div>

      <div className="gen-section-divider">Ou choisissez un format directement</div>

      <div className="gen-preset-grid">
        {PRESETS.map(p => (
          <PresetCard key={p.id} preset={p} onPick={() => onPick(p)}/>
        ))}
      </div>
    </div>
  );
};

const PresetCard = ({ preset, onPick }) => {
  var [hover, setHover] = useState(false);
  var vidRef = useRef(null);
  useEffect(function() {
    var v = vidRef.current; if (!v) return;
    if (hover) { try { v.currentTime = 0; v.play().catch(function(){}); } catch(_){} }
    else { try { v.pause(); } catch(_){} }
  }, [hover]);
  return (
    <button className="preset-card" onClick={onPick}
      onMouseEnter={function(){ setHover(true); }} onMouseLeave={function(){ setHover(false); }}>
      {preset.tag && <span className="preset-tag">{preset.tag}</span>}
      <img className="preset-card-img" src={preset.img} alt={preset.label} draggable="false"/>
      {preset.vid && (
        <video ref={vidRef} className="preset-card-vid" src={preset.vid} muted loop playsInline preload="none"
          style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover',
            opacity: hover ? 1 : 0, transition:'opacity .3s ease', pointerEvents:'none', zIndex:1 }}/>
      )}
      <div className="preset-card-overlay">
        <div className="preset-card-label">{preset.label}</div>
        <div className="preset-card-desc">{preset.desc}</div>
      </div>
      <div className="preset-card-arrow">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M2.5 6.5h8M7.5 3l3.5 3.5L7.5 10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </button>
  );
};

// Tiny stylized preview of each format (SVG-driven, chromatic world)
const PresetPreview = ({ kind }) => {
  switch (kind) {
    case 'actu':
      return (
        <div className="pp pp-actu">
          <div className="pp-chip">• EN DIRECT</div>
          <div className="pp-lede">La relocalisation de la maroquinerie française atteint un cap historique.</div>
          <div className="pp-meta">Les Échos</div>
        </div>
      );
    case 'quote':
      return (
        <div className="pp pp-quote">
          <div className="pp-quote-mark">"</div>
          <div className="pp-quote-text">L'excellence, c'est la répétition faite belle.</div>
        </div>
      );
    case 'bts':
      return (
        <div className="pp pp-bts">
          <div className="pp-bts-grain"/>
          <div className="pp-bts-label">COULISSES · 03</div>
        </div>
      );
    case 'product':
      return (
        <div className="pp pp-product">
          <div className="pp-product-tag">ÉDITION · CAMEL</div>
          <div className="pp-product-name">MARGOT</div>
          <div className="pp-product-line"/>
        </div>
      );
    case 'portrait':
      return (
        <div className="pp pp-portrait">
          <div className="pp-portrait-circle"/>
          <div className="pp-portrait-name">Noémie · atelier</div>
        </div>
      );
    case 'pedago':
      return (
        <div className="pp pp-pedago">
          <div className="pp-pedago-title">LE MOT</div>
          <div className="pp-pedago-word">Skiver</div>
          <div className="pp-pedago-def">Amincir le cuir à l'endroit d'un pli.</div>
        </div>
      );
    case 'season':
      return (
        <div className="pp pp-season">
          <div className="pp-season-label">AH · 25</div>
          <div className="pp-season-name">camel<br/>saturé</div>
        </div>
      );
    case 'testi':
      return (
        <div className="pp pp-testi">
          <div className="pp-testi-quote">« Je l'ai depuis 4 ans, elle vieillit mieux que moi. »</div>
          <div className="pp-testi-sig">— Élise M.</div>
        </div>
      );
    default: return null;
  }
};

const RecentCard = ({ type, when, title, swatch }) => (
  <div className="recent-card">
    <div className={`queue-swatch queue-swatch--${swatch}`} style={{width:32, height:32}}>
      <AppIcon name={swatch === 'quote' ? 'quote' : swatch === 'news' ? 'news' : 'image'} size={12}/>
    </div>
    <div style={{flex:1, minWidth:0}}>
      <div className="recent-type">{type} · <span className="recent-when">{when}</span></div>
      <div className="recent-title">{title}</div>
    </div>
    <AppIcon name="chevRight" size={14} style={{color:'var(--app-fg-4)'}}/>
  </div>
);

// ─── Génération fonctionnelle (Actu / Citation / Deep Dive) ──────────────
const GEN_API = '/api';
var _genActive       = null; // preset ID of in-flight generation (survives navigation)
var _genStartTime    = null; // epoch ms when generation began (for loader resume)
var _abortController = null; // AbortController for the current in-flight fetch

async function veilleFetch(path, opts) {
  var sb = window.__supabase;
  var token = null;
  if (sb) { var sess = await sb.auth.getSession(); token = sess.data?.session?.access_token; }
  var headers = Object.assign({ 'Content-Type': 'application/json' }, opts && opts.headers);
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(GEN_API + path, Object.assign({}, opts, { headers }));
}

const GenFormInput = ({ value, onChange, placeholder, type, rows, maxLength }) => {
  var r = rows || 3;
  var handleChange = e => onChange(maxLength ? e.target.value.slice(0, maxLength) : e.target.value);
  if (type === 'input') {
    return (
      <input
        value={value}
        onChange={handleChange}
        maxLength={maxLength}
        placeholder={placeholder}
        style={{ width:'100%', boxSizing:'border-box', background:'var(--app-surface-2)',
          border:'1px solid var(--app-line)', borderRadius:'var(--radius)', padding:'9px 12px',
          color:'var(--app-fg)', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none',
          marginBottom:8 }}
      />
    );
  }
  return (
    <>
      <textarea
        className="tool-textarea"
        value={value}
        onChange={handleChange}
        maxLength={maxLength}
        placeholder={placeholder}
        rows={r}
      />
      {maxLength && (
        <div className="tool-sub" style={{ textAlign:'right', opacity: (value||'').length > maxLength - 20 ? 1 : 0.5 }}>
          {(value||'').length} / {maxLength}
        </div>
      )}
    </>
  );
};

const PhotoDropzone = ({ photoData, setPhotoData, photoUrl, setPhotoUrl }) => {
  var [dragOver, setDragOver] = useState(false);

  var readFile = function(file) {
    if (!file || !file.type.startsWith('image/')) return;
    var reader = new FileReader();
    reader.onload = function(e) { setPhotoData(e.target.result); setPhotoUrl(''); };
    reader.readAsDataURL(file);
  };

  useEffect(function() {
    var onPaste = function(e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          readFile(items[i].getAsFile());
          e.preventDefault();
          break;
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return function() { document.removeEventListener('paste', onPaste); };
  }, []);

  return (
    <div>
      {photoData ? (
        <div style={{ position:'relative', marginBottom:8 }}>
          <img src={photoData} style={{ width:'100%', borderRadius:8, maxHeight:140, objectFit:'cover', display:'block' }}/>
          <button onClick={function() { setPhotoData(''); setPhotoUrl(''); }}
            style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,.65)',
              border:'none', borderRadius:'50%', width:22, height:22, color:'#fff',
              cursor:'pointer', fontSize:14, lineHeight:'22px', textAlign:'center' }}>
            x
          </button>
        </div>
      ) : (
        <div
          onDragOver={function(e) { e.preventDefault(); setDragOver(true); }}
          onDragLeave={function() { setDragOver(false); }}
          onDrop={function(e) { e.preventDefault(); setDragOver(false); readFile(e.dataTransfer.files[0]); }}
          onClick={function() {
            var inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'image/*';
            inp.onchange = function(e) { readFile(e.target.files[0]); };
            inp.click();
          }}
          style={{ border:'2px dashed ' + (dragOver ? 'var(--app-accent)' : 'var(--app-line)'),
            borderRadius:8, padding:'18px 12px', textAlign:'center', cursor:'pointer',
            transition:'border-color .15s,background .15s', marginBottom:8,
            background: dragOver ? 'rgba(99,102,241,.05)' : 'transparent' }}
        >
          <div style={{ fontSize:12, color:'var(--app-fg-4)', lineHeight:1.7 }}>
            Glisse une photo ici<br/>
            ou <span style={{ color:'var(--app-accent)' }}>clique pour parcourir</span><br/>
            <span style={{ fontSize:11, opacity:.65 }}>Ctrl+V pour coller depuis le presse-papiers</span>
          </div>
        </div>
      )}
      <input
        value={photoUrl}
        onChange={function(e) { setPhotoUrl(e.target.value); setPhotoData(''); }}
        placeholder="ou colle une URL de photo..."
        style={{ width:'100%', boxSizing:'border-box', background:'var(--app-surface-2)',
          border:'1px solid var(--app-line)', borderRadius:'var(--radius)', padding:'8px 12px',
          color:'var(--app-fg)', fontFamily:'DM Sans,sans-serif', fontSize:12, outline:'none' }}
      />
    </div>
  );
};

// Dropzone légère pour une image de référence de style
const StyleRefDropzone = ({ value, onChange, label = 'Référence de style', hint = 'Influence l\'esthétique uniquement — le prompt prime' }) => {
  var readFile = function(file) {
    if (!file || !file.type.startsWith('image/')) return;
    var reader = new FileReader();
    reader.onload = function(e) { onChange(e.target.result); };
    reader.readAsDataURL(file);
  };
  return (
    <div style={{ marginTop:10 }}>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--app-fg-4)', letterSpacing:'0.08em',
        textTransform:'uppercase', marginBottom:6 }}>{label}</div>
      {value ? (
        <div style={{ position:'relative', display:'inline-block' }}>
          <img src={value} style={{ width:72, height:72, borderRadius:8, objectFit:'cover',
            border:'1px solid var(--app-line)', display:'block' }}/>
          <button onClick={function(){ onChange(null); }}
            style={{ position:'absolute', top:-7, right:-7, background:'var(--app-surface-3)',
              border:'1px solid var(--app-line)', borderRadius:'50%', width:18, height:18, color:'var(--app-fg-3)',
              cursor:'pointer', fontSize:11, lineHeight:'18px', textAlign:'center', padding:0 }}>×</button>
          <div style={{ fontSize:10, color:'var(--app-fg-4)', marginTop:4, maxWidth:72, lineHeight:1.4 }}>{hint}</div>
        </div>
      ) : (
        <div onClick={function(){
          var inp = document.createElement('input'); inp.type='file'; inp.accept='image/*';
          inp.onchange = function(e){ readFile(e.target.files[0]); }; inp.click();
        }} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px',
          border:'1.5px dashed var(--app-line)', borderRadius:8, cursor:'pointer',
          background:'var(--app-surface)', transition:'border-color .15s',
          color:'var(--app-fg-4)', fontSize:12 }}>
          <AppIcon name="image" size={14}/>
          <span>Ajouter une ref de style <span style={{opacity:.55, fontSize:11}}>— {hint}</span></span>
        </div>
      )}
    </div>
  );
};

const GenFormFields = ({ preset, s }) => {
  if (preset.id === 'actu') return (<>
    <ToolSection title="Actu" icon="news">
      <GenFormInput value={s.newsText} onChange={s.setNewsText} rows={2}
        placeholder="Décris l'actu : qui, quoi, pourquoi ça compte..."/>
    </ToolSection>
    <ToolSection title="Visuel" icon="image">
      <div className="vis-mode-toggle">
        <button className={`vis-mode-btn${s.imageMode === 'ai' ? ' active' : ''}`} onClick={() => s.setImageMode('ai')}>
          ✦ IA — Cinématique
        </button>
        <button className={`vis-mode-btn${s.imageMode === 'classic' ? ' active' : ''}`} onClick={() => s.setImageMode('classic')}>
          Photo Google
        </button>
      </div>
      {/* Indicateur de temps estimé selon le mode */}
      <div className="vis-mode-timing">
        {s.imageMode === 'classic'
          ? <><AppIcon name="clock" size={11}/> <span>Rapide · ~15 sec</span></>
          : <><AppIcon name="clock" size={11}/> <span>Qualité max · ~60–90 sec</span></>}
      </div>
      {s.imageMode === 'classic' && (
        <div>
          <PhotoDropzone photoData={s.photoData} setPhotoData={s.setPhotoData}
            photoUrl={s.photoUrl} setPhotoUrl={s.setPhotoUrl}/>
          <div className="tool-sub">Sans photo, Forje cherche via Serper</div>
        </div>
      )}
      {s.imageMode === 'ai' && (
        <div>
          <div className="tool-sub">
            GPT Image-1 génère un visuel cinématique sur-mesure.
          </div>
          <StyleRefDropzone
            value={s.styleRefData}
            onChange={s.setStyleRefData}
            label="Ref de style (cette génération)"
            hint="usage unique — esthétique uniquement"/>
        </div>
      )}
    </ToolSection>
  </>);

  if (preset.id === 'citation') return (<>
    <ToolSection title="Citation" icon="quote">
      <GenFormInput value={s.quoteText} onChange={s.setQuoteText} rows={4} maxLength={200}
        placeholder="Colle la citation ici..."/>
    </ToolSection>
    <ToolSection title="Auteur" icon="target">
      <GenFormInput type="input" value={s.authorName} onChange={s.setAuthorName}
        placeholder="Nom de l auteur"/>
      <GenFormInput type="input" value={s.authorTitle} onChange={s.setAuthorTitle}
        placeholder="Titre / fonction (optionnel)"/>
    </ToolSection>
    <ToolSection title="Photo" icon="image">
      <PhotoDropzone photoData={s.photoData} setPhotoData={s.setPhotoData}
        photoUrl={s.photoUrl} setPhotoUrl={s.setPhotoUrl}/>
      <div className="tool-sub">Sans photo, Forje cherche le portrait via Serper</div>
    </ToolSection>
  </>);

  if (preset.id === 'deepdive') return (<>
    <ToolSection title="Sujet du carousel" icon="layers">
      <GenFormInput value={s.topic} onChange={s.setTopic} rows={4}
        placeholder="Ex : Pourquoi les startups françaises échouent avant 3 ans…"/>
      <div className="tool-sub">Claude recherche le sujet sur le web → faits, chiffres, dates réels.</div>
    </ToolSection>
    <ToolSection title="Nombre de slides" icon="layers">
      <div className="dd-count-pills">
        {[7, 8, 9, 10].map(n => (
          <button key={n}
            className={`dd-count-pill${s.ddSlideCount === n ? ' dd-count-pill--active' : ''}`}
            onClick={() => s.setDdSlideCount(n)}>{n}</button>
        ))}
      </div>
      <div className="tool-sub">7 à 10 = le sweet spot de l’algo Instagram.</div>
    </ToolSection>
    <ToolSection title="Visuels" icon="image">
      <div className="dd-mode-pills">
        {[['none','Typo seul','Rapide'],['serp','Photo web','~15s'],['genai','IA cinéma','premium'],['hybrid','Hybrid','Recommandé']].map(([val, label, sub]) => (
          <button key={val}
            className={`dd-mode-pill${s.ddImageMode === val ? ' dd-mode-pill--active' : ''}`}
            onClick={() => s.setDdImageMode(val)}>
            <span className="dd-mode-pill-label">{label}</span>
            <span className="dd-mode-pill-sub">{sub}</span>
          </button>
        ))}
      </div>
      <div className="tool-sub">Hybrid : IA cinématique sur le hook + le climax, photos web ailleurs.</div>
    </ToolSection>
  </>);

  return null;
};

const LOADER_STEPS = {
  actu:     [[0,'Analyse de l\'actu…'],[5000,'Génération du visuel cinématique…'],[14000,'Rédaction du post…'],[22000,'Caption Instagram…'],[30000,'Finalisation…']],
  citation: [[0,'Composition visuelle…'],[6000,'Mise en forme typographique…'],[12000,'Finalisation…']],
  deepdive: [[0,'Recherche web du sujet…'],[12000,'Construction du plan narratif…'],[24000,'Sourcing des visuels…'],[40000,'Composition des slides…'],[55000,'Rendu du carousel…']],
};
const LOADER_TOTAL = { actu: 36000, citation: 18000, deepdive: 60000 };

function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2,'0') + ':' + String(s % 60).padStart(2,'0');
}

const GenLoader = ({ preset, startTime, exiting }) => {
  const id    = preset?.id || 'actu';
  const steps = LOADER_STEPS[id] || LOADER_STEPS.actu;
  const start = startTime || Date.now();
  const elapsed = Date.now() - start;
  const initialStep = steps.reduce((acc, [delay], i) => (elapsed >= delay ? i : acc), 0);
  const [stepIdx,   setStepIdx]  = useState(initialStep);
  const [elapsedMs, setElapsed]  = useState(elapsed);

  useEffect(() => {
    const timers = steps.slice(1).map(([delay], i) => {
      const remaining = delay - (Date.now() - start);
      if (remaining <= 0) return null;
      return setTimeout(() => setStepIdx(i + 1), remaining);
    }).filter(Boolean);
    const tick = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => { timers.forEach(clearTimeout); clearInterval(tick); };
  }, []);

  return (
    <div className={`gen-card-loader${exiting ? ' gen-card-loader--exiting' : ''}`}>
      <button className="gen-card-loader__cancel" onClick={() => window.__cancelGen?.()}>
        Annuler
      </button>
      <div className="gen-speeder-fazers">
        <span/><span/><span/><span/>
      </div>
      <div className="gen-speeder">
        <span>
          <span/><span/><span/><span/>
        </span>
        <div className="gen-speeder-base">
          <span/>
          <div className="gen-speeder-face"/>
        </div>
      </div>
      <div className="gen-card-loader__step" key={stepIdx}>{steps[stepIdx][1]}</div>
      <div className="gen-card-loader__counter">{fmtElapsed(elapsedMs)}</div>
    </div>
  );
};

const GenerateChat = ({ preset, onBack, onGoToBoard, brandScore = 7, onGoBrand, onPickPreset }) => {
  const GEN_KEY    = `forje_gen_result_${preset.id}`;
  const FEED_KEY   = `forje_gen_feed_${preset.id}`;
  const INPUTS_KEY = `forje_gen_inputs_${preset.id}`;

  const savedInputs = (() => { try { return JSON.parse(sessionStorage.getItem(INPUTS_KEY) || 'null'); } catch(_){ return null; } })();

  const [newsText,     setNewsText]     = useState(preset.prefill?.newsText   || savedInputs?.newsText   || '');
  const [photoUrl,     setPhotoUrl]     = useState('');
  const [photoData,    setPhotoData]    = useState('');
  const [quoteText,    setQuoteText]    = useState(preset.prefill?.quoteText  || savedInputs?.quoteText  || '');
  const [authorName,   setAuthorName]   = useState(preset.prefill?.authorName || savedInputs?.authorName || '');
  const [authorTitle,  setAuthorTitle]  = useState(preset.prefill?.authorTitle || '');
  const [topic,        setTopic]        = useState(preset.prefill?.topic      || savedInputs?.topic      || '');
  // Mode image : si l'user vient du Hub (autoStart), on préfère 'classic' (plus rapide, ~15s vs ~90s)
  // L'user peut toujours basculer sur 'ai' depuis le formulaire
  const [imageMode,    setImageMode]    = useState(preset.autoStart ? 'classic' : 'ai');
  const [ddImageMode,  setDdImageMode]  = useState('serp'); // photos web par défaut (même coût que 'none')
  const [ddSlideCount, setDdSlideCount] = useState(8);
  const [styleRefData, setStyleRefData] = useState(null);
  const [generating,   setGenerating]   = useState(_genActive === preset.id || !!preset.autoStart);
  const [results,      setResults]      = useState([]);
  const [genPhase,     setGenPhase]     = useState('idle'); // idle|generating|exiting
  const [error,        setError]        = useState(null);
  const [activeSlide,  setActiveSlide]  = useState(0);
  const [expandedItem, setExpandedItem] = useState(null);
  const [showFmtDrop, setShowFmtDrop] = useState(false);
  const isMountedRef   = useRef(true);
  const loadingIdRef   = useRef(null);
  const autoStartedRef = useRef(false);
  const fmtDropRef     = useRef(null);
  useEffect(() => { return () => { isMountedRef.current = false; }; }, []);

  // Fermer le dropdown format au clic extérieur
  useEffect(() => {
    if (!showFmtDrop) return;
    const fn = (e) => { if (fmtDropRef.current && !fmtDropRef.current.contains(e.target)) setShowFmtDrop(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [showFmtDrop]);

  // Switcher de format en préservant le texte courant
  const handleSwitchFormat = (newId) => {
    setShowFmtDrop(false);
    if (newId === preset.id || !onPickPreset) return;
    const newPreset = PRESETS.find(p => p.id === newId);
    if (!newPreset) return;
    const currentText = newsText || quoteText || topic || '';
    // Appliquer directement dans le state destination : le composant ne remonte pas
    // donc les useState initializers ne re-tournent pas avec le prefill
    if (newId === 'actu')     setNewsText(currentText);
    if (newId === 'citation') setQuoteText(currentText);
    if (newId === 'deepdive') setTopic(currentText);
    // Prefill en backup si le composant remontait pour une autre raison
    const prefill =
      newId === 'actu'     ? { newsText: currentText } :
      newId === 'citation' ? { quoteText: currentText, authorName: authorName || '' } :
      newId === 'deepdive' ? { topic: currentText } : {};
    onPickPreset({ ...newPreset, prefill, fromBoard: preset.fromBoard });
  };

  // Charge les posts depuis Supabase au mount
  useEffect(() => {
    const sb = window.__supabase;
    const user = window.__currentUser;
    if (!sb || !user) return;
    sb.from('generated_posts')
      .select('id, preset_id, title, subtitle, caption, category, pack_id, created_at, meta')
      .eq('user_id', user.id)
      .eq('preset_id', preset.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!isMountedRef.current) return;
        if (data && data.length) {
          const dbItems = data.map(r => ({
            ...r.meta,
            id: r.id,
            preset_id: r.preset_id,
            title: r.title,
            subtitle: r.subtitle,
            caption: r.caption,
            category: r.category,
            packId: r.pack_id,
          }));
          // Preserve in-flight loading items and freshly-generated posts not yet saved to DB
          setResults(prev => {
            const dbIds = new Set(dbItems.map(r => r.id));
            const inFlight = prev.filter(r => r.loading || !dbIds.has(r.id));
            return [...inFlight, ...dbItems];
          });
        }
        // Si une génération est toujours en vol, restaure le placeholder de chargement
        if (_genActive === preset.id) {
          setGenPhase('generating');
          setResults(prev => {
            if (prev.some(r => r.loading)) return prev;
            return [...prev, { id: 'reload-loading', loading: true, preset_id: preset.id }];
          });
        }
      });
  }, []);

  // Callbacks globaux pour les générations en vol (survive aux navigations)
  useEffect(() => {
    var alive = true;
    window.__onGenResult = function(entry, presetId) {
      if (!alive || presetId !== preset.id) return;
      setResults(prev => {
        const loadingItem = prev.find(r => r.loading);
        if (loadingItem) {
          return prev.map(r => r.loading ? { ...entry, id: loadingItem.id } : r);
        }
        // Pas encore de placeholder (race) — prepend, Supabase dédupliquera au prochain mount
        return [entry, ...prev];
      });
      setGenerating(false);
      setGenPhase('exiting');
      setTimeout(() => { if (alive) setGenPhase('idle'); }, 380);
    };
    window.__onGenError = function(msg, presetId) {
      if (!alive || presetId !== preset.id) return;
      setResults(prev => prev.filter(r => !r.loading));
      setGenerating(false);
      setGenPhase('idle');
      setError(msg);
    };
    return function() { alive = false; };
  }, []);

  const s = { newsText, setNewsText, photoUrl, setPhotoUrl, photoData, setPhotoData, quoteText, setQuoteText,
              authorName, setAuthorName, authorTitle, setAuthorTitle, topic, setTopic,
              imageMode, setImageMode, ddImageMode, setDdImageMode, ddSlideCount, setDdSlideCount, styleRefData, setStyleRefData };

  const canGenerate = {
    actu:     newsText.trim().length > 10,
    citation: quoteText.trim().length > 3 && authorName.trim().length > 1,
    deepdive: topic.trim().length > 5,
  }[preset.id] || false;

  // Coût en crédits de la génération en cours (transparence avant clic)
  const genCost = (function() {
    const C = (window.FORJE_CREDITS && window.FORJE_CREDITS.costs) || { actu:2, citation:1, deep_dive_light:3, deep_dive_premium:8 };
    if (preset.id === 'actu')     return C.actu;
    if (preset.id === 'citation') return C.citation;
    if (preset.id === 'deepdive') return (ddImageMode === 'genai' || ddImageMode === 'hybrid') ? C.deep_dive_premium : C.deep_dive_light;
    return 1;
  })();

  const handleGenerate = async () => {
    const lId = Date.now();
    loadingIdRef.current = lId;
    _genActive       = preset.id;
    _genStartTime    = Date.now();
    _abortController = new AbortController();
    window.__cancelGen = () => _abortController?.abort();
    if (isMountedRef.current) {
      setGenerating(true);
      setGenPhase('generating');
      setError(null);
      setActiveSlide(0);
      setResults(prev => [{ id: lId, loading: true, preset_id: preset.id }, ...prev]);
    }
    try { sessionStorage.setItem(INPUTS_KEY, JSON.stringify({ newsText, quoteText, topic, authorName })); } catch(_){}
    window.__setGenToast?.({ status: 'generating', label: preset.label, presetId: preset.id, preset });
    try {
      const userId   = window.__currentUser?.id;
      const clientId = window.__activeClientId || undefined;
      const ep   = { actu:'/generate/actu', citation:'/generate/citation', deepdive:'/generate/deepdive' }[preset.id];
      const body = {
        actu:     { newsText, photoUrl: photoUrl || undefined, photoData: photoData || undefined, userId, clientId, imageMode, styleRefData: styleRefData || undefined },
        citation: { quoteText, authorName, authorTitle: authorTitle || undefined, photoUrl: photoUrl || undefined, photoData: photoData || undefined, userId, clientId },
        deepdive: { topic, userId, clientId, imageMode: ddImageMode, slideCount: ddSlideCount },
      }[preset.id];
      const res  = await veilleFetch(ep, { method: 'POST', body: JSON.stringify(body), signal: _abortController.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Erreur génération');
      // Solde de crédits renvoyé par le serveur → maj immédiate de la sidebar
      if (typeof data.creditsLeft === 'number') window.__applyCredits?.(data.creditsLeft);
      if (preset.id === 'deepdive' && Array.isArray(data.slides)) {
        // Le serveur renvoie les FONDS (data.slides[].bg) + le texte → on peint chaque
        // slide sur Canvas avec la vraie police, puis on assemble le carousel final.
        data.images = await renderDeepDiveCarousel(data);
        data.image  = data.images[0];
        data.title  = data.slides[0]?.title || 'Deep Dive';
      } else if (data.bgImage) {
        data.image = await (preset.id === 'citation' ? renderCitationCanvas(data) : renderActuCanvas(data));
      }
      window.__setGenToast?.({ status: 'ready', label: preset.label, presetId: preset.id, preset });
      const entry = { ...data, id: lId, preset_id: preset.id };
      // Sauvegarde Supabase — toujours, même si le composant est démonté
      const sb = window.__supabase; const user = window.__currentUser;
      if (sb && user) {
        sb.from('generated_posts').insert({
          user_id:   user.id,
          client_id: window.__activeClientId || null,
          preset_id: preset.id,
          title:     data.title     || null,
          subtitle:  data.subtitle  || null,
          caption:   data.caption   || null,
          image:     data.image     || null,
          category:  data.category  || null,
          pack_id:   data.packId    || null,
          // On conserve les fonds (slides[].bg) → le post reste ÉDITABLE quand on le rouvre
          // (re-rendu du texte, ajout d'image…). Sans ça, un post rechargé serait figé.
          meta:      (({ image: _i, bgImage: _b, ...rest }) => rest)(data),
        }).select('id').single().then(({ data: row }) => {
          if (row && isMountedRef.current) {
            setResults(prev => prev.map(r => r.id === lId ? { ...r, id: row.id } : r));
          }
        });
      }
      if (isMountedRef.current) {
        setResults(prev => prev.map(r => r.id === lId ? entry : r));
        setGenPhase('exiting');
        setTimeout(() => setGenPhase('idle'), 380);
        window.__setGenToast?.(null);
      } else {
        // Composant démonté — signal vers le nouveau composant s'il est déjà remonté
        window.__setGenToast?.(null);
        window.__onGenResult?.(entry, preset.id);
      }
    } catch (err) {
      window.__setGenToast?.(null);
      if (err.name === 'AbortError') {
        // Annulation silencieuse — pas d'affichage d'erreur
        if (isMountedRef.current) {
          setResults(prev => prev.filter(r => r.id !== lId));
          setGenPhase('idle');
        }
      } else if (isMountedRef.current) {
        setResults(prev => prev.filter(r => r.id !== lId));
        setGenPhase('idle');
        setError(err.message);
      } else {
        window.__onGenError?.(err.message, preset.id);
      }
    } finally {
      _genActive       = null;
      _genStartTime    = null;
      _abortController = null;
      window.__cancelGen = null;
      if (isMountedRef.current) setGenerating(false);
    }
  };

  // ─── AutoStart : si l'user vient du Hub avec un texte détecté, on génère immédiatement
  // On utilise une ref pour éviter de lancer 2x en React Strict Mode (double-invoke)
  useEffect(() => {
    if (!preset.autoStart || autoStartedRef.current) return;
    if (!canGenerate) return; // sécurité : les champs doivent être valides
    autoStartedRef.current = true;
    // Petit délai pour laisser le composant se monter entièrement (état + DOM)
    var t = setTimeout(function() {
      if (isMountedRef.current) handleGenerate();
    }, 120);
    return function() { clearTimeout(t); };
  }, [canGenerate]); // déclenche quand canGenerate devient true (après init des states)

  return (
    <div className="gen-studio-body">
      <div className="gen-studio-head">
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { sessionStorage.removeItem(GEN_KEY); onBack(); }}>
            <AppIcon name="chevLeft" size={12}/>Formats
          </button>
          {preset.fromBoard && (
            <button className="btn btn-ghost btn-sm" style={{ color:'var(--app-accent)' }}
              onClick={() => { onGoToBoard?.(); }}>
              <AppIcon name="news" size={12}/>Board
            </button>
          )}
        </div>
        <div className="gen-studio-title-row" ref={fmtDropRef} style={{ position:'relative' }}>
          <button
            className="gen-fmt-trigger"
            onClick={() => setShowFmtDrop(v => !v)}
            title="Changer de format"
          >
            <AppIcon name={preset.icon} size={13} style={{ color:'var(--app-fg-3)', flexShrink:0 }}/>
            <span className="gen-studio-title">{preset.label}</span>
            <span className="gen-fmt-chevron" style={{ transform: showFmtDrop ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
          </button>

          {showFmtDrop && (
            <div className="gen-fmt-drop">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  className={'gen-fmt-option' + (p.id === preset.id ? ' gen-fmt-option--active' : '')}
                  onClick={() => handleSwitchFormat(p.id)}
                >
                  <span className="gen-fmt-opt-icon"><AppIcon name={p.icon} size={13}/></span>
                  <span className="gen-fmt-opt-body">
                    <span className="gen-fmt-opt-label">{p.label}</span>
                    <span className="gen-fmt-opt-desc">{p.desc}</span>
                  </span>
                  {p.id === preset.id && <span className="gen-fmt-opt-check">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="gen-studio-actions">
        </div>
      </div>

      <div className="gen-studio-grid gen-studio-grid--studio">
        {/* LEFT : formulaire */}
        <div className="gen-tools">
          {/* Bandeau brand health — affiché si identité incomplète */}
          {brandScore < 4 && (
            <div className="gen-brand-warn-banner">
              <div className="gen-brand-warn-main">
                <AppIcon name="bolt" size={13}/>
                <span>Tes posts seront génériques — ton identité de marque est incomplète ({brandScore}/7 champs)</span>
              </div>
              {onGoBrand && (
                <button className="gen-brand-warn-link" onClick={onGoBrand}>
                  Configurer en 2 min →
                </button>
              )}
            </div>
          )}
          {/* Bandeau "généré depuis le Hub" — affiché seulement en mode autoStart */}
          {preset.autoStart && preset.prefill && (
            <div className="gen-autostart-banner">
              <AppIcon name="bolt" size={12}/>
              <span>Généré depuis ta saisie · modifie les champs et relance si besoin</span>
            </div>
          )}
          <GenFormFields preset={preset} s={s}/>
          {error && (
            <div style={{ marginTop:12, padding:'10px 14px', borderRadius:8, fontSize:12,
              background:'rgba(197,48,48,.06)', border:'1px solid rgba(197,48,48,.15)', color:'#C53030' }}>
              {error}
            </div>
          )}
          <button
            className={`btn-forge${!canGenerate ? ' btn-forge--inactive' : ''}`}
            onClick={canGenerate ? handleGenerate : () => setError(
              { actu:'Décris l\'actu (10 caractères min.)', citation:'Remplis la citation et l\'auteur.', deepdive:'Décris le sujet (5 caractères min.).' }[preset.id]
            )}
            disabled={generating}>
            {generating
              ? <><span style={{ display:'inline-block', width:13, height:13, border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'vb-spin .7s linear infinite' }}/> Génération…</>
              : <><AppIcon name="sparkle" size={15}/> Générer <span style={{ opacity:.65, fontWeight:500 }}>· {genCost} {genCost > 1 ? 'crédits' : 'crédit'}</span></>}
          </button>
        </div>

        {/* RIGHT : colonne résultats — loading épinglé au-dessus du scroll */}
        <div className="gen-results-col">
          {results.some(r => r.loading) && (
            <div className="gen-feed-card gen-feed-card--loading">
              <GenLoader preset={preset} startTime={_genStartTime} exiting={genPhase === 'exiting'}/>
            </div>
          )}
          <div className="gen-feed-panel">
            {results.filter(r => !r.loading).map(item =>
              item.preset_id === 'deepdive'
                ? <DeepDiveEditor key={item.id} item={item}/>
                : <GenFeedCard key={item.id} item={item} onExpand={setExpandedItem}/>
            )}
          </div>
        </div>
      </div>
      {expandedItem && <GenExpandModal item={expandedItem} onClose={() => setExpandedItem(null)}/>}
    </div>
  );
};

const IgCaption = ({ caption }) => {
  const [text, setText]   = React.useState(caption);
  const [copied, setCopied] = React.useState(false);
  const taRef = React.useRef(null);

  // Auto-resize à chaque frappe
  React.useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [text]);

  const copy  = () => navigator.clipboard.writeText(text).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  });
  const reset = () => { setText(caption); };
  const isDirty = text !== caption;

  return (
    <div className="gen-preview-caption gen-ig-caption">
      <div className="caption-head">
        <span className="caption-label">Caption Instagram</span>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {isDirty && (
            <button className="btn btn-ghost btn-sm" onClick={reset}
              style={{ padding:'3px 8px', fontSize:11, color:'var(--app-fg-3)' }}>
              Réinitialiser
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={copy} style={{ padding:'3px 10px', fontSize:11 }}>
            {copied ? '✓ Copié' : 'Copier'}
          </button>
        </div>
      </div>
      <textarea
        ref={taRef}
        className="caption-ig-body caption-ig-editable"
        value={text}
        onChange={e => setText(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
};

/* ── Carte de résultat dans le feed ──────────────────────────────────── */
function downloadImage(dataUrl, filename) {
  var a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename || 'forje-post.jpg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const DD_ROLE_LABEL = { hook:'Hook', setup:'Contexte', content:'Point', climax:'Climax', recap:'Récap', cta:'CTA' };

/* ── Éditeur de carousel Deep Dive ───────────────────────────────────────
   Preview horizontale (comme Instagram) + édition par slide : texte inline
   (re-render Canvas instantané, 0 crédit), changement d'image (recomposite
   le fond serveur puis re-render), caption éditable. */
const DeepDiveEditor = ({ item }) => {
  const shared   = { font: item.font, brand: item.brand, total: item.total || (item.slides || []).length };
  const editable = Array.isArray(item.slides) && item.slides.some(s => s.bg);

  const [slides,  setSlides]  = useState(() =>
    (item.slides && item.slides.length
      ? item.slides.map((s, i) => ({ ...s, image: (item.images || [])[i] || null }))
      : (item.images || []).map((img, i) => ({ position: i + 1, image: img, layout: 'split_bottom' }))));
  const [sel,     setSel]     = useState(0);
  const [caption, setCaption] = useState(item.caption || '');
  const [copied,  setCopied]  = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [zoom,    setZoom]    = useState(false);
  const [imgQuery,      setImgQuery]      = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching,     setSearching]     = useState(false);

  const cur = slides[sel] || {};
  // Ajout d'image (import) : toujours possible — il se fait côté client, sans le fond serveur.
  // Édition du texte : nécessite un fond à repeindre (fond serveur d'une génération fraîche,
  // OU une image importée). Sur un post rechargé de l'historique sans fond, l'ajout d'image
  // reste possible ; le texte redevient éditable dès qu'une image est ajoutée.
  const canEditText = !!(cur.bg || cur.customBg);

  const [tDraft, setTDraft] = useState(cur.title || '');
  const [bDraft, setBDraft] = useState(cur.body  || '');
  const [sDraft, setSDraft] = useState(cur.stat  || '');
  useEffect(() => {
    setTDraft(cur.title || ''); setBDraft(cur.body || ''); setSDraft(cur.stat || '');
    setPicking(false);
  }, [sel]);

  // Re-render Canvas (debounce) quand le texte change — instantané, gratuit
  useEffect(() => {
    if (!canEditText) return;
    const changed = tDraft !== (cur.title || '') || bDraft !== (cur.body || '') || sDraft !== (cur.stat || '');
    if (!changed) return;
    const t = setTimeout(async () => {
      const slide = { ...slides[sel], title: tDraft, body: bDraft, stat: sDraft || null };
      const img = await window.__renderDeepDiveSlideCanvas(slide, shared);
      setSlides(prev => prev.map((s, i) => i === sel ? { ...slide, image: img } : s));
    }, 320);
    return () => clearTimeout(t);
  }, [tDraft, bDraft, sDraft]);

  // Applique un fond à la slide courante (photo web, image importée, ou retour au fond de marque)
  const applyImage = async ({ imageUrl, imageData, clear } = {}) => {
    setBusy(true);
    try {
      const res = await veilleFetch('/generate/regenerate-slide', {
        method: 'POST',
        body: JSON.stringify({
          userId:   window.__currentUser?.id,
          clientId: window.__activeClientId || undefined,
          layout:   cur.layout,
          imageUrl, imageData, clear,
        }),
      });
      const d = await res.json();
      if (d.bg) {
        const slide = { ...slides[sel], bg: d.bg, title: tDraft, body: bDraft, stat: sDraft || null, photoFallback: !!d.photoFallback };
        const img = await window.__renderDeepDiveSlideCanvas(slide, shared);
        setSlides(prev => prev.map((s, i) => i === sel ? { ...slide, image: img } : s));
      }
    } catch (_) {} finally { setBusy(false); setPicking(false); }
  };
  const pickImage = (url) => applyImage({ imageUrl: url });

  // Recherche d'images à la demande (marche même en "Typo seul")
  const runImageSearch = async () => {
    const q = (imgQuery || cur.title || '').trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await veilleFetch('/generate/search-images', { method: 'POST', body: JSON.stringify({ query: q }) });
      const d = await res.json();
      setSearchResults(Array.isArray(d.candidates) ? d.candidates : []);
    } catch (_) { setSearchResults([]); } finally { setSearching(false); }
  };

  // Import d'une image perso depuis le disque → peinte DIRECTEMENT sur le Canvas,
  // instantanément, SANS appel serveur (fichier local = pas de souci CORS).
  const onUploadImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const slide = { ...slides[sel], customBg: reader.result, title: tDraft, body: bDraft, stat: sDraft || null, photoFallback: false };
      const img = await window.__renderDeepDiveSlideCanvas(slide, shared);
      setSlides(prev => prev.map((s, i) => i === sel ? { ...slide, image: img } : s));
      setPicking(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Retire le fond : si c'est une image importée → nettoyage client instantané,
  // sinon (photo web serveur) → recomposition serveur vers le fond de marque.
  const removeBg = async () => {
    if (slides[sel].customBg) {
      const slide = { ...slides[sel], customBg: null, title: tDraft, body: bDraft, stat: sDraft || null, photoFallback: true };
      const img = await window.__renderDeepDiveSlideCanvas(slide, shared);
      setSlides(prev => prev.map((s, i) => i === sel ? { ...slide, image: img } : s));
    } else {
      await applyImage({ clear: true });
    }
  };

  // Ouvre/ferme le sélecteur d'image (préremplit la recherche avec le titre de la slide)
  const togglePicker = () => {
    const opening = !picking;
    setPicking(opening);
    if (opening) { setImgQuery(cur.title || ''); setSearchResults([]); }
  };

  const copyCaption = () => navigator.clipboard.writeText(caption).then(() => {
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  });

  // Slug du sujet pour nommer les fichiers exportés
  const topicSlug = (String(item.topic || item.title || 'deepdive')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)) || 'deepdive';
  const [zipping, setZipping] = useState(false);

  // Télécharge tout le carousel en ZIP (slide-01.jpg…) — ordre garanti
  const downloadCarousel = async () => {
    const imgs = slides.map(s => s.image).filter(Boolean);
    if (!imgs.length) return;
    if (!window.JSZip) { // secours : téléchargements séquentiels si la lib n'a pas chargé
      imgs.forEach((img, i) => setTimeout(() => downloadImage(img, topicSlug + '-slide' + String(i + 1).padStart(2, '0') + '.jpg'), i * 350));
      return;
    }
    setZipping(true);
    try {
      const zip = new window.JSZip();
      for (let i = 0; i < imgs.length; i++) {
        const blob = await (await fetch(imgs[i])).blob();
        zip.file('slide-' + String(i + 1).padStart(2, '0') + '.jpg', blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url; a.download = topicSlug + '-carousel.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) { console.warn('[ZIP]', e.message); } finally { setZipping(false); }
  };
  const downloadOne = () => {
    if (cur.image) downloadImage(cur.image, topicSlug + '-slide' + String(sel + 1).padStart(2, '0') + '.jpg');
  };

  // Valider = enregistrer l'état ÉDITÉ actuel (texte, image importée, caption) dans la DB,
  // en gardant les fonds → le post reste ré-ouvrable et ré-éditable ensuite.
  const [validated, setValidated] = useState(false);
  const validate = async () => {
    const sb = window.__supabase;
    const images = slides.map(s => s.image).filter(Boolean);
    if (!sb || !item.id || typeof item.id === 'number') {
      setValidated('done'); setTimeout(() => setValidated(false), 2500); return;
    }
    setValidated('saving');
    try {
      const meta = {
        topic: item.topic, total: item.total || slides.length,
        font: item.font, brand: item.brand, hashtags: item.hashtags,
        variant: item.variant, caption, slides, images,
      };
      await sb.from('generated_posts').update({ caption, image: images[0] || null, meta }).eq('id', item.id);
      setValidated('done'); setTimeout(() => setValidated(false), 2500);
    } catch (e) { console.warn('[Valider]', e.message); setValidated(false); }
  };

  const isStat = cur.layout === 'stat_focus';
  const openImagePicker = () => { setPicking(true); setImgQuery(cur.title || ''); setSearchResults([]); };

  return (
    <div className="dd-editor-card gen-result--entering">
      {/* Preview grande de la slide sélectionnée */}
      <div className="dd-edit-preview">
        {cur.image
          ? <img src={cur.image} alt={'Slide ' + (sel + 1)} className="dd-edit-preview-img" onClick={() => setZoom(true)} title="Cliquer pour agrandir"/>
          : <div className="gen-feed-thumb-empty" style={{ aspectRatio:'4/5' }}/>}
        {cur.image && (
          <button className="dd-edit-zoom" onClick={() => setZoom(true)} title="Agrandir" aria-label="Agrandir">
            <AppIcon name="image" size={13}/>
          </button>
        )}
        {slides.length > 1 && (
          <>
            <button className="dd-edit-nav dd-edit-nav--prev" onClick={() => setSel(i => (i - 1 + slides.length) % slides.length)} aria-label="Slide précédente">
              <AppIcon name="chevLeft" size={16}/>
            </button>
            <button className="dd-edit-nav dd-edit-nav--next" onClick={() => setSel(i => (i + 1) % slides.length)} aria-label="Slide suivante">
              <AppIcon name="chevRight" size={16}/>
            </button>
          </>
        )}
        <span className="dd-edit-counter">{sel + 1} / {slides.length}</span>
        {cur.photoFallback && (
          <button className="dd-edit-fallback-badge" onClick={openImagePicker} title="Ajouter une image de fond à cette slide">
            <AppIcon name="image" size={11}/> Ajouter une image
          </button>
        )}
      </div>

      {/* Strip horizontale de miniatures (défile comme sur Instagram) */}
      <div className="dd-edit-strip">
        {slides.map((s, i) => (
          <button key={i} className={'dd-edit-thumb' + (i === sel ? ' dd-edit-thumb--active' : '')} onClick={() => setSel(i)} title={'Slide ' + (i + 1) + (s.photoFallback ? ' — image non trouvée' : '')}>
            {s.image ? <img src={s.image} alt=""/> : <span className="dd-edit-thumb-num">{i + 1}</span>}
            {s.photoFallback && s.image && <span className="dd-edit-thumb-warn" title="Pas d’image de fond — ajoute-en une">+</span>}
            <span className="dd-edit-thumb-role">{DD_ROLE_LABEL[s.role] || (i + 1)}</span>
          </button>
        ))}
      </div>

      {/* Panneau d'édition de la slide */}
      {(
        <div className="dd-edit-panel">
          {canEditText ? (<>
          <div className="dd-edit-field">
            <label>Titre</label>
            <input value={tDraft} onChange={e => setTDraft(e.target.value)} spellCheck={false} placeholder="Titre de la slide"/>
          </div>
          {isStat && (
            <div className="dd-edit-field">
              <label>Chiffre (affiché en géant)</label>
              <input value={sDraft} onChange={e => setSDraft(e.target.value)} spellCheck={false} placeholder="87%"/>
            </div>
          )}
          <div className="dd-edit-field">
            <label>{cur.layout === 'list_recap' ? 'Points (séparés par « • »)' : 'Texte'}</label>
            <textarea rows={2} value={bDraft} onChange={e => setBDraft(e.target.value)} spellCheck={false} placeholder="Contenu de la slide"/>
          </div>
          </>) : (
            <div style={{ fontSize:12, color:'var(--app-fg-3)', lineHeight:1.5 }}>
              Ajoute une image de fond ci-dessous. Pour rééditer le texte de ce post enregistré, relance une génération.
            </div>
          )}
          <div className="dd-edit-actions">
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={togglePicker}>
              <AppIcon name="image" size={12}/> {picking ? 'Fermer' : (cur.photoFallback ? 'Ajouter une image' : 'Changer l’image')}
            </button>
            {busy && <span style={{ fontSize:11, color:'var(--app-fg-3)' }}>Recomposition…</span>}
          </div>
          {picking && (
            <div className="dd-edit-picker">
              <div className="dd-edit-picker-row">
                <label className="btn btn-primary btn-sm dd-edit-upload">
                  <AppIcon name="arrowUp" size={12}/> Importer mon image
                  <input type="file" accept="image/*" onChange={onUploadImage} hidden/>
                </label>
                {(cur.customBg || !cur.photoFallback) && (
                  <button className="btn btn-ghost btn-sm" onClick={removeBg} disabled={busy} title="Revenir au fond de marque">
                    Retirer le fond
                  </button>
                )}
              </div>
              <div className="dd-edit-picker-sep">ou chercher sur le web</div>
              <div className="dd-edit-search">
                <input
                  value={imgQuery}
                  onChange={e => setImgQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') runImageSearch(); }}
                  placeholder="Mot-clé (ex : stade PSG)…"
                  spellCheck={false}
                />
                <button className="btn btn-ghost btn-sm" onClick={runImageSearch} disabled={searching || busy}>
                  {searching ? '…' : 'Chercher'}
                </button>
              </div>
              {(() => {
                const shown = searchResults.length ? searchResults : (cur.candidates || []);
                if (!shown.length) {
                  return <div className="dd-edit-picker-hint">{searching ? 'Recherche…' : 'Importe ton image (instantané) — ou cherche une photo sur le web.'}</div>;
                }
                return (
                  <div className="dd-edit-candidates">
                    {shown.map((url, i) => (
                      <button key={i} className="dd-edit-cand" onClick={() => pickImage(url)} disabled={busy}>
                        <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer"/>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Caption + téléchargement */}
      <div className="gen-feed-caption-wrap">
        <div className="caption-head">
          <span className="caption-label">Caption Instagram</span>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <button className="btn btn-accent btn-sm" onClick={downloadCarousel} disabled={zipping} style={{ padding:'3px 10px', fontSize:11, display:'flex', alignItems:'center', gap:5 }}>
              <AppIcon name="arrowUp" size={11}/> {zipping ? 'Compression…' : 'Télécharger le carousel'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={downloadOne} title="Télécharger la slide affichée" style={{ padding:'3px 10px', fontSize:11 }}>
              Slide {sel + 1}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={copyCaption} style={{ padding:'3px 10px', fontSize:11 }}>
              {copied ? '✓ Copié' : 'Copier'}
            </button>
          </div>
        </div>
        <textarea className="caption-ig-body caption-ig-editable" value={caption} onChange={e => setCaption(e.target.value)} spellCheck={false}/>
        {Array.isArray(item.hashtags) && item.hashtags.length > 0 && (
          <div className="dd-edit-hashtags">{item.hashtags.join(' ')}</div>
        )}
      </div>

      {/* Valider — enregistre les modifs, le post reste ré-éditable ensuite */}
      <button className="btn btn-accent dd-edit-validate" onClick={validate} disabled={validated === 'saving'}>
        {validated === 'saving' ? 'Enregistrement…' : validated === 'done' ? '✓ Carousel validé' : 'Valider le carousel'}
      </button>

      {/* Prévisualisation plein écran (clic sur la slide) */}
      {zoom && (
        <GenExpandModal
          item={{ preset_id: 'deepdive', images: slides.map(s => s.image).filter(Boolean) }}
          initialSlide={sel}
          onClose={() => setZoom(false)}
        />
      )}
    </div>
  );
};

const GenFeedCard = ({ item, onExpand }) => {
  const src0 = item.preset_id === 'deepdive' ? item.images?.[0] : item.image;
  const [src,     setSrc]     = useState(src0 || null);
  const [caption, setCaption] = useState(item.caption || '');
  const [copied,  setCopied]  = useState(false);
  const taRef = useRef(null);

  // Lazy-load image for historical posts (excluded from initial SELECT for perf)
  useEffect(() => {
    if (src || !item.id || typeof item.id === 'number') return;
    const sb = window.__supabase;
    if (!sb) return;
    sb.from('generated_posts').select('image').eq('id', item.id).single()
      .then(({ data }) => { if (data?.image) setSrc(data.image); });
  }, [item.id]);

  const copy = () => navigator.clipboard.writeText(caption).then(() => {
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  });

  return (
    <div className="gen-feed-card gen-result--entering">
      <div className="gen-feed-thumb" onClick={() => onExpand({ ...item, image: src || item.image })} title="Voir en grand">
        {src ? <img src={src} alt=""/> : <div className="gen-feed-thumb-empty"/>}
        <div className="gen-feed-thumb-expand"><AppIcon name="image" size={13}/></div>
      </div>
      <div className="gen-feed-content">
        {item.title && (
          <div className="gen-feed-meta">
            {item.category && <span className="caption-label" style={{fontSize:11}}>{item.category}</span>}
            <div className="gen-feed-title">{item.title}</div>
            {item.subtitle && <div className="gen-feed-subtitle">{item.subtitle}</div>}
          </div>
        )}
        {item.photoFallback && (
          <div style={{ display:'flex', alignItems:'flex-start', gap:8, margin:'2px 0 4px', padding:'8px 11px',
            background:'rgba(245,158,11,.10)', border:'1px solid rgba(245,158,11,.28)', borderRadius:9,
            fontSize:12, color:'#b45309', lineHeight:1.45 }}>
            <AppIcon name="image" size={13}/>
            <span>{item.notice || 'Aucune photo pertinente trouvée — ajoute ta propre image pour un rendu plus fort.'}</span>
          </div>
        )}
        <div className="gen-feed-caption-wrap">
          <div className="caption-head">
            <span className="caption-label">Caption Instagram</span>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              {src && (
                <button className="btn btn-accent btn-sm" onClick={() => downloadImage(src)}
                  style={{ padding:'3px 10px', fontSize:11, display:'flex', alignItems:'center', gap:5 }}>
                  <AppIcon name="arrowUp" size={11}/>
                  Télécharger
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={copy} style={{padding:'3px 10px', fontSize:11}}>
                {copied ? '✓ Copié' : 'Copier'}
              </button>
            </div>
          </div>
          <textarea
            ref={taRef}
            className="caption-ig-body caption-ig-editable"
            value={caption}
            onChange={e => setCaption(e.target.value)}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
};

/* ── Modale plein écran d'une carte ──────────────────────────────────── */
const GenExpandModal = ({ item, onClose, initialSlide = 0 }) => {
  const images = item.preset_id === 'deepdive' ? (item.images || []) : (item.image ? [item.image] : []);
  const [slide, setSlide] = useState(initialSlide);
  const multi = images.length > 1;
  const prev = () => setSlide(s => (s - 1 + images.length) % images.length);
  const next = () => setSlide(s => (s + 1) % images.length);
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose();
      if (multi && e.key === 'ArrowLeft')  prev();
      if (multi && e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [multi, images.length]);

  const cur = images[slide] || images[0];
  const dl = () => {
    if (!cur) return;
    const base = item.preset_id || 'forje';
    downloadImage(cur, base + '-' + (multi ? 'slide' + String(slide + 1).padStart(2, '0') : 'post') + '.jpg');
  };

  return (
    <div className="gen-expand-overlay" onClick={onClose}>
      <div className="gen-expand-modal" onClick={e => e.stopPropagation()}>
        <button className="gen-expand-close" onClick={onClose}>
          <AppIcon name="x" size={16}/>
        </button>
        {multi && <button className="gen-expand-nav gen-expand-nav--prev" onClick={prev} aria-label="Précédent"><AppIcon name="chevLeft" size={20}/></button>}
        <img src={cur} alt="" className="gen-expand-img"/>
        {multi && <button className="gen-expand-nav gen-expand-nav--next" onClick={next} aria-label="Suivant"><AppIcon name="chevRight" size={20}/></button>}
        <div className="gen-expand-bar">
          <button className="btn btn-accent btn-sm" onClick={dl} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <AppIcon name="arrowUp" size={12}/> Télécharger{multi ? ' la slide' : ''}
          </button>
          {multi && <span className="gen-expand-count">{slide + 1} / {images.length}</span>}
        </div>
        {multi && (
          <div className="gen-expand-slides">
            {images.map((_, i) => (
              <button key={i} className={`gen-variant-btn${slide===i?' active':''}`} onClick={() => setSlide(i)}>
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const GenerateStudio = GenerateChat;

const ToolSection = ({ title, icon, children }) => (
  <div className="tool-section">
    <div className="tool-section-head">
      <AppIcon name={icon} size={12}/>
      <span>{title}</span>
    </div>
    {children}
  </div>
);
const Pill = ({ active, children }) => (
  <button className={`tool-pill ${active ? 'active' : ''}`}>{children}</button>
);
const VisualOption = ({ kind, label, active }) => (
  <button className={`visual-option visual-option--${kind} ${active?'active':''}`}>
    <div className="visual-option-thumb"/>
    <span>{label}</span>
  </button>
);

const GenMsg = ({ who, system, children }) => (
  <div className={`gen-msg gen-msg--${who} ${system ? 'gen-msg--system' : ''}`}>
    {who === 'forje' && !system && <div className="gen-msg-avatar"/>}
    <div className="gen-msg-bubble">{children}</div>
  </div>
);

// Post preview — 3 variations, all 1:1
const PostPreviewCard = ({ variant, preset }) => {
  if (preset.visual === 'actu' || variant === 0) {
    return (
      <div className="post-preview post-preview--typo-camel">
        <div className="post-preview-kicker">DEPUIS 1981</div>
        <div className="post-preview-headline">
          Annonay<br/>toujours.
        </div>
        <div className="post-preview-sig">Forje · maison Tessier</div>
      </div>
    );
  }
  if (variant === 1) {
    return (
      <div className="post-preview post-preview--photo">
        <div className="post-preview-photo-layer"/>
        <div className="post-preview-photo-label">
          <div className="small-kicker">LIVRAISON 518</div>
          <div className="headline-photo">Camel<br/>saturé.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="post-preview post-preview--split">
      <div className="split-left">
        <div className="post-preview-kicker">AH · 25</div>
        <div className="split-headline">44 ans<br/>d'une&nbsp;seule<br/><span>tannerie.</span></div>
        <div className="split-foot">Maison Tessier · depuis 1981</div>
      </div>
      <div className="split-right">
        <div className="split-swatch"/>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE — 3 toggleable views
// ═══════════════════════════════════════════════════════════════════════════
const QueueScreen = ({ defaultView = 'calendar' }) => {
  const [view, setView] = useState(defaultView);
  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <h1 className="page-title">File de validation</h1>
          <p className="page-subtitle">7 posts programmés cette semaine · 2 à valider avant 18h</p>
        </div>
        <div className="page-header-actions">
          <div className="view-toggle">
            <button className={`view-btn ${view==='calendar'?'active':''}`} onClick={()=>setView('calendar')}>
              <AppIcon name="calendar" size={13}/> Calendrier
            </button>
            <button className={`view-btn ${view==='feed'?'active':''}`} onClick={()=>setView('feed')}>
              <AppIcon name="list" size={13}/> Feed
            </button>
            <button className={`view-btn ${view==='grid'?'active':''}`} onClick={()=>setView('grid')}>
              <AppIcon name="grid" size={13}/> Grille
            </button>
          </div>
          <Btn variant="primary" icon="plus">Nouveau post</Btn>
        </div>
      </div>

      {view === 'calendar' && <QueueCalendar/>}
      {view === 'feed' && <QueueFeed/>}
      {view === 'grid' && <QueueGrid/>}
    </div>
  );
};

const CAL_EVENTS = [];
const DAY_LABELS = ['LUN','MAR','MER','JEU','VEN','SAM','DIM'];
const getWeekDays = (offset = 0) => {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
  return DAY_LABELS.map((l, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    return { label: l, num: d.getDate(), date: d };
  });
};
const fmtWeekRange = (days) => {
  const start = days[0].date;
  const end = days[6].date;
  const opts = { month:'long' };
  const sameMonth = start.getMonth() === end.getMonth();
  return sameMonth
    ? `${start.getDate()} – ${end.getDate()} ${start.toLocaleDateString('fr-FR', opts)} ${start.getFullYear()}`
    : `${start.getDate()} ${start.toLocaleDateString('fr-FR', opts)} – ${end.getDate()} ${end.toLocaleDateString('fr-FR', opts)} ${end.getFullYear()}`;
};
const QueueCalendar = () => {
  const [weekOffset, setWeekOffset] = useState(0);
  const WEEK = getWeekDays(weekOffset);
  const todayNum = new Date().getDate();
  const todayOffset = 0;
  return (
  <div className="card cal-card">
    <div className="cal-head">
      <div className="cal-nav">
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setWeekOffset(o => o - 1)}><AppIcon name="chevLeft" size={12}/></button>
        <span className="cal-range">{fmtWeekRange(WEEK)}</span>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setWeekOffset(o => o + 1)}><AppIcon name="chevRight" size={12}/></button>
      </div>
      <div className="cal-legend">
        <span className="cal-legend-item"><i className="cal-swatch cal-swatch--quote"/>Citation</span>
        <span className="cal-legend-item"><i className="cal-swatch cal-swatch--bts"/>Coulisses</span>
        <span className="cal-legend-item"><i className="cal-swatch cal-swatch--product"/>Produit</span>
        <span className="cal-legend-item"><i className="cal-swatch cal-swatch--news"/>Actu</span>
        <span className="cal-legend-item"><i className="cal-swatch cal-swatch--pedago"/>Pédago</span>
      </div>
    </div>
    <div className="cal-grid">
      <div className="cal-hours-col">
        <div className="cal-day-head"></div>
        {[6,8,10,12,14,16,18,20].map(h => (
          <div key={h} className="cal-hour">{h}:00</div>
        ))}
      </div>
      {WEEK.map((d, di) => {
        const isToday = weekOffset === 0 && di === ((new Date().getDay() + 6) % 7);
        return (
          <div key={di} className="cal-day-col">
            <div className="cal-day-head">
              <span className="cal-day-label">{d.label}</span>
              <span className={`cal-day-num ${isToday ? 'today' : ''}`}>{d.num}</span>
            </div>
            {[6,8,10,12,14,16,18,20].map(h => <div key={h} className="cal-slot"/>)}
            {CAL_EVENTS.filter(e => e.day === di).map((e, i) => {
              const top = ((e.hour - 6) / 2) * 64 + 40;
              return (
                <div key={i} className={`cal-event cal-event--${e.type} ${e.status==='draft'?'draft':''}`}
                     style={{top, height: e.dur * 64 - 6}}>
                  <div className="cal-event-time">{e.hour}:00</div>
                  <div className="cal-event-title">{e.title}</div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  </div>
  );
};

const FEED_ITEMS = [
  { when:'Mardi 15 oct · 08:00', type:'Citation', swatch:'quote', status:'ready',
    title:'« L\'excellence, c\'est la répétition faite belle. »',
    caption:'Un geste, répété chaque jour depuis 1981. Pas un rituel — une discipline.' },
  { when:'Mardi 15 oct · 19:30', type:'Coulisses', swatch:'bts', status:'ready',
    title:'Piquage main · machine n°3',
    caption:'Noémie a rejoint l\'atelier il y a trois ans. Elle pique le cuir comme son grand-père montait les meubles.' },
  { when:'Mercredi 16 oct · 10:00', type:'Actu', swatch:'news', status:'draft',
    title:'L\'émission Artisans de France dans nos murs',
    caption:'Tournage toute la journée dans l\'atelier. Diffusion le 12 novembre sur France 2.' },
  { when:'Mercredi 16 oct · 18:00', type:'Produit', swatch:'product', status:'ready',
    title:'Margot · édition camel · en ligne',
    caption:'Le Margot revient en camel saturé — tannage Annonay, 44 pièces, numérotées.' },
  { when:'Jeudi 17 oct · 12:00', type:'Pédagogie', swatch:'pedago', status:'draft',
    title:'Le mot du métier : skiver',
    caption:'Amincir le cuir à l\'endroit d\'un pli. Pour qu\'il tombe, pas qu\'il se casse.' },
];
const QueueFeed = () => {
  const [validated, setValidated] = useState(new Set());
  const [preview, setPreview] = useState(null);
  return (
    <div className="queue-feed">
      {preview && (
        <div className="feed-preview-overlay" onClick={() => setPreview(null)}>
          <div className="feed-preview-modal" onClick={e => e.stopPropagation()}>
            <div className={`feed-preview-thumb feed-thumb--${preview.swatch}`}>
              <div className="feed-thumb-inner" style={{transform:'scale(2.5)', transformOrigin:'center'}}>
                {preview.swatch === 'quote' && <div className="feed-thumb-quote">"</div>}
                {preview.swatch === 'bts' && <div className="feed-thumb-label">COULISSES<br/>03</div>}
                {preview.swatch === 'news' && <div className="feed-thumb-chip">• ACTU</div>}
                {preview.swatch === 'product' && <div className="feed-thumb-label">MARGOT<br/>CAMEL</div>}
                {preview.swatch === 'pedago' && <div className="feed-thumb-label">LE MOT<br/>Skiver</div>}
              </div>
            </div>
            <div style={{padding:'20px 24px'}}>
              <div className="feed-title" style={{fontSize:16, marginBottom:8}}>{preview.title}</div>
              <div className="feed-caption" style={{fontSize:13}}>{preview.caption}</div>
            </div>
            <button onClick={() => setPreview(null)} style={{position:'absolute',top:12,right:14,background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--app-fg-3)'}}>×</button>
          </div>
        </div>
      )}
      {FEED_ITEMS.map((it, i) => {
        const isValidated = validated.has(i);
        return (
          <div key={i} className={`feed-row card${isValidated ? ' feed-row--validated' : ''}`}>
            <div className={`feed-thumb feed-thumb--${it.swatch}`}>
              <div className="feed-thumb-inner">
                {it.swatch === 'quote' && <div className="feed-thumb-quote">"</div>}
                {it.swatch === 'bts' && <div className="feed-thumb-label">COULISSES<br/>03</div>}
                {it.swatch === 'news' && <div className="feed-thumb-chip">• ACTU</div>}
                {it.swatch === 'product' && <div className="feed-thumb-label">MARGOT<br/>CAMEL</div>}
                {it.swatch === 'pedago' && <div className="feed-thumb-label">LE MOT<br/>Skiver</div>}
              </div>
            </div>
            <div className="feed-meta">
              <div className="feed-meta-top">
                <span className="feed-when">{it.when}</span>
                <span className="feed-dot">·</span>
                <span className="feed-type">{it.type}</span>
                <span className={`tag tag-dot ${isValidated ? 'tag-success' : it.status==='ready' ? 'tag-success' : 'tag-warn'}`} style={{marginLeft:'auto'}}>
                  {isValidated ? '✓ Validé' : it.status==='ready' ? 'Prêt' : 'Brouillon'}
                </span>
              </div>
              <div className="feed-title">{it.title}</div>
              <div className="feed-caption">{it.caption}</div>
              <div className="feed-actions">
                <Btn variant="ghost" size="sm" icon="eye" onClick={() => setPreview(it)}>Aperçu</Btn>
                <Btn variant="ghost" size="sm" icon="edit">Éditer</Btn>
                {!isValidated
                  ? <Btn variant="accent" size="sm" icon="check" onClick={() => setValidated(v => new Set([...v, i]))}>Valider</Btn>
                  : <Btn variant="ghost" size="sm" icon="check" style={{color:'var(--app-success,#16a34a)'}} onClick={() => setValidated(v => { const n=new Set(v); n.delete(i); return n; })}>Validé ✓</Btn>}
                <Btn variant="ghost" size="sm" icon="more" style={{marginLeft:'auto'}}/>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const GRID_ITEMS = [
  { kind:'quote',   label:'« L\'excellence… »',      status:'done' },
  { kind:'bts',     label:'Piquage · Noémie',         status:'done' },
  { kind:'news',    label:'Artisans de France',       status:'done' },
  { kind:'product', label:'Margot camel',             status:'planned' },
  { kind:'pedago',  label:'Skiver',                   status:'planned' },
  { kind:'quote',   label:'« Trois générations »',    status:'planned' },
  { kind:'product', label:'Sac Louise',               status:'published' },
  { kind:'bts',     label:'Tannerie Annonay',         status:'published' },
  { kind:'quote',   label:'« Le temps est matière »', status:'published' },
];
const QueueGrid = () => (
  <div className="queue-grid-wrap">
    <div className="queue-grid-legend">
      <span><i className="legend-dot legend-dot--planned"/>Programmé</span>
      <span><i className="legend-dot legend-dot--done"/>À publier cette semaine</span>
      <span><i className="legend-dot legend-dot--published"/>Publié</span>
      <span style={{marginLeft:'auto', color:'var(--app-fg-4)', fontSize:11}}>
        Aperçu du feed Instagram — 9 dernières cases
      </span>
    </div>
    <div className="ig-grid">
      {GRID_ITEMS.map((it, i) => (
        <div key={i} className={`ig-cell ig-cell--${it.kind} ig-cell--${it.status}`}>
          <PresetPreview kind={it.kind === 'quote' ? 'quote' : it.kind === 'bts' ? 'bts' : it.kind === 'news' ? 'actu' : it.kind === 'product' ? 'product' : 'pedago'}/>
          <div className="ig-cell-foot">
            <span className={`ig-cell-status ig-cell-status--${it.status}`}>
              {it.status === 'done' && '◆ Cette semaine'}
              {it.status === 'planned' && '◇ Programmé'}
              {it.status === 'published' && '✓ Publié · 1.2k'}
            </span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ═════════════════════════════════════════════════════════════════════════// BRAND — Identite Visuelle
// =============================================================================

// 5 font packs bases sur l'analyse des medias Instagram 2026
const FONT_PACKS = [
  {
    id: 'impact-news', name: 'Impact News',
    tags: ['Puissant', 'Direct', 'Urgent'], usage: 'Breaking, Actu, Sport',
    displayFont: "'Bebas Neue',Impact,sans-serif",
    bg: '#ffffff',
    decoType: 'word', decoBg: '#f0f0f0', decoText: 'NOW',
    catStyle:  { fontFamily:"'Barlow Condensed',Arial,sans-serif", fontWeight:600, fontSize:8, letterSpacing:'0.25em', textTransform:'uppercase', color:'#999' },
    headStyle: { fontFamily:"'Bebas Neue',Impact,sans-serif", fontSize:34, fontWeight:400, letterSpacing:'0.02em', textTransform:'uppercase', lineHeight:'0.9', color:'#0a0a0a' },
    subStyle:  { fontFamily:"'Barlow Condensed',Arial,sans-serif", fontWeight:700, fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', color:'#333' },
    bodyStyle: { fontFamily:"Barlow,Arial,sans-serif", fontWeight:300, fontSize:8, color:'#777', lineHeight:'1.6' },
    sampleCat: 'Breaking', sampleHead: 'LA FRANCE EN ALERTE', sampleSub: 'Gouvernement · 14h32', sampleBody: 'Le PM annonce un plan urgence.',
  },
  {
    id: 'edito-luxe', name: 'Edito Luxe',
    tags: ['Elegant', 'Editorial', 'Luxe'], usage: 'Magazine, Culture, Interview',
    displayFont: "'Playfair Display',Georgia,serif",
    bg: '#1a1612',
    decoType: 'char', decoBg: '#2a2418', decoText: 'E',
    catStyle:  { fontFamily:"Jost,Arial,sans-serif", fontWeight:200, fontSize:7, letterSpacing:'0.4em', textTransform:'uppercase', color:'#8a7a60' },
    headStyle: { fontFamily:"'Playfair Display',Georgia,serif", fontSize:28, fontWeight:900, fontStyle:'italic', lineHeight:'1.05', color:'#e8ddc8', letterSpacing:'-0.01em' },
    subStyle:  { fontFamily:"'Cormorant Garamond',Georgia,serif", fontWeight:600, fontSize:10, color:'#a08060', letterSpacing:'0.05em' },
    bodyStyle: { fontFamily:"Jost,Arial,sans-serif", fontWeight:200, fontSize:8, color:'#6a5a48', lineHeight:'1.8' },
    sampleCat: 'Culture — Cinema', sampleHead: "L'art de prendre le temps", sampleSub: 'Rencontre avec Sofia Coppola', sampleBody: 'Une conversation sur la creation.',
  },
  {
    id: 'digital-native', name: 'Digital Native',
    tags: ['Tech', 'Gen Z', 'Nerdy'], usage: 'Tech, IA, Culture Gen Z',
    displayFont: "'Space Grotesk',Arial,sans-serif",
    bg: '#0d0f14',
    decoType: 'grid', decoBg: '#1a1f2e',
    catStyle:  { fontFamily:"'DM Mono','Courier New',monospace", fontSize:7, letterSpacing:'0.2em', textTransform:'lowercase', color:'#4060ff' },
    headStyle: { fontFamily:"'Space Grotesk',Arial,sans-serif", fontSize:30, fontWeight:700, letterSpacing:'-0.03em', lineHeight:'1.0', color:'#e8eeff' },
    subStyle:  { fontFamily:"'DM Sans',Arial,sans-serif", fontWeight:500, fontSize:8, color:'#6080cc', letterSpacing:'0.02em' },
    bodyStyle: { fontFamily:"'DM Mono','Courier New',monospace", fontSize:7, color:'#405888', lineHeight:'1.6' },
    sampleCat: '// Tech — 09:41 AM', sampleHead: "L'IA change tout.", sampleSub: 'OpenAI · Anthropic · 2026', sampleBody: '→ thread complet en story',
  },
  {
    id: 'minimal-power', name: 'Minimal Power',
    tags: ['Premium', 'Silence', 'Autorite'], usage: 'Finance, Economie, Premium',
    displayFont: "Syne,'Arial Black',sans-serif",
    bg: '#f5f4f2',
    decoType: 'line', decoBg: '#ddd',
    catStyle:  { fontFamily:"Outfit,Arial,sans-serif", fontWeight:200, fontSize:7, letterSpacing:'0.5em', textTransform:'uppercase', color:'#bbb' },
    headStyle: { fontFamily:"Syne,'Arial Black',sans-serif", fontSize:34, fontWeight:800, letterSpacing:'-0.04em', lineHeight:'0.9', textTransform:'uppercase', color:'#111' },
    subStyle:  { fontFamily:"Outfit,Arial,sans-serif", fontWeight:600, fontSize:8, letterSpacing:'0.15em', textTransform:'uppercase', color:'#555' },
    bodyStyle: { fontFamily:"Outfit,Arial,sans-serif", fontWeight:200, fontSize:8, color:'#999', lineHeight:'1.9' },
    sampleCat: 'Opinion — Finance', sampleHead: 'BOURSE CRASH 2026', sampleSub: 'Analyse · Bloomberg Markets', sampleBody: 'Quand le silence des marches devient signal.',
  },
  {
    id: 'neo-retro', name: 'Neo-Retro',
    tags: ['Chaleureux', 'Humain', 'Nostalgique'], usage: 'Enquetes, Lifestyle, Slow media',
    displayFont: "'DM Serif Display',Georgia,serif",
    bg: '#1c1410',
    decoType: 'quote', decoBg: '#2a1e14',
    catStyle:  { fontFamily:"Lato,Arial,sans-serif", fontWeight:300, fontSize:7, letterSpacing:'0.35em', textTransform:'uppercase', color:'#c8a87a' },
    headStyle: { fontFamily:"'DM Serif Display',Georgia,serif", fontSize:28, fontStyle:'italic', lineHeight:'1.05', color:'#f0e8d8', fontWeight:400 },
    subStyle:  { fontFamily:"'DM Serif Text',Georgia,serif", fontSize:10, color:'#a08060', letterSpacing:'0.02em', fontWeight:400 },
    bodyStyle: { fontFamily:"Lato,Arial,sans-serif", fontWeight:300, fontSize:8, color:'#6a5848', lineHeight:'1.8' },
    sampleCat: 'Societe — Enquete', sampleHead: 'Vivre autrement, enfin.', sampleSub: 'Le grand retour des communs', sampleBody: 'Des milliers reinventent le collectif.',
  },
];

const PACK_FONTS = {
  'impact-news':    'Bebas Neue',
  'edito-luxe':     'Playfair Display',
  'digital-native': 'Space Grotesk',
  'minimal-power':  'Syne',
  'neo-retro':      'DM Serif Display',
};

const STYLE_TO_PACK = {
  'magazine': 'edito-luxe', 'breaking': 'impact-news', 'sport': 'impact-news',
  'lifestyle': 'neo-retro', 'minimaliste': 'minimal-power',
};

const BRAND_MOODS = [
  { id: 'dramatique', label: 'Dramatique', desc: 'Ambiance sombre et intense. Ombres, contrastes forts, cinematique.' },
  { id: 'energique',  label: 'Energique',  desc: 'Dynamisme et couleurs vibrantes. Cadrage en mouvement.' },
  { id: 'premium',    label: 'Premium',    desc: 'Elegance et sobriete. Lumiere douce, composition epuree.' },
  { id: 'populaire',  label: 'Populaire',  desc: 'Direct et immediatement lisible. Contraste maximal.' },
  { id: 'factuel',    label: 'Factuel',    desc: 'Propre et neutre. Journalistique. Credibilite avant tout.' },
];

const BRAND_TONES = [
  'Direct', 'Percutant', 'Informatif', 'Premium', 'Populaire',
  'Serieux', 'Engage', 'Decale', 'Expert', 'Accessible',
  'Emotionnel', 'Factuel', 'Inspirant', 'Provocateur', 'Pedagogue',
];

// Carte "Brand Kit" — pack personnalisé basé sur font_primary / fontBody du client
const CustomPackCard = function(props) {
  var active = props.active; var onSelect = props.onSelect;
  var fontTitle = props.fontPrimary || 'DM Sans';
  var fontBody  = props.fontBody    || 'DM Sans';
  var accent    = props.accentColor || '#6366F1';
  var primary   = props.primaryColor|| '#111';
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:8, overflow:'hidden',
      transition:'border-color .15s',
      border:'2px solid ' + (active ? accent : 'var(--app-line)'),
      background: active ? 'rgba(99,102,241,.04)' : 'transparent' }}>
      <div style={{ aspectRatio:'4/5', background:'#0a0a12', position:'relative', overflow:'hidden',
        padding:'10px 9px', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
        <div style={{ position:'absolute', top:-6, right:-4, fontSize:68, lineHeight:'1', opacity:.13,
          fontFamily:"'" + fontTitle + "',sans-serif", color:'#fff', pointerEvents:'none', userSelect:'none' }}>
          Aa
        </div>
        <div style={{ fontSize:7, letterSpacing:'0.3em', textTransform:'uppercase', color: accent, fontFamily:'DM Sans,sans-serif', fontWeight:600, position:'relative', zIndex:1 }}>
          Brand Kit
        </div>
        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ fontFamily:"'" + fontTitle + "',Impact,sans-serif", fontSize:22, fontWeight:700, lineHeight:'1.0', color:'#fff', marginBottom:4 }}>
            TON TITRE ICI
          </div>
          <div style={{ fontFamily:"'" + fontBody + "',DM Sans,sans-serif", fontSize:8, color:'rgba(255,255,255,.45)', lineHeight:'1.6' }}>
            Corps de texte
          </div>
        </div>
        <div style={{ fontSize:8, color:'rgba(255,255,255,.25)', fontFamily:'DM Sans,sans-serif' }}>{fontTitle}</div>
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background: accent }}/>
      </div>
      <div style={{ padding:'8px 10px', background:'var(--app-surface-2)', borderTop:'1px solid var(--app-line)' }}>
        <div style={{ fontWeight:600, fontSize:11, marginBottom:3, color: active ? accent : 'var(--app-fg)' }}>Personnalisé</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:3, marginBottom:3 }}>
          {['Brand Kit', 'Sur mesure'].map(function(t) {
            return <span key={t} style={{ fontSize:8, padding:'1px 5px', borderRadius:8, border:'1px solid var(--app-line)', color:'var(--app-fg-4)' }}>{t}</span>;
          })}
        </div>
        <div style={{ fontSize:9, color:'var(--app-fg-4)' }}>{fontTitle} + {fontBody}</div>
      </div>
    </div>
  );
};

// Mini card representing a font pack (used in the picker grid)
const PackMiniCard = function(props) {
  var pack = props.pack; var active = props.active; var onSelect = props.onSelect;
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:8, overflow:'hidden',
      transition:'border-color .15s',
      border:'2px solid ' + (active ? 'var(--app-accent)' : 'var(--app-line)'),
      background: active ? 'rgba(99,102,241,.04)' : 'transparent' }}>
      <div style={{ aspectRatio:'4/5', background:pack.bg, position:'relative', overflow:'hidden',
        padding:'10px 9px', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
        {pack.decoType === 'word' && (
          <div style={{ position:'absolute', top:-4, right:-4, fontSize:72, lineHeight:'1',
            fontFamily:pack.displayFont, color:pack.decoBg, pointerEvents:'none', userSelect:'none' }}>
            {pack.decoText}
          </div>
        )}
        {pack.decoType === 'grid' && (
          <div style={{ position:'absolute', inset:0, opacity:.6,
            backgroundImage:'linear-gradient('+pack.decoBg+' 1px,transparent 1px),linear-gradient(90deg,'+pack.decoBg+' 1px,transparent 1px)',
            backgroundSize:'16px 16px' }}/>
        )}
        {pack.decoType === 'quote' && (
          <div style={{ position:'absolute', bottom:-8, right:4, fontSize:52, lineHeight:'1',
            fontFamily:pack.displayFont, color:pack.decoBg, pointerEvents:'none', userSelect:'none' }}>"</div>
        )}
        {pack.decoType === 'char' && (
          <div style={{ position:'absolute', top:-4, right:4, fontSize:60, lineHeight:'1',
            fontFamily:pack.displayFont, fontStyle:'italic', color:pack.decoBg, pointerEvents:'none', userSelect:'none' }}>
            {pack.decoText}
          </div>
        )}
        {pack.decoType === 'line' && (
          <div style={{ position:'absolute', bottom:20, left:9, right:9, height:1, background:pack.decoBg }}/>
        )}
        <div style={{ ...pack.catStyle, position:'relative', zIndex:1 }}>{pack.sampleCat}</div>
        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ ...pack.headStyle }}>{pack.sampleHead}</div>
          <div style={{ height:4 }}/>
          <div style={{ ...pack.subStyle }}>{pack.sampleSub}</div>
        </div>
        <div style={{ ...pack.bodyStyle, position:'relative', zIndex:1 }}>{pack.sampleBody}</div>
      </div>
      <div style={{ padding:'8px 10px', background:'var(--app-surface-2)', borderTop:'1px solid var(--app-line)' }}>
        <div style={{ fontWeight:600, fontSize:11, marginBottom:3,
          color: active ? 'var(--app-accent)' : 'var(--app-fg)' }}>{pack.name}</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:3, marginBottom:3 }}>
          {pack.tags.map(function(t) {
            return <span key={t} style={{ fontSize:8, padding:'1px 5px', borderRadius:8,
              border:'1px solid var(--app-line)', color:'var(--app-fg-4)' }}>{t}</span>;
          })}
        </div>
        <div style={{ fontSize:9, color:'var(--app-fg-4)' }}>{pack.usage}</div>
      </div>
    </div>
  );
};

// Live preview panel (right column)
const BrandPostPreview = function(props) {
  var isCustom     = props.graphicStyle === 'custom';
  var pack         = isCustom ? null : FONT_PACKS.find(function(p) { return p.id === props.graphicStyle; });
  var primaryColor = props.primaryColor;
  var accentColor  = props.accentColor;
  var logoUrl      = props.logoUrl;
  var name         = props.name;
  var badgeVisible = props.badgeVisible !== false;
  var barVisible   = props.barVisible !== false;
  var fontTitle    = props.fontPrimary || (pack ? pack.headStyle.fontFamily : 'DM Sans');
  var fontBody     = props.fontSecondary || (pack ? pack.bodyStyle.fontFamily : 'DM Sans');

  if (isCustom) {
    return (
      <div style={{ width:220, aspectRatio:'4/5', borderRadius:12, overflow:'hidden',
        background:'#08080f', position:'relative', boxShadow:'0 20px 60px rgba(0,0,0,.45)', flexShrink:0 }}>
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,.85) 100%)' }}/>
        {logoUrl && (
          <img src={logoUrl} alt="" style={{ position:'absolute', top:14, right:14,
            height:40, width:'auto', objectFit:'contain', zIndex:2 }}/>
        )}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'16px 14px', zIndex:1 }}>
          {badgeVisible && (
            <div style={{ display:'inline-block', padding:'2px 8px', borderRadius:3,
              background: accentColor || primaryColor, fontSize:9, fontWeight:700, color:'#fff',
              letterSpacing:1.5, marginBottom:8, textTransform:'uppercase', fontFamily:'DM Sans,sans-serif' }}>
              SPORT
            </div>
          )}
          <div style={{ fontFamily:"'" + fontTitle + "',Impact,sans-serif", fontSize:22, fontWeight:700,
            color:'#fff', lineHeight:1.05, marginBottom:6, textTransform:'uppercase' }}>
            {name ? name.toUpperCase() : 'TON TITRE ICI'}
          </div>
          <div style={{ fontFamily:"'" + fontBody + "',DM Sans,sans-serif", fontSize:10, color:'rgba(255,255,255,.55)', lineHeight:1.5 }}>
            L'actu en temps réel.
          </div>
          {barVisible && (
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:3, background: accentColor || primaryColor }}/>
          )}
        </div>
      </div>
    );
  }

  if (pack) {
    var isLight = pack.bg === '#ffffff' || pack.bg === '#f5f4f2';
    return (
      <div style={{ width:220, aspectRatio:'4/5', borderRadius:12, overflow:'hidden',
        background:pack.bg, position:'relative', boxShadow:'0 20px 60px rgba(0,0,0,.45)', flexShrink:0 }}>
        {pack.decoType === 'word' && (
          <div style={{ position:'absolute', top:-15, right:-10, fontSize:140, lineHeight:'1',
            fontFamily:pack.displayFont, color:pack.decoBg, pointerEvents:'none', userSelect:'none' }}>
            {pack.decoText}
          </div>
        )}
        {pack.decoType === 'grid' && (
          <div style={{ position:'absolute', inset:0, opacity:.45,
            backgroundImage:'linear-gradient('+pack.decoBg+' 1px,transparent 1px),linear-gradient(90deg,'+pack.decoBg+' 1px,transparent 1px)',
            backgroundSize:'28px 28px' }}/>
        )}
        {pack.decoType === 'quote' && (
          <div style={{ position:'absolute', bottom:-15, right:8, fontSize:100, lineHeight:'1',
            fontFamily:pack.displayFont, color:pack.decoBg, pointerEvents:'none', userSelect:'none' }}>"</div>
        )}
        {pack.decoType === 'char' && (
          <div style={{ position:'absolute', top:-12, right:8, fontSize:100, lineHeight:'1',
            fontFamily:pack.displayFont, fontStyle:'italic', color:pack.decoBg, pointerEvents:'none', userSelect:'none' }}>
            {pack.decoText}
          </div>
        )}
        {pack.decoType === 'line' && (
          <div style={{ position:'absolute', bottom:65, left:16, right:16, height:1, background:pack.decoBg }}/>
        )}
        {!isLight && (
          <div style={{ position:'absolute', inset:0,
            background:'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,.75) 100%)' }}/>
        )}
        {logoUrl && (
          <img src={logoUrl} alt="" style={{ position:'absolute', top:14, right:14, height:22,
            width:'auto', objectFit:'contain', zIndex:2,
            filter: isLight ? 'none' : 'brightness(0) invert(1)' }}/>
        )}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'16px 14px', zIndex:1 }}>
          {badgeVisible && (
            <div style={{ display:'inline-block', padding:'2px 8px',
              background:primaryColor, fontSize:9, fontWeight:700, color:'#fff',
              letterSpacing:1.5, marginBottom:8, textTransform:'uppercase',
              fontFamily:pack.catStyle.fontFamily }}>
              SPORT
            </div>
          )}
          <div style={{ ...pack.headStyle, fontFamily: fontTitle, fontSize: Math.round(pack.headStyle.fontSize * .65), marginBottom:6,
            color: isLight ? '#0a0a0a' : pack.headStyle.color }}>
            {name ? name.toUpperCase() : pack.sampleHead}
          </div>
          <div style={{ ...pack.bodyStyle, fontFamily: fontBody, fontSize: Math.round(pack.bodyStyle.fontSize * 1.3),
            color: isLight ? '#666' : pack.bodyStyle.color }}>
            L'actu en temps reel.
          </div>
          {barVisible && (
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:3, background:accentColor }}/>
          )}
        </div>
      </div>
    );
  }

  var moodBg = {
    dramatique:'linear-gradient(160deg,#08060f,#18102a)',
    energique: 'linear-gradient(160deg,#0d1b2e,#1a0d26)',
    premium:   'linear-gradient(160deg,#060c14,#10161f)',
    populaire: 'linear-gradient(160deg,#0c0c0c,#1c1c1c)',
    factuel:   'linear-gradient(160deg,#0c1018,#161e28)',
  }[props.mood] || 'linear-gradient(160deg,#0f0f16,#1a1a26)';

  return (
    <div style={{ width:220, aspectRatio:'4/5', borderRadius:12, overflow:'hidden',
      background:moodBg, position:'relative', boxShadow:'0 20px 60px rgba(0,0,0,.45)', flexShrink:0 }}>
      <div style={{ position:'absolute', inset:0,
        background:'linear-gradient(to bottom, transparent 35%, rgba(0,0,0,.88) 100%)' }}/>
      {logoUrl && (
        <img src={logoUrl} alt="" style={{ position:'absolute', top:14, right:14,
          height:22, width:'auto', objectFit:'contain', zIndex:2, filter:'brightness(0) invert(1)' }}/>
      )}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'16px 14px', zIndex:1 }}>
        {badgeVisible && (
          <div style={{ display:'inline-block', padding:'2px 8px', borderRadius:3,
            background:primaryColor, fontSize:9, fontWeight:700, color:'#fff',
            letterSpacing:1.5, marginBottom:8, textTransform:'uppercase' }}>
            SPORT
          </div>
        )}
        <div style={{ fontSize:22, fontWeight:900, color:'#fff', lineHeight:1.05,
          marginBottom:6, letterSpacing:-0.5, textTransform:'uppercase',
          fontFamily: fontTitle + ',sans-serif' }}>
          {name ? name.toUpperCase().slice(0,12) : 'MON MEDIA'}
        </div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,.6)', fontFamily: fontBody + ',sans-serif' }}>L'actu en temps reel.</div>
        {barVisible && (
          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:accentColor }}/>
        )}
      </div>
    </div>
  );
};

const BrandTagInput = ({ tags, setTags, placeholder, max }) => {
  var [val, setVal] = useState('');
  var handleKey = function(e) {
    if ((e.key === 'Enter' || e.key === ',') && val.trim()) {
      e.preventDefault();
      if (max && tags.length >= max) return;
      var t = val.trim().replace(/,/g, '').trim();
      if (t && !tags.includes(t)) setTags([...tags, t]);
      setVal('');
    }
    if (e.key === 'Backspace' && !val && tags.length) setTags(tags.slice(0, -1));
  };
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:'8px 10px',
      background:'var(--app-surface-2)', border:'1px solid var(--app-line)',
      borderRadius:'var(--radius)', minHeight:44, cursor:'text' }}
      onClick={function(e){ e.currentTarget.querySelector('input').focus(); }}>
      {tags.map(function(t, i) {
        return (
          <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:5,
            padding:'3px 9px', background:'var(--app-surface-3)',
            border:'1px solid var(--app-line-3)', borderRadius:20,
            fontSize:12, color:'var(--app-fg-2)' }}>
            {t}
            <button onClick={function(ev){ ev.stopPropagation(); setTags(tags.filter(function(_,j){ return j!==i; })); }}
              style={{ all:'unset', cursor:'pointer', color:'var(--app-fg-4)', lineHeight:1, fontSize:13, padding:'0 2px' }}>
              x
            </button>
          </span>
        );
      })}
      <input value={val} onChange={function(e){ setVal(e.target.value); }} onKeyDown={handleKey}
        placeholder={tags.length === 0 ? placeholder : ''}
        style={{ flex:'1 1 100px', minWidth:80, border:'none', outline:'none',
          background:'transparent', fontSize:13, color:'var(--app-fg)', fontFamily:'DM Sans,sans-serif' }}/>
    </div>
  );
};

const BrandSect = ({ num, title, desc, tip, children }) => (
  <div style={{ marginBottom:28 }}>
    <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:4 }}>
      <span style={{ fontSize:10, fontWeight:700, color:'var(--app-accent)',
        letterSpacing:1.5, textTransform:'uppercase', flexShrink:0 }}>{num}</span>
      <h3 style={{ margin:0, fontSize:14, fontWeight:600, color:'var(--app-fg)' }}>{title}</h3>
    </div>
    {desc && <p style={{ margin:'0 0 10px', fontSize:12.5, color:'var(--app-fg-4)', lineHeight:1.5 }}>{desc}</p>}
    {children}
    {tip && (
      <p style={{ margin:'8px 0 0', fontSize:11.5, color:'var(--app-fg-4)', fontStyle:'italic',
        padding:'6px 10px 6px 12px', background:'var(--app-surface-2)', borderRadius:6,
        borderLeft:'2px solid var(--app-accent)', lineHeight:1.5 }}>
        {tip}
      </p>
    )}
  </div>
);

// ─── Paper-motion : animations de packs déclenchées au clic ──────────────────
const PACK_ANIM_CSS = `
@font-face{font-family:'Bebas Neue';src:url('/fonts/bebas-neue/bebas-neue-latin-400-normal.woff') format('woff');font-weight:400;font-display:block;}
@font-face{font-family:'PlayfairIt';src:url('/fonts/playfair-display/playfair-display-latin-900-italic.woff') format('woff');font-weight:900;font-style:italic;font-display:block;}
@font-face{font-family:'SpaceGro';src:url('/fonts/space-grotesk/space-grotesk-latin-700-normal.woff') format('woff');font-weight:700;font-display:block;}
@font-face{font-family:'SyneF';src:url('/fonts/syne/syne-latin-800-normal.woff') format('woff');font-weight:800;font-display:block;}
@font-face{font-family:'DMSerifIt';src:url('/fonts/dm-serif-display/dm-serif-display-latin-400-italic.woff') format('woff');font-weight:400;font-style:italic;font-display:block;}

.fpk-wrap{position:relative;width:156px;height:208px;border-radius:12px;overflow:hidden;cursor:pointer;flex:0 0 auto;transition:box-shadow .15s;}
.fpk{position:absolute;top:0;left:0;width:300px;height:400px;transform:scale(.52);transform-origin:top left;}
.fpk .cat{position:absolute;z-index:4;font-weight:700;font-size:10px;letter-spacing:.28em;text-transform:uppercase;}
.fpk .headline{position:absolute;z-index:4;}
.fpk .headline .ln{display:block;overflow:hidden;}
.fpk .headline .ln > span{display:inline-block;}
.fpk .grain{position:absolute;inset:-4%;z-index:6;pointer-events:none;mix-blend-mode:multiply;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");}
@keyframes fpk-jit{0%{transform:translate(0,0)}25%{transform:translate(-1px,1px)}50%{transform:translate(1px,-1px)}75%{transform:translate(-1px,-1px)}100%{transform:translate(1px,1px)}}
@keyframes fpk-fade{from{opacity:0}to{opacity:1}}

/* IMPACT */
.fpk-impact{background:#f4f0e6;}
.fpk-impact .strip{position:absolute;left:-20%;width:150%;background:#e11d48;box-shadow:0 6px 14px rgba(180,20,60,.35);transform:rotate(-14deg);}
.fpk-impact .s1{top:52px;height:70px;} .fpk-impact .s2{top:132px;height:34px;background:#151515;} .fpk-impact .s3{top:180px;height:22px;}
@keyframes fpk-imp-slide{from{transform:rotate(-14deg) translateX(-130%)}82%{transform:rotate(-14deg) translateX(4%)}to{transform:rotate(-14deg) translateX(0)}}
.fpk-impact.play .s1{animation:fpk-imp-slide .45s steps(3) .10s both;} .fpk-impact.play .s2{animation:fpk-imp-slide .45s steps(3) .22s both;} .fpk-impact.play .s3{animation:fpk-imp-slide .45s steps(3) .30s both;}
.fpk-impact .footer{position:absolute;inset:auto 0 0 0;height:180px;background:linear-gradient(180deg,rgba(20,20,20,0),#141414 36%);z-index:2;}
.fpk-impact .cat{left:20px;bottom:140px;color:#fff;background:#e11d48;padding:5px 10px;border-radius:3px;transform:rotate(-2deg);}
@keyframes fpk-imp-stamp{from{transform:scale(0) rotate(-8deg)}60%{transform:scale(1.18) rotate(3deg)}to{transform:scale(1) rotate(-2deg)}}
.fpk-impact.play .cat{animation:fpk-imp-stamp .3s steps(4) .9s both;}
.fpk-impact .headline{left:18px;right:14px;bottom:30px;font-family:'Bebas Neue',Impact,sans-serif;color:#fff;font-size:56px;line-height:.9;letter-spacing:2px;}
@keyframes fpk-imp-rev{from{transform:translateY(108%)}to{transform:translateY(0)}}
.fpk-impact.play .l1 > span{animation:fpk-imp-rev .4s steps(3) 1.1s both;} .fpk-impact.play .l2 > span{animation:fpk-imp-rev .4s steps(3) 1.28s both;}
.fpk-impact .grain{opacity:.10;animation:fpk-jit .5s steps(1) infinite;}

/* EDITO */
.fpk-edito{background:#1a1612;}
.fpk-edito .glow{position:absolute;inset:0;z-index:1;background:radial-gradient(120% 80% at 70% 20%,rgba(200,160,96,.18),transparent 60%);}
.fpk-edito.play .glow{animation:fpk-fade 1.4s ease .1s both;}
.fpk-edito .hair{position:absolute;left:24px;height:1px;background:#a08060;width:252px;z-index:3;}
.fpk-edito .h1{top:60px;} .fpk-edito .h2{bottom:120px;}
@keyframes fpk-ed-line{from{width:0}to{width:252px}}
.fpk-edito.play .h1{animation:fpk-ed-line 1.1s ease .3s both;} .fpk-edito.play .h2{animation:fpk-ed-line 1.1s ease 1.4s both;}
.fpk-edito .cat{left:24px;top:74px;color:#a08060;}
.fpk-edito.play .cat{animation:fpk-fade 1s ease .5s both;}
.fpk-edito .headline{left:24px;right:24px;top:110px;font-family:'PlayfairIt',Georgia,serif;font-style:italic;font-weight:900;color:#e8ddc8;font-size:40px;line-height:1.06;letter-spacing:-.01em;}
@keyframes fpk-ed-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.fpk-edito.play .l1 > span{animation:fpk-ed-rise 1s cubic-bezier(.2,.7,.2,1) .7s both;} .fpk-edito.play .l2 > span{animation:fpk-ed-rise 1s cubic-bezier(.2,.7,.2,1) .95s both;} .fpk-edito.play .l3 > span{animation:fpk-ed-rise 1s cubic-bezier(.2,.7,.2,1) 1.2s both;}
.fpk-edito .sub{position:absolute;left:24px;bottom:88px;z-index:4;font-family:'PlayfairIt',serif;font-style:italic;color:#a08060;font-size:15px;}
.fpk-edito.play .sub{animation:fpk-fade 1.1s ease 1.6s both;}
.fpk-edito .grain{opacity:.06;}

/* DIGITAL */
.fpk-digital{background:#0d0f14;}
.fpk-digital .grid-bg{position:absolute;inset:0;z-index:1;opacity:.5;background-image:linear-gradient(#1a2540 1px,transparent 1px),linear-gradient(90deg,#1a2540 1px,transparent 1px);background-size:26px 26px;}
@keyframes fpk-dg-grid{from{opacity:0}to{opacity:.5}}
.fpk-digital.play .grid-bg{animation:fpk-dg-grid .8s steps(4) .1s both;}
.fpk-digital .scan{position:absolute;left:0;right:0;height:120px;z-index:2;background:linear-gradient(180deg,transparent,rgba(64,96,255,.12),transparent);top:-120px;}
@keyframes fpk-dg-scan{0%{top:-120px}100%{top:420px}}
.fpk-digital.play .scan{animation:fpk-dg-scan 2.6s linear 1s infinite;}
.fpk-digital .cat{left:22px;top:26px;color:#4060ff;font-family:'SpaceGro',monospace;letter-spacing:.1em;text-transform:lowercase;white-space:nowrap;overflow:hidden;width:180px;}
@keyframes fpk-dg-type{from{width:0}to{width:180px}}
.fpk-digital.play .cat{animation:fpk-dg-type 1s steps(18) .5s both;}
.fpk-digital .headline{left:22px;right:18px;top:150px;font-family:'SpaceGro',Arial,sans-serif;font-weight:700;color:#e8eeff;font-size:44px;line-height:1;letter-spacing:-.03em;}
.fpk-digital .headline .ln > span{clip-path:inset(0 0 0 0);}
@keyframes fpk-dg-wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes fpk-dg-flick{0%,100%{color:#e8eeff}50%{color:#4060ff;transform:translateX(2px)}}
.fpk-digital.play .l1 > span{animation:fpk-dg-wipe .5s steps(6) 1.15s both, fpk-dg-flick .25s steps(2) 1.15s 3;} .fpk-digital.play .l2 > span{animation:fpk-dg-wipe .5s steps(6) 1.45s both, fpk-dg-flick .25s steps(2) 1.45s 3;}
.fpk-digital .cursor{position:absolute;z-index:4;width:16px;height:6px;background:#4060ff;left:22px;bottom:110px;opacity:0;}
@keyframes fpk-dg-blink{0%,50%{opacity:1}51%,100%{opacity:0}}
.fpk-digital.play .cursor{animation:fpk-fade .1s 1.9s both, fpk-dg-blink .8s steps(1) 2s infinite;}
.fpk-digital .grain{opacity:.05;}

/* MINIMAL */
.fpk-minimal{background:#f3f2ef;}
.fpk-minimal .cat{left:26px;top:40px;color:#a6a6a6;letter-spacing:.42em;}
@keyframes fpk-mp-in{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
.fpk-minimal.play .cat{animation:fpk-mp-in .8s cubic-bezier(.2,.7,.2,1) .35s both;}
.fpk-minimal .dot{position:absolute;right:26px;top:37px;width:13px;height:13px;border-radius:50%;background:#111;z-index:4;}
@keyframes fpk-mp-dot{from{transform:scale(0)}to{transform:scale(1)}}
.fpk-minimal.play .dot{animation:fpk-mp-dot .5s cubic-bezier(.34,1.56,.64,1) .55s both;}
.fpk-minimal .line{position:absolute;left:26px;top:68px;height:3px;width:74px;background:#111;z-index:3;}
@keyframes fpk-mp-draw{from{width:0}to{width:74px}}
.fpk-minimal.play .line{animation:fpk-mp-draw .8s cubic-bezier(.85,0,.15,1) .55s both;}
.fpk-minimal .headline{left:26px;right:18px;bottom:42px;font-family:'SyneF','Arial Black',sans-serif;font-weight:800;color:#111;font-size:39px;line-height:1.0;letter-spacing:-.035em;text-transform:uppercase;}
.fpk-minimal .headline .ln{margin-top:2px;}
.fpk-minimal .headline .ln > span{clip-path:inset(0 0 -12% 0);}
@keyframes fpk-mp-wipe{from{clip-path:inset(0 100% -12% 0);transform:translateX(-14px);opacity:.001}to{clip-path:inset(0 0 -12% 0);transform:translateX(0);opacity:1}}
.fpk-minimal.play .l1 > span{animation:fpk-mp-wipe .6s cubic-bezier(.76,0,.24,1) .75s both;} .fpk-minimal.play .l2 > span{animation:fpk-mp-wipe .6s cubic-bezier(.76,0,.24,1) .95s both;} .fpk-minimal.play .l3 > span{animation:fpk-mp-wipe .6s cubic-bezier(.76,0,.24,1) 1.15s both;}
.fpk-minimal .grain{opacity:.045;}

/* NEO */
.fpk-neo{background:#241a12;}
.fpk-neo .warm{position:absolute;inset:0;z-index:1;background:radial-gradient(120% 90% at 50% 60%,rgba(210,150,80,.18),transparent 55%),linear-gradient(180deg,rgba(0,0,0,.35),transparent 30%,transparent 70%,rgba(0,0,0,.5));}
.fpk-neo.play .warm{animation:fpk-fade 1.4s ease .1s both;}
.fpk-neo .leak{position:absolute;top:-40%;left:0;width:55%;height:180%;z-index:3;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(255,186,110,.35),rgba(255,150,70,.15),transparent);transform:rotate(16deg) translateX(-140px);opacity:0;mix-blend-mode:screen;}
@keyframes fpk-neo-leak{0%{opacity:0;transform:rotate(16deg) translateX(-140px)}25%{opacity:1}100%{opacity:0;transform:rotate(16deg) translateX(360px)}}
.fpk-neo.play .leak{animation:fpk-neo-leak 2.6s cubic-bezier(.4,0,.5,1) .5s both;}
.fpk-neo .scratch{position:absolute;inset:0;z-index:5;pointer-events:none;opacity:.4;mix-blend-mode:overlay;background:repeating-linear-gradient(90deg,transparent 0 36px,rgba(0,0,0,.16) 36px 37px,transparent 37px 70px,rgba(255,255,255,.05) 70px 71px);animation:fpk-jit .28s steps(1) infinite;}
.fpk-neo .cat{left:24px;top:66px;color:#d09a63;letter-spacing:.3em;}
.fpk-neo.play .cat{animation:fpk-fade 1s ease .5s both;}
.fpk-neo .headline{left:24px;right:22px;top:102px;font-family:'DMSerifIt',Georgia,serif;font-style:italic;color:#f2e6d2;font-size:40px;line-height:1.05;}
@keyframes fpk-neo-focus{from{opacity:0;filter:blur(12px);transform:scale(1.06)}60%{opacity:1}to{opacity:1;filter:blur(0);transform:scale(1)}}
.fpk-neo.play .l1 > span{animation:fpk-neo-focus 1.2s cubic-bezier(.3,.7,.3,1) .8s both;} .fpk-neo.play .l2 > span{animation:fpk-neo-focus 1.2s cubic-bezier(.3,.7,.3,1) 1.15s both;}
.fpk-neo .sub{position:absolute;left:24px;bottom:66px;z-index:4;font-family:'DMSerifIt',serif;font-style:italic;color:#b78a5c;font-size:15px;}
.fpk-neo.play .sub{animation:fpk-fade 1.2s ease 1.6s both;}
.fpk-neo .grain{opacity:.16;animation:fpk-jit .32s steps(1) infinite;}
`;

const PACK_ID_TO_ANIM = { 'impact-news':'impact', 'edito-luxe':'edito', 'digital-native':'digital', 'minimal-power':'minimal', 'neo-retro':'neo' };

function packAnimInner(id) {
  switch (id) {
    case 'impact-news': return (<>
      <div className="strip s1"/><div className="strip s2"/><div className="strip s3"/><div className="footer"/>
      <div className="cat">Breaking</div>
      <div className="headline"><span className="ln l1"><span>LA FRANCE EN</span></span><span className="ln l2"><span>ALERTE</span></span></div>
      <div className="grain"/></>);
    case 'edito-luxe': return (<>
      <div className="glow"/><div className="hair h1"/>
      <div className="cat">Culture — Cinéma</div>
      <div className="headline"><span className="ln l1"><span>L'art de</span></span><span className="ln l2"><span>prendre</span></span><span className="ln l3"><span>le temps</span></span></div>
      <div className="hair h2"/><div className="sub">Rencontre avec Sofia Coppola</div>
      <div className="grain"/></>);
    case 'digital-native': return (<>
      <div className="grid-bg"/><div className="scan"/>
      <div className="cat">// tech — 09:41 am</div>
      <div className="headline"><span className="ln l1"><span>L'IA</span></span><span className="ln l2"><span>change tout.</span></span></div>
      <div className="cursor"/><div className="grain"/></>);
    case 'minimal-power': return (<>
      <div className="cat">Opinion — Finance</div><div className="dot"/><div className="line"/>
      <div className="headline"><span className="ln l1"><span>Bourse</span></span><span className="ln l2"><span>crash</span></span><span className="ln l3"><span>2026</span></span></div>
      <div className="grain"/></>);
    case 'neo-retro': return (<>
      <div className="warm"/><div className="leak"/>
      <div className="cat">Société — Enquête</div>
      <div className="headline"><span className="ln l1"><span>Vivre</span></span><span className="ln l2"><span>autrement, enfin.</span></span></div>
      <div className="sub">Le grand retour des communs</div><div className="scratch"/><div className="grain"/></>);
    default: return null;
  }
}

// Carte de pack animée — l'animation se rejoue à chaque clic (qui sélectionne aussi le pack)
const PackAnimatedCard = function(props) {
  var pack = props.pack, active = props.active, onSelect = props.onSelect;
  var [tick, setTick] = useState(0);
  var anim = PACK_ID_TO_ANIM[pack.id] || 'impact';
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
      <div className="fpk-wrap"
        onClick={function(){ onSelect(); setTick(tick + 1); }}
        style={{ boxShadow: active ? '0 0 0 2px var(--app-accent)' : '0 0 0 1px var(--app-line)' }}>
        <div className={'fpk fpk-' + anim + (tick > 0 ? ' play' : '')} key={tick}>
          {packAnimInner(pack.id)}
        </div>
      </div>
      <div style={{ fontSize:11, fontWeight:600, color: active ? 'var(--app-accent)' : 'var(--app-fg-2)' }}>{pack.name}</div>
    </div>
  );
};

const BrandScreen = ({ clientId, onSaved, onDeleted }) => {
  var [name,            setName]            = useState('');
  var [logoUrl,         setLogoUrl]         = useState('');
  var [logoUploading,   setLogoUploading]   = useState(false);
  var [styleRefUrl,     setStyleRefUrl]     = useState('');
  var [styleRefUploading, setStyleRefUploading] = useState(false);
  var [primaryColor,    setPrimaryColor]    = useState('#6366F1');
  var [accentColor,     setAccentColor]     = useState('#10B981');
  var [fontPrimary,     setFontPrimary]     = useState('Bebas Neue');
  var [fontBody,        setFontBody]        = useState('Barlow');
  var [fontId,          setFontId]          = useState('bebas-neue');
  var [fontSet,         setFontSet]         = useState('impact');
  var [fontIsCustom,    setFontIsCustom]    = useState(false);
  var [fontCustomUrl,   setFontCustomUrl]   = useState('');   // titre importé
  var [fontBodyUrl,     setFontBodyUrl]     = useState('');   // corps importé
  var [fontMode,        setFontMode]        = useState('packs'); // 'packs' | 'custom'
  var [fontUploading,   setFontUploading]   = useState('');   // '' | 'title' | 'body'
  var [fontUploadErr,   setFontUploadErr]   = useState('');
  var [fontRights,      setFontRights]      = useState(false);
  var [mood,            setMood]            = useState('');
  var [toneTags,        setToneTags]        = useState([]);
  var [graphicStyle,    setGraphicStyle]    = useState('');
  var [topics,          setTopics]          = useState([]);
  var [instaHandle,     setInstaHandle]     = useState('');
  var [hashtags,        setHashtags]        = useState([]);
  var [preferredFormat, setPreferredFormat] = useState('4:5');
  var [advancedOpen,    setAdvancedOpen]    = useState(false);
  var [loading,         setLoading]         = useState(true);
  var [saving,          setSaving]          = useState(false);
  var [saveMsg,         setSaveMsg]         = useState('');
  var [saveErr,         setSaveErr]         = useState('');
  var [showVeilleNudge,   setShowVeilleNudge]   = useState(false);
  var [igInput,           setIgInput]           = useState('');
  var [igAnalyzing,       setIgAnalyzing]       = useState(false);
  var [igResult,          setIgResult]          = useState(null);
  var [igErr,             setIgErr]             = useState('');
  var [badgeVisible,      setBadgeVisible]      = useState(true);
  var [barVisible,        setBarVisible]        = useState(true);
  var [confirmingDelete,  setConfirmingDelete]  = useState(false);
  var [deleting,          setDeleting]          = useState(false);
  var [brandKitUrl,       setBrandKitUrl]       = useState('');
  var [relogoing,         setRelogoing]         = useState(false);
  var [logoStyle,         setLogoStyle]         = useState('badge');

  // Load from Supabase — réagit au changement de clientId (switch de compte)
  useEffect(function() {
    var sb = window.__supabase; var user = window.__currentUser;
    // Reset du formulaire à chaque changement de compte
    setName(''); setLogoUrl(''); setStyleRefUrl('');
    setPrimaryColor('#6366F1'); setAccentColor('#10B981'); setFontPrimary('Bebas Neue'); setFontBody('Barlow');
    setFontId('bebas-neue'); setFontSet('impact'); setFontIsCustom(false); setFontCustomUrl(''); setFontBodyUrl(''); setFontMode('packs');
    setFontUploading(''); setFontUploadErr(''); setFontRights(false);
    setMood(''); setToneTags([]); setGraphicStyle(''); setTopics([]);
    setInstaHandle(''); setHashtags([]); setPreferredFormat('4:5');
    setBadgeVisible(true); setBarVisible(true); setLogoStyle('badge');
    setSaveMsg(''); setSaveErr(''); setIgInput(''); setIgResult(null); setIgErr('');

    if (!sb || !user) { setLoading(false); return; }
    if (!clientId) { setLoading(false); return; } // nouveau compte — formulaire vide

    setLoading(true);
    sb.from('clients').select('*').eq('id', clientId).eq('user_id', user.id).maybeSingle()
      .then(function(res) {
        var d = res.data;
        if (d) {
          setName(d.name || '');
          setLogoUrl(d.logo_url || '');
          if (d.brand_colors && d.brand_colors[0]) setPrimaryColor(d.brand_colors[0]);
          if (d.brand_colors && d.brand_colors[1]) setAccentColor(d.brand_colors[1]);
          setFontPrimary(d.font_primary || 'Bebas Neue');
          setFontBody(d.font_body || d.font_secondary || 'Barlow');
          setFontId(d.font_id || 'bebas-neue');
          setFontSet(d.font_set || 'impact');
          setFontIsCustom(!!d.font_is_custom);
          setFontCustomUrl(d.font_custom_url || '');
          setFontBodyUrl(d.font_body_url || '');
          setMood(d.mood || '');
          setToneTags(d.tone_tags || []);
          var gs = d.graphic_style || '';
          var resolvedGs = STYLE_TO_PACK[gs] || gs;
          if (!resolvedGs) resolvedGs = 'impact-news';
          setGraphicStyle(resolvedGs);
          // Mode = Personnalisé si style custom OU police importée, sinon Packs
          setFontMode((resolvedGs === 'custom' || d.font_is_custom || d.font_body_url) ? 'custom' : 'packs');
          // Recharge les polices custom importées pour l'aperçu (persistance après reload)
          if (d.font_is_custom && d.font_custom_url) loadCustomFontFace(d.font_primary, d.font_custom_url);
          if (d.font_body_url) loadCustomFontFace(d.font_body, d.font_body_url);
          setTopics(d.topics || []);
          setInstaHandle(d.instagram_handle || '');
          setHashtags(d.hashtags || []);
          setPreferredFormat(d.preferred_format || '4:5');
          setStyleRefUrl(d.style_ref_url || '');
          setBadgeVisible(d.badge_visible !== false);
          setBarVisible(d.bar_visible !== false);
          setBrandKitUrl(d.brand_kit_url || '');
          setLogoStyle(d.logo_style || 'badge');
        }
        setLoading(false);
      });
  }, [clientId]);

  // Load all pack fonts once at mount
  useEffect(function() {
    var id = 'gf-packs';
    if (document.getElementById(id)) return;
    var link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400&family=Barlow+Condensed:wght@600;700&family=Barlow:wght@300&family=Playfair+Display:ital,wght@1,900&family=Cormorant+Garamond:wght@600&family=Jost:wght@200;300&family=Space+Grotesk:wght@700&family=DM+Sans:wght@300;500&family=DM+Mono:wght@400&family=Syne:wght@800&family=Outfit:wght@200;600&family=DM+Serif+Display:ital@1&family=DM+Serif+Text:wght@400&family=Lato:wght@300&display=swap';
    document.head.appendChild(link);
  }, []);

  // Inject bento CSS once
  useEffect(function() {
    var id = 'brand-bento-css';
    if (document.getElementById(id)) return;
    var s = document.createElement('style');
    s.id = id;
    s.textContent = [
      '.brand-bento{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}',
      '.bento-tile{background:var(--app-surface-2);border:1px solid var(--app-line);border-radius:14px;padding:18px 20px;transition:border-color .18s,box-shadow .18s;position:relative;overflow:hidden;box-sizing:border-box;}',
      '.bento-tile:hover{border-color:rgba(99,102,241,.3);box-shadow:0 0 0 1px rgba(99,102,241,.08),0 4px 24px rgba(0,0,0,.18);}',
      '.bento-tile--wide{grid-column:span 2;}',
      '.bento-tile--full{grid-column:span 3;}',
      '.bento-tile-lbl{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--app-fg-4);margin-bottom:14px;display:flex;align-items:center;gap:6px;}',
      '.bento-color-block{height:48px;border-radius:9px;cursor:pointer;transition:transform .15s;margin-bottom:7px;}',
      '.bento-color-block:hover{transform:scaleY(1.04);}',
    ].join('');
    document.head.appendChild(s);
  }, []);

  var loadCustomFont = function(name) {
    if (!name || !name.trim()) return;
    var key = 'gf-custom-' + name.trim().toLowerCase().replace(/\s+/g, '-');
    if (document.getElementById(key)) return;
    var link = document.createElement('link');
    link.id = key; link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + name.trim().replace(/\s+/g, '+') + ':ital,wght@0,400;0,700;1,400&display=swap';
    document.head.appendChild(link);
  };

  // Injecte le CSS des animations de packs (paper-motion) une seule fois
  useEffect(function() {
    var id = 'fpk-anim-css';
    if (document.getElementById(id)) return;
    var s = document.createElement('style');
    s.id = id; s.textContent = PACK_ANIM_CSS;
    document.head.appendChild(s);
  }, []);

  // Charge toutes les polices de la bibliothèque ForjeFonts (fichiers locaux) pour l'aperçu
  useEffect(function() {
    var lib = (window.ForjeFonts && window.ForjeFonts.FONT_LIBRARY) || [];
    var id = 'forje-fonts-lib';
    if (document.getElementById(id) || !lib.length) return;
    var css = lib.map(function(f) {
      return "@font-face{font-family:'" + f.name + "';src:url('" + f.urlPath + "') format('woff');font-weight:" + f.weight + ";font-style:" + f.style + ";font-display:swap;}";
    }).join('');
    var s = document.createElement('style');
    s.id = id; s.textContent = css;
    document.head.appendChild(s);
  }, []);

  // Charge une police custom (URL Supabase) dans le navigateur pour l'aperçu live
  var loadCustomFontFace = async function(name, url) {
    if (!name || !url) return;
    try {
      var face = new FontFace(name, "url('" + url + "')");
      await face.load();
      document.fonts.add(face);
    } catch(e) { console.warn('[FontFace]', e.message); }
  };

  // Import d'une police custom → Supabase Storage + état + aperçu live
  // slot = 'title' | 'body'
  var handleFontUpload = async function(file, slot) {
    setFontUploadErr('');
    if (!file) return;
    if (!fontRights) { setFontUploadErr('Confirme que tu détiens les droits d\'usage de cette police.'); return; }
    var ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (['.ttf', '.otf', '.woff', '.woff2'].indexOf(ext) === -1) {
      setFontUploadErr('Format non supporté. Utilise .ttf, .otf, .woff ou .woff2'); return;
    }
    if (file.size > 5 * 1024 * 1024) { setFontUploadErr('Fichier trop lourd (max 5 Mo)'); return; }

    var sb = window.__supabase; var user = window.__currentUser;
    if (!sb || !user) { setFontUploadErr('Non authentifié'); return; }

    setFontUploading(slot);
    try {
      // La RLS storage exige que le 1er segment du chemin = auth.uid()
      var safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
      var path = user.id + '/fonts/' + slot + '-' + Date.now() + '-' + safe;
      var up = await sb.storage.from('brand-assets').upload(path, file, { upsert: true, contentType: file.type || 'font/ttf' });
      if (up.error) throw up.error;
      var publicUrl = sb.storage.from('brand-assets').getPublicUrl(path).data.publicUrl;
      var fontName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_.]+/g, ' ').trim();

      await loadCustomFontFace(fontName, publicUrl);
      if (slot === 'body') {
        setFontBody(fontName);
        setFontBodyUrl(publicUrl);
      } else {
        setFontPrimary(fontName);
        setFontCustomUrl(publicUrl);
        setFontIsCustom(true);
        setFontId('');
      }
      setGraphicStyle('custom');
    } catch(e) {
      setFontUploadErr('Échec de l\'upload : ' + (e.message || e));
    } finally {
      setFontUploading('');
    }
  };

  var fontTitleFileRef = useRef(null);
  var fontBodyFileRef  = useRef(null);

  // Sélection d'un pack typographique → titre + corps + id bibliothèque, d'un coup
  var PACK_TO_FONTID = { 'impact-news':'bebas-neue', 'edito-luxe':'playfair-display', 'digital-native':'space-grotesk', 'minimal-power':'syne', 'neo-retro':'dm-serif-display' };
  var PACK_TO_BODY   = { 'impact-news':'Barlow', 'edito-luxe':'Jost', 'digital-native':'DM Sans', 'minimal-power':'Outfit', 'neo-retro':'Lato' };
  var PACK_TO_SET    = { 'impact-news':'impact', 'edito-luxe':'premium', 'digital-native':'tech', 'minimal-power':'premium', 'neo-retro':'premium' };
  var selectPack = function(pack) {
    setGraphicStyle(pack.id);
    setFontId(PACK_TO_FONTID[pack.id] || '');
    setFontPrimary(PACK_FONTS[pack.id] || fontPrimary);
    setFontSet(PACK_TO_SET[pack.id] || 'impact');
    setFontBody(PACK_TO_BODY[pack.id] || 'DM Sans');
    setFontIsCustom(false); setFontCustomUrl(''); setFontBodyUrl('');
  };

  // Sélection d'une police bibliothèque pour un slot (titre ou corps)
  var selectLibraryFont = function(font, slot) {
    if (slot === 'body') { setFontBody(font.name); }
    else {
      setFontId(font.id); setFontPrimary(font.name); setFontSet(font.set);
      setFontIsCustom(false); setFontCustomUrl('');
    }
    setGraphicStyle('custom');
  };

  var handleRelogo = async function() {
    if (!brandKitUrl || !clientId || relogoing) return;
    setRelogoing(true); setSaveErr('');
    try {
      var sb = window.__supabase;
      var token = null;
      if (sb) { var sess = await sb.auth.getSession(); token = sess.data?.session?.access_token; }
      var res = await fetch('/api/generate/brand-identity/relogo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) },
        body: JSON.stringify({ clientId, imageUrl: brandKitUrl }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      if (data.logoUrl) setLogoUrl(data.logoUrl);
    } catch(e) {
      setSaveErr('Relogo échoué : ' + e.message);
    }
    setRelogoing(false);
  };

  var handleLogoStyleChange = async function(newStyle) {
    setLogoStyle(newStyle);
    var sb = window.__supabase; var user = window.__currentUser;
    if (sb && user && clientId) {
      await sb.from('clients').update({ logo_style: newStyle }).eq('id', clientId).eq('user_id', user.id);
    }
    if (newStyle === 'logo_nu' && brandKitUrl) {
      handleRelogo();
    }
  };

  var handleLogoUpload = function(file) {
    if (!file) return;
    if (file.type !== 'image/png') { setSaveErr('Logo : PNG uniquement (fond transparent requis)'); return; }
    var sb = window.__supabase; var user = window.__currentUser;
    if (!sb || !user) return;
    setLogoUploading(true); setSaveErr('');
    var folder = clientId ? user.id + '/' + clientId : user.id + '/draft';
    var path = folder + '/logo.png';
    sb.storage.from('brand-assets').upload(path, file, { upsert:true, contentType:'image/png' })
      .then(function(res) {
        if (res.error) { setSaveErr('Upload echoué : ' + res.error.message); setLogoUploading(false); return; }
        var pub = sb.storage.from('brand-assets').getPublicUrl(path);
        var url = pub.data.publicUrl + '?t=' + Date.now();
        setLogoUrl(url);
        if (clientId) {
          sb.from('clients').update({ logo_url: url }).eq('id', clientId).eq('user_id', user.id)
            .then(function(r) { if (r.error) setSaveErr('Logo sauvegardé localement, erreur DB : ' + r.error.message); });
        }
        setLogoUploading(false);
      });
  };

  var handleStyleRefUpload = function(file) {
    if (!file || !file.type.startsWith('image/')) return;
    var sb = window.__supabase; var user = window.__currentUser;
    if (!sb || !user) return;
    setStyleRefUploading(true); setSaveErr('');
    var ext = file.type === 'image/png' ? 'png' : 'jpg';
    var folder = clientId ? user.id + '/' + clientId : user.id + '/draft';
    var path = folder + '/style-ref.' + ext;
    sb.storage.from('brand-assets').upload(path, file, { upsert:true, contentType:file.type })
      .then(function(res) {
        if (res.error) { setSaveErr('Upload echoué : ' + res.error.message); setStyleRefUploading(false); return; }
        var pub = sb.storage.from('brand-assets').getPublicUrl(path);
        var url = pub.data.publicUrl + '?t=' + Date.now();
        setStyleRefUrl(url);
        if (clientId) {
          sb.from('clients').update({ style_ref_url: url }).eq('id', clientId).eq('user_id', user.id)
            .then(function(r) { if (r.error) setSaveErr('Style ref sauvegardé localement, erreur DB : ' + r.error.message); });
        }
        setStyleRefUploading(false);
      });
  };

  var analyzeInstagram = function() {
    if (!igInput.trim()) return;
    setIgAnalyzing(true); setIgErr(''); setIgResult(null);
    veilleFetch('/brand/analyze-instagram', {
      method: 'POST',
      body: JSON.stringify({ handle: igInput.trim() }),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) { setIgErr(data.error); }
        else { setIgResult(data); }
        setIgAnalyzing(false);
      })
      .catch(function(e) { setIgErr(e.message); setIgAnalyzing(false); });
  };

  var applyIgSuggestions = function() {
    if (!igResult || !igResult.suggestions) return;
    var s = igResult.suggestions;
    if (s.name) setName(s.name);
    if (s.mood) setMood(s.mood);
    // Map graphic_style to pack ID
    var packId = STYLE_TO_PACK[s.graphic_style] || s.graphic_style;
    if (packId && PACK_FONTS[packId]) setGraphicStyle(packId);
    if (s.tone_tags && s.tone_tags.length) setToneTags(s.tone_tags.slice(0, 3));
    if (s.topics && s.topics.length) setTopics(s.topics);
    if (igResult.handle) setInstaHandle('@' + igResult.handle);
    setIgResult(null);
  };

  var completedCount = [
    name.trim().length > 0,
    logoUrl.length > 0,
    !!(primaryColor && accentColor),
    !!graphicStyle,
    !!mood,
    toneTags.length > 0,
    topics.length >= 3,
  ].filter(Boolean).length;

  var canSave = name.trim().length > 0;

  var toggleTone = function(t) {
    if (toneTags.includes(t)) {
      setToneTags(toneTags.filter(function(x) { return x !== t; }));
    } else if (toneTags.length < 3) {
      setToneTags([...toneTags, t]);
    }
  };

  var handleSave = function() {
    var sb = window.__supabase; var user = window.__currentUser;
    if (!sb || !user) return;
    setSaving(true); setSaveErr(''); setSaveMsg('');
    var row = {
      user_id:          user.id,
      name:             name,
      logo_url:         logoUrl,
      brand_colors:     [primaryColor, accentColor],
      font_primary:     fontPrimary,
      font_body:        fontBody || null,
      font_id:          fontId,
      font_set:         fontSet,
      font_is_custom:   fontIsCustom,
      font_custom_url:  fontCustomUrl || null,
      font_body_url:    fontBodyUrl || null,
      font_secondary:   fontBody || null,
      badge_visible:    badgeVisible,
      bar_visible:      barVisible,
      logo_style:       logoStyle,
      mood:             mood,
      tone_tags:        toneTags,
      graphic_style:    graphicStyle,
      topics:           topics,
      instagram_handle: instaHandle,
      hashtags:         hashtags,
      preferred_format: preferredFormat,
      style_ref_url:    styleRefUrl || null,
    };
    var query = clientId
      ? sb.from('clients').update(row).eq('id', clientId).eq('user_id', user.id).select('id').maybeSingle()
      : sb.from('clients').insert(row).select('id').maybeSingle();
    var isNew = !clientId;
    query.then(function(res) {
      if (res.error) { setSaveErr(res.error.message); }
      else {
        setSaveMsg('Identite forgee. Chaque post genere sera maintenant fidele a la charte de ' + (name || 'ton media') + '.');
        setTimeout(function() { setSaveMsg(''); }, 6000);
        if (isNew) setShowVeilleNudge(true);
        if (onSaved && res.data) onSaved(res.data.id);
      }
      setSaving(false);
    });
  };

  var handleDelete = function() {
    if (!clientId) return;
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    var sb = window.__supabase; var user = window.__currentUser;
    if (!sb || !user) return;
    setDeleting(true);
    sb.from('clients').delete().eq('id', clientId).eq('user_id', user.id)
      .then(function(res) {
        setDeleting(false);
        setConfirmingDelete(false);
        if (res.error) { setSaveErr('Suppression échouée : ' + res.error.message); return; }
        if (onDeleted) onDeleted();
      });
  };

  var inputStyle = {
    width:'100%', boxSizing:'border-box', background:'var(--app-surface-2)',
    border:'1px solid var(--app-line)', borderRadius:'var(--radius)', padding:'9px 12px',
    color:'var(--app-fg)', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none',
  };

  if (loading) return (
    <div className="page-body" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300 }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
        <div className="forje-blob-spin"/>
        <span style={{ fontSize:13, color:'var(--app-fg-4)' }}>Chargement de ton identité...</span>
      </div>
    </div>
  );

  return (
    <div className="page-body" style={{ paddingBottom:60 }}>
      {showVeilleNudge && (
        <div className="veille-nudge-overlay">
          <div className="veille-nudge-modal">
            <div className="veille-nudge-icon">⚡</div>
            <h2 className="veille-nudge-title">Identité forgée !</h2>
            <p className="veille-nudge-desc">
              Étape 1 sur 2 terminée. Active maintenant ta veille — Forje va surveiller les actus de ton univers en temps réel.
            </p>
            <div className="veille-nudge-steps">
              <span className="veille-nudge-step veille-nudge-step--done">① Identité de marque ✓</span>
              <span className="veille-nudge-step veille-nudge-step--active">② Sources & veille</span>
            </div>
            <div className="veille-nudge-actions">
              <button className="btn btn-primary" style={{flex:1}}
                onClick={() => { setShowVeilleNudge(false); window.__goToScreen?.('sources'); }}>
                Configurer ma veille →
              </button>
              <button className="btn btn-ghost" onClick={() => setShowVeilleNudge(false)}>
                Plus tard
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Page header ── */}
      <div className="page-header" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <h1 className="page-title">Forge ton identite</h1>
          <p className="page-subtitle">Tout ce que tu remplis ici sera utilise a chaque generation.</p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0, marginTop:4 }}>
          {/* Progress pill */}
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 14px',
            borderRadius:20, background:'var(--app-surface-2)', border:'1px solid var(--app-line)',
            fontSize:12, color:'var(--app-fg-3)' }}>
            <div style={{ width:36, height:3.5, background:'var(--app-line)', borderRadius:2, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', left:0, top:0, height:'100%',
                width:(completedCount / 7 * 100) + '%',
                background: completedCount === 7 ? '#22c55e' : 'var(--app-accent)',
                borderRadius:2, transition:'width .3s ease' }}/>
            </div>
            <span style={{ fontVariantNumeric:'tabular-nums' }}>
              {completedCount}<span style={{ opacity:.45 }}>/7</span>
            </span>
          </div>
          {clientId && (
            <Btn
              variant="ghost"
              disabled={deleting}
              onClick={confirmingDelete ? handleDelete : () => setConfirmingDelete(true)}
              onBlur={() => setTimeout(() => setConfirmingDelete(false), 200)}
              style={confirmingDelete ? { borderColor:'var(--app-danger)', color:'var(--app-danger)', background:'rgba(209,69,69,.07)' } : {}}>
              {deleting ? 'Suppression...' : confirmingDelete ? 'Confirmer ?' : 'Supprimer'}
            </Btn>
          )}
          <Btn
            variant="primary"
            disabled={saving || !canSave}
            onClick={handleSave}
            icon={saving ? null : 'check'}>
            {saving
              ? React.createElement('span', { style:{display:'flex',alignItems:'center',gap:6} },
                  React.createElement('span', { style:{width:12,height:12,border:'2px solid rgba(255,255,255,.3)',
                    borderTopColor:'#fff',borderRadius:'50%',animation:'vb-spin .7s linear infinite'} }),
                  'Sauvegarde...')
              : (canSave ? 'Enregistrer' : 'Ajoute un nom')
            }
          </Btn>
        </div>
      </div>

      {/* ── Outer: bento grid + live preview ── */}
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 240px', gap:24, alignItems:'start' }}>

        {/* ── BENTO GRID ── */}
        <div className="brand-bento">

          {/* TILE 1 — Identité + IG auto — full width */}
          <div className="bento-tile bento-tile--full">
            <div className="bento-tile-lbl"><AppIcon name="sparkle" size={11}/>Identite du media</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr minmax(0,290px)', gap:20, alignItems:'start' }}>
              <div>
                <div style={{ fontSize:10.5, color:'var(--app-fg-4)', marginBottom:6, letterSpacing:'.08em', textTransform:'uppercase' }}>Nom public</div>
                <input value={name} onChange={function(e){ setName(e.target.value); }}
                  onBlur={function(){ if (name.trim() && clientId) handleSave(); }}
                  placeholder="Raplume, Footmercato, Le Monde..."
                  style={{ width:'100%', boxSizing:'border-box',
                    background:'transparent', border:'none',
                    borderBottom:'1.5px solid var(--app-line-2)',
                    padding:'4px 0 10px', color:'var(--app-fg)',
                    fontFamily:'DM Sans,sans-serif', fontSize:22, fontWeight:600,
                    outline:'none', letterSpacing:'-0.01em' }}/>
              </div>
              <div>
                <div style={{ fontSize:10.5, color:'var(--app-fg-4)', marginBottom:6, letterSpacing:'.08em', textTransform:'uppercase' }}>Auto-remplir depuis Instagram</div>
                <div style={{ display:'flex', gap:6 }}>
                  <input value={igInput} onChange={function(e){ setIgInput(e.target.value); }}
                    onKeyDown={function(e){ if (e.key === 'Enter') analyzeInstagram(); }}
                    placeholder="@compte ou URL Instagram"
                    style={{ flex:1, background:'var(--app-surface-3)', border:'1px solid var(--app-line)',
                      borderRadius:8, padding:'7px 10px', color:'var(--app-fg)',
                      fontFamily:'DM Sans,sans-serif', fontSize:12.5, outline:'none' }}/>
                  <button onClick={analyzeInstagram} disabled={igAnalyzing || !igInput.trim()}
                    className="btn btn-primary btn-sm" style={{ flexShrink:0 }}>
                    {igAnalyzing
                      ? <span style={{width:11,height:11,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'vb-spin .7s linear infinite',display:'inline-block'}}/>
                      : <AppIcon name="sparkle" size={12}/>
                    }
                    {igAnalyzing ? 'Analyse...' : 'Analyser'}
                  </button>
                </div>
                {igErr && <div style={{ marginTop:6, fontSize:11.5, color:'#ef4444' }}>{igErr}</div>}
              </div>
            </div>
            {igResult && igResult.suggestions && (
              <div style={{ marginTop:14, padding:'12px 14px', background:'rgba(99,102,241,.06)', borderRadius:10, border:'1px solid rgba(99,102,241,.18)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  {igResult.avatarUrl && (
                    <img src={igResult.avatarUrl} style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} onError={function(e){ e.target.style.display='none'; }}/>
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12.5, fontWeight:600, color:'var(--app-fg)' }}>{igResult.name}</div>
                    {igResult.bio && <div style={{ fontSize:11, color:'var(--app-fg-4)', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{igResult.bio}</div>}
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <Btn variant="primary" size="sm" icon="check" onClick={applyIgSuggestions}>Appliquer</Btn>
                    <Btn variant="ghost" size="sm" onClick={function(){ setIgResult(null); }}>Ignorer</Btn>
                  </div>
                </div>
                <div style={{ fontSize:11, color:'var(--app-fg-4)', lineHeight:1.6 }}>
                  Mood: <strong style={{ color:'var(--app-fg-3)' }}>{igResult.suggestions.mood}</strong>
                  {' · '}Pack: <strong style={{ color:'var(--app-fg-3)' }}>{igResult.suggestions.graphic_style}</strong>
                  {' · '}Ton: <strong style={{ color:'var(--app-fg-3)' }}>{(igResult.suggestions.tone_tags||[]).join(', ')}</strong>
                  {igResult.suggestions.rationale && (<><br/><em style={{ opacity:.7 }}>{igResult.suggestions.rationale}</em></>)}
                </div>
              </div>
            )}
          </div>

          {/* TILE 2 — Logo */}
          <div className="bento-tile" style={{ display:'flex', flexDirection:'column', minHeight:200 }}>
            <div className="bento-tile-lbl"><AppIcon name="image" size={11}/>Logo</div>
            {logoUrl ? (
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ flex:1, background:'#0a0a15', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', padding:16, minHeight:100, border:'1px solid rgba(255,255,255,.06)' }}>
                  <img src={logoUrl} style={{ maxWidth:'100%', maxHeight:80, objectFit:'contain' }}/>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  {brandKitUrl && (
                    <Btn variant="ghost" size="sm" disabled={relogoing} onClick={handleRelogo} style={{ flex:1, justifyContent:'center' }}>
                      {relogoing ? '↻ ...' : '↻ Brand kit'}
                    </Btn>
                  )}
                  <Btn variant="ghost" size="sm" onClick={function(){ setLogoUrl(''); }} style={{ flex:1, justifyContent:'center', color:'#ef4444', borderColor:'rgba(239,68,68,.35)' }}>Supprimer</Btn>
                </div>
                <div style={{ display:'flex', gap:4, background:'rgba(255,255,255,.04)', borderRadius:8, padding:'3px' }}>
                  {[['badge', '⬤  Badge'], ['logo_nu', '◎  Logo nu']].map(function(opt) {
                    var active = logoStyle === opt[0];
                    return (
                      <button key={opt[0]} onClick={function(){ handleLogoStyleChange(opt[0]); }}
                        style={{ flex:1, padding:'5px 0', borderRadius:6, border:'none', cursor:'pointer', fontSize:11, fontWeight:active?700:400,
                          background: active ? 'rgba(99,102,241,.35)' : 'transparent',
                          color: active ? '#a5b4fc' : 'var(--app-fg-4)',
                          transition:'background .15s,color .15s' }}>
                        {opt[1]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div onClick={function(){ var inp=document.createElement('input'); inp.type='file'; inp.accept='image/png'; inp.onchange=function(e){ handleLogoUpload(e.target.files[0]); }; inp.click(); }}
                style={{ flex:1, border:'1.5px dashed var(--app-line)', borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', padding:16, background: logoUploading ? 'var(--app-surface-3)' : 'transparent', minHeight:120 }}>
                {logoUploading
                  ? <div className="forje-blob-spin forje-blob-spin--sm"/>
                  : <><div style={{width:36,height:36,borderRadius:9,background:'var(--app-surface-3)',display:'flex',alignItems:'center',justifyContent:'center'}}><AppIcon name="image" size={17}/></div><div style={{fontSize:12,color:'var(--app-fg-4)',lineHeight:1.6,textAlign:'center'}}>Glisse ou clique<br/><span style={{fontSize:10,opacity:.6}}>PNG transparent</span></div></>
                }
              </div>
            )}
          </div>

          {/* TILE 3 — Référence visuelle */}
          <div className="bento-tile" style={{ display:'flex', flexDirection:'column', minHeight:200 }}>
            <div className="bento-tile-lbl"><AppIcon name="layers" size={11}/>Style de reference</div>
            {styleRefUrl ? (
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ flex:1, position:'relative', borderRadius:10, overflow:'hidden', minHeight:100 }}>
                  <img src={styleRefUrl} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', minHeight:100 }}/>
                  <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(0,0,0,.5) 0%, transparent 55%)' }}/>
                  <div style={{ position:'absolute', bottom:8, left:10, fontSize:10, color:'rgba(255,255,255,.7)', fontWeight:500 }}>Ref active</div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <Btn variant="ghost" size="sm" onClick={function(){ var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.onchange=function(e){ handleStyleRefUpload(e.target.files[0]); }; inp.click(); }} style={{ flex:1, justifyContent:'center', color:'var(--app-accent)', borderColor:'rgba(99,102,241,.35)' }}>Changer</Btn>
                  <Btn variant="ghost" size="sm" onClick={function(){ setStyleRefUrl(''); }} style={{ color:'#ef4444', borderColor:'rgba(239,68,68,.35)' }}>×</Btn>
                </div>
              </div>
            ) : (
              <div onClick={function(){ var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.onchange=function(e){ handleStyleRefUpload(e.target.files[0]); }; inp.click(); }}
                style={{ flex:1, border:'1.5px dashed var(--app-line)', borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', padding:16, background: styleRefUploading ? 'var(--app-surface-3)' : 'transparent', minHeight:120 }}>
                {styleRefUploading
                  ? <div className="forje-blob-spin forje-blob-spin--sm"/>
                  : <><div style={{width:36,height:36,borderRadius:9,background:'var(--app-surface-3)',display:'flex',alignItems:'center',justifyContent:'center'}}><AppIcon name="layers" size={17}/></div><div style={{fontSize:12,color:'var(--app-fg-4)',lineHeight:1.6,textAlign:'center'}}>Ref visuelle IA<br/><span style={{fontSize:10,opacity:.6}}>JPG, PNG, WebP</span></div></>
                }
              </div>
            )}
          </div>

          {/* TILE 4 — Palette */}
          <div className="bento-tile" style={{ display:'flex', flexDirection:'column' }}>
            <div className="bento-tile-lbl"><AppIcon name="palette" size={11}/>Palette</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10, flex:1 }}>
              {[
                ['Principale', primaryColor, function(e){ setPrimaryColor(e.target.value); }],
                ['Accent',     accentColor,  function(e){ setAccentColor(e.target.value); }],
              ].map(function(cfg) {
                return (
                  <label key={cfg[0]} style={{ display:'block', cursor:'pointer', position:'relative' }}>
                    <div style={{ fontSize:10, color:'var(--app-fg-4)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.08em' }}>{cfg[0]}</div>
                    <div className="bento-color-block" style={{ background:cfg[1], boxShadow:'0 2px 10px ' + cfg[1] + '44' }}/>
                    <input type="color" value={cfg[1]} onChange={cfg[2]} style={{ position:'absolute', opacity:0, width:1, height:1, top:0, left:0, pointerEvents:'none' }}/>
                    <div style={{ fontSize:11.5, color:'var(--app-fg-3)', fontFamily:'JetBrains Mono,monospace', display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:-2 }}>
                      <span>{cfg[1]}</span><AppIcon name="edit" size={11}/>
                    </div>
                  </label>
                );
              })}
              <div style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 10px', background:'var(--app-surface-3)', borderRadius:8, marginTop:'auto' }}>
                {badgeVisible && <div style={{ padding:'3px 8px', borderRadius:3, background:primaryColor, fontSize:9, fontWeight:700, color:'#fff', letterSpacing:1.2, textTransform:'uppercase', flexShrink:0 }}>SPORT</div>}
                {barVisible && <div style={{ width:24, height:2.5, borderRadius:2, background:accentColor, flexShrink:0 }}/>}
                {!badgeVisible && !barVisible && <span style={{ fontSize:10, color:'var(--app-fg-4)', fontStyle:'italic', flex:1 }}>Aucun element</span>}
                <div style={{ marginLeft:'auto', display:'flex', gap:10 }}>
                  {[['Badge', badgeVisible, setBadgeVisible],['Barre', barVisible, setBarVisible]].map(function(t) {
                    return (<label key={t[0]} style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer', fontSize:11, color:'var(--app-fg-4)', userSelect:'none' }}><input type="checkbox" checked={t[1]} onChange={function(e){ t[2](e.target.checked); }} style={{ accentColor:'var(--app-accent)', cursor:'pointer' }}/>{t[0]}</label>);
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* TILE 5 — Typographie : Packs (rapide) OU Personnalisé (titre+corps, import) */}
          <div className={'bento-tile ' + (fontMode === 'packs' ? 'bento-tile--full' : 'bento-tile--wide')}>
            <div className="bento-tile-lbl" style={{ justifyContent:'space-between' }}>
              <span style={{ display:'flex', alignItems:'center', gap:6 }}><AppIcon name="grid" size={11}/>Typographie</span>
              <span style={{ display:'inline-flex', background:'var(--app-surface-3)', borderRadius:8, padding:2, gap:2 }}>
                {[['packs','Packs'],['custom','Personnalisé']].map(function(m){
                  var active = fontMode === m[0];
                  return (
                    <button key={m[0]} onClick={function(){ setFontMode(m[0]); if (m[0]==='custom') setGraphicStyle('custom'); }}
                      style={{ all:'unset', cursor:'pointer', padding:'4px 11px', borderRadius:6, fontSize:11, fontWeight: active?600:400,
                        color: active ? '#fff' : 'var(--app-fg-3)', background: active ? 'var(--app-accent)' : 'transparent', transition:'all .15s' }}>
                      {m[1]}
                    </button>
                  );
                })}
              </span>
            </div>

            {fontMode === 'packs' ? (
              <div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:14, justifyContent:'flex-start' }}>
                  {FONT_PACKS.map(function(p) {
                    return (<PackAnimatedCard key={p.id} pack={p} active={!fontIsCustom && graphicStyle === p.id} onSelect={function(){ selectPack(p); }}/>);
                  })}
                </div>
                <div style={{ fontSize:11, color:'var(--app-fg-4)', marginTop:10, fontStyle:'italic' }}>Clique une carte pour la sélectionner et rejouer son animation.</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {[['title','Titre / Display', fontPrimary, fontTitleFileRef],
                  ['body','Corps / Texte', fontBody, fontBodyFileRef]].map(function(slot){
                  var key = slot[0], lbl = slot[1], current = slot[2], ref = slot[3];
                  var LIB = (window.ForjeFonts && window.ForjeFonts.FONT_LIBRARY) || [];
                  var inLib = LIB.some(function(f){ return f.name === current; });
                  return (
                    <div key={key}>
                      <div style={{ fontSize:10, color:'var(--app-fg-4)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.08em' }}>{lbl}</div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <select value={inLib ? current : '__custom__'}
                          onChange={function(e){ var f = LIB.filter(function(x){ return x.name === e.target.value; })[0]; if (f) selectLibraryFont(f, key); }}
                          style={{ flex:1, boxSizing:'border-box', background:'var(--app-surface-3)', border:'1px solid var(--app-line)', borderRadius:7, padding:'8px 10px', color:'var(--app-fg)', fontSize:12.5, outline:'none' }}>
                          {!inLib && <option value="__custom__">{current} (importée)</option>}
                          {LIB.map(function(f){ return <option key={f.id} value={f.name}>{f.name}</option>; })}
                        </select>
                        <button onClick={function(){ if (ref.current) ref.current.click(); }}
                          style={{ all:'unset', cursor:'pointer', fontSize:11.5, fontWeight:600, color:'var(--app-accent)', whiteSpace:'nowrap', padding:'8px 4px' }}>
                          {fontUploading === key ? '…' : '↑ Importer'}
                        </button>
                        <input ref={ref} type="file" accept=".ttf,.otf,.woff,.woff2" style={{ display:'none' }}
                          onChange={function(e){ if (e.target.files[0]) handleFontUpload(e.target.files[0], key); e.target.value=''; }}/>
                      </div>
                      <div style={{ marginTop:6, fontFamily: "'" + current + "',Impact,sans-serif", fontSize: key==='title' ? 26 : 14,
                        color:'var(--app-fg-2)', padding:'6px 10px', background:'var(--app-surface-3)', borderRadius:6, lineHeight:1.3 }}>
                        {key==='title' ? 'TITRE EXEMPLE' : 'Corps de texte — lecture journalistique.'}
                      </div>
                    </div>
                  );
                })}
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:11.5, color:'var(--app-fg-3)', cursor:'pointer' }}>
                  <input type="checkbox" checked={fontRights} onChange={function(e){ setFontRights(e.target.checked); }}/>
                  Je détiens les droits d'usage des polices importées
                </label>
                {fontUploadErr && <div style={{ fontSize:11.5, color:'#ef4444' }}>{fontUploadErr}</div>}
              </div>
            )}

            {/* Aperçu — reflète la police titre + corps choisie */}
            <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--app-line)' }}>
              <div style={{ fontSize:9, color:'var(--app-fg-4)', marginBottom:6, textTransform:'uppercase', letterSpacing:'.08em' }}>Aperçu</div>
              <div style={{ background:'#0A0A0A', borderRadius:10, padding:'16px 18px' }}>
                <span style={{ display:'inline-block', background:accentColor, color:'#fff', fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:4, letterSpacing:'.06em' }}>{(topics[0]||'ACTU').toUpperCase()}</span>
                <div style={{ fontFamily: "'" + fontPrimary + "',Impact,sans-serif", color:'#fff', fontSize:34, lineHeight:1.05, marginTop:8, textTransform: fontSet==='impact' ? 'uppercase' : 'none' }}>Ton titre ici</div>
                <div style={{ fontFamily: "'" + fontBody + "',DM Sans,sans-serif", color:'rgba(255,255,255,.7)', fontSize:13, marginTop:5 }}>L'actu en temps réel.</div>
              </div>
            </div>
          </div>

          {/* TILE 6 — Mood éditorial */}
          <div className="bento-tile">
            <div className="bento-tile-lbl"><AppIcon name="bolt" size={11}/>Mood editorial</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {BRAND_MOODS.map(function(m) {
                var active = mood === m.id;
                return (
                  <div key={m.id} onClick={function(){ setMood(m.id); }}
                    style={{ padding:'9px 12px', borderRadius:9, border:'1.5px solid ' + (active ? 'var(--app-accent)' : 'var(--app-line)'), background: active ? 'rgba(99,102,241,.07)' : 'var(--app-surface-3)', cursor:'pointer', transition:'all .15s', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontWeight: active ? 600 : 400, fontSize:13, color: active ? 'var(--app-accent)' : 'var(--app-fg-2)' }}>{m.label}</span>
                    {active && <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--app-accent)', flexShrink:0 }}/>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* TILE 7 — Ton éditorial (wide 2-col) */}
          <div className="bento-tile bento-tile--wide">
            <div className="bento-tile-lbl" style={{ justifyContent:'space-between' }}>
              <span style={{ display:'flex', alignItems:'center', gap:6 }}><AppIcon name="quote" size={11}/>Ton editorial</span>
              <span style={{ fontSize:11, color: toneTags.length >= 3 ? 'var(--app-accent)' : 'var(--app-fg-4)', letterSpacing:'.05em', textTransform:'lowercase', fontWeight:500 }}>{toneTags.length}/3 selectionnes</span>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
              {BRAND_TONES.map(function(t) {
                var active = toneTags.includes(t);
                var maxed = toneTags.length >= 3 && !active;
                return (
                  <button key={t} onClick={function(){ if (!maxed) toggleTone(t); }}
                    style={{ all:'unset', cursor: maxed ? 'not-allowed' : 'pointer', padding:'5px 13px', borderRadius:20, fontSize:12.5, fontWeight: active ? 600 : 400, border:'1.5px solid ' + (active ? 'var(--app-accent)' : 'var(--app-line)'), color: active ? 'var(--app-accent)' : maxed ? 'var(--app-fg-4)' : 'var(--app-fg-2)', background: active ? 'rgba(99,102,241,.08)' : 'var(--app-surface-3)', transition:'all .15s', opacity: maxed ? 0.35 : 1 }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* TILE 8 — Sujets couverts */}
          <div className="bento-tile">
            <div className="bento-tile-lbl" style={{ justifyContent:'space-between' }}>
              <span style={{ display:'flex', alignItems:'center', gap:6 }}><AppIcon name="target" size={11}/>Sujets couverts</span>
              <span style={{ fontSize:11, color: topics.length >= 3 ? '#22c55e' : 'var(--app-fg-4)', letterSpacing:'.05em', textTransform:'lowercase', fontWeight:500 }}>{topics.length}/10{topics.length < 3 ? ' — min 3' : ''}</span>
            </div>
            <BrandTagInput tags={topics} setTags={setTopics} placeholder="Football, PSG, Transferts..." max={10}/>
          </div>

          {/* TILE 9 — Options avancées (full width) */}
          <div className="bento-tile bento-tile--full">
            <button onClick={function(){ setAdvancedOpen(!advancedOpen); }}
              style={{ all:'unset', cursor:'pointer', display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:500, color:'var(--app-fg-3)', marginBottom: advancedOpen ? 16 : 0, width:'100%' }}>
              <AppIcon name={advancedOpen ? 'chevDown' : 'chevRight'} size={14}/>Options avancees
            </button>
            {advancedOpen && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, paddingTop:4 }}>
                <div>
                  <div style={{ fontSize:10.5, color:'var(--app-fg-4)', marginBottom:6, textTransform:'uppercase', letterSpacing:'.08em' }}>Compte Instagram</div>
                  <input value={instaHandle} onChange={function(e){ setInstaHandle(e.target.value); }} placeholder="@votre_compte" style={{ width:'100%', boxSizing:'border-box', background:'var(--app-surface-3)', border:'1px solid var(--app-line)', borderRadius:7, padding:'8px 10px', color:'var(--app-fg)', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none' }}/>
                </div>
                <div>
                  <div style={{ fontSize:10.5, color:'var(--app-fg-4)', marginBottom:6, textTransform:'uppercase', letterSpacing:'.08em' }}>Hashtags habituels</div>
                  <BrandTagInput tags={hashtags} setTags={setHashtags} placeholder="#football..."/>
                </div>
                <div>
                  <div style={{ fontSize:10.5, color:'var(--app-fg-4)', marginBottom:6, textTransform:'uppercase', letterSpacing:'.08em' }}>Format prefere</div>
                  <div style={{ display:'flex', gap:6 }}>
                    {[['4:5','Portrait'],['1:1','Carré'],['9:16','Story']].map(function(opt) {
                      var active = preferredFormat === opt[0];
                      return (
                        <button key={opt[0]} onClick={function(){ setPreferredFormat(opt[0]); }}
                          style={{ all:'unset', flex:1, cursor:'pointer', padding:'7px 6px', textAlign:'center', border:'1.5px solid ' + (active ? 'var(--app-accent)' : 'var(--app-line)'), borderRadius:7, fontSize:11, fontWeight: active ? 600 : 400, color: active ? 'var(--app-accent)' : 'var(--app-fg-2)', background: active ? 'rgba(99,102,241,.06)' : 'var(--app-surface-3)', transition:'all .15s', lineHeight:1.5 }}>
                          {opt[1]}<br/><span style={{ opacity:.6, fontSize:10 }}>{opt[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ── Live Preview (sticky right col) ── */}
        <div style={{ position:'sticky', top:80, display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
          <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1.2, color:'var(--app-fg-4)', alignSelf:'flex-start' }}>Apercu live</div>
          <BrandPostPreview name={name} primaryColor={primaryColor} accentColor={accentColor} fontPrimary={fontPrimary} fontSecondary={fontBody} mood={mood} logoUrl={logoUrl} graphicStyle={graphicStyle} badgeVisible={badgeVisible} barVisible={barVisible}/>
          <div style={{ fontSize:11, color:'var(--app-fg-4)', textAlign:'center', lineHeight:1.5 }}>Mise a jour en temps reel<br/><span style={{ opacity:.6 }}>a chaque changement</span></div>
        </div>

      </div>

      {saveErr && (
        <div style={{ marginTop:14, padding:'10px 14px', borderRadius:8, fontSize:12, background:'rgba(239,68,68,.06)', border:'1px solid rgba(239,68,68,.2)', color:'#ef4444' }}>{saveErr}</div>
      )}
      {saveMsg && (
        <div style={{ marginTop:14, padding:'12px 16px', borderRadius:8, fontSize:13, lineHeight:1.5, background:'rgba(34,197,94,.07)', border:'1px solid rgba(34,197,94,.2)', color:'#16a34a' }}>{saveMsg}</div>
      )}

    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

const SettingsToggle = function({ checked, onChange }) {
  return (
    <button
      className="settings-toggle"
      onClick={function() { onChange(!checked); }}
      style={{ background: checked ? 'var(--app-accent)' : 'var(--app-line-3)' }}
    >
      <span className="settings-toggle-knob" style={{ left: checked ? 18 : 2 }}/>
    </button>
  );
};

const SettingsSection = function({ title, sub, children }) {
  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <div className="settings-section-title">{title}</div>
        {sub && <div className="settings-section-sub">{sub}</div>}
      </div>
      <div className="settings-section-body">{children}</div>
    </div>
  );
};

const SettingsRow = function({ label, sub, right, danger }) {
  return (
    <div className={'settings-row' + (danger ? ' settings-row--danger' : '')}>
      <div className="settings-row-l">
        <div className="settings-row-label">{label}</div>
        {sub && <div className="settings-row-sub">{sub}</div>}
      </div>
      {right && <div className="settings-row-r">{right}</div>}
    </div>
  );
};

const PRESET_AVATARS = [
  { id:'moon',   src:'assets/avatars/moon.png',   label:'Lune' },
  { id:'comet',  src:'assets/avatars/comet.png',  label:'Comète' },
  { id:'planet', src:'assets/avatars/planet.png', label:'Planète' },
  { id:'spark',  src:'assets/avatars/spark.png',  label:'Étincelle' },
];

const SettingsScreen = function({ prefs = {}, onPrefsChange }) {
  var user = window.__currentUser;
  var sb   = window.__supabase;
  var email = user?.email || '';
  var fullName = user?.user_metadata?.full_name || '';

  var DEFAULT_NOTIF = { hot_news_email:true, hot_news_push:true, low_credits_email:true, weekly_recap_email:true, product_news_email:false };
  var TABS = [
    { id:'account',       icon:'target',  label:'Compte'         },
    { id:'billing',       icon:'bolt',    label:'Abonnement'     },
    { id:'credits',       icon:'sparkle', label:'Crédits'        },
    { id:'connections',   icon:'link',    label:'Connexions'     },
    { id:'notifications', icon:'bell',    label:'Notifications'  },
    { id:'danger',        icon:'trash',   label:'Zone de danger' },
  ];
  function tabFromHash() {
    var h = (location.hash || '').replace(/^#/, '');
    return TABS.some(function(t){ return t.id === h; }) ? h : 'account';
  }

  var [tab, setTab] = useState(tabFromHash());
  var [profile, setProfile] = useState(null);
  var [toast, setToast] = useState(null);
  var toastRef = useRef(null);
  var [nameField, setNameField]   = useState('');
  var [emailField, setEmailField] = useState(email);
  var [savingName, setSavingName] = useState(false);
  var avatarInputRef = useRef(null);
  var [defFormat, setDefFormat] = useState(prefs.defaultFormat || 'Actualité');
  var [pulseMode, setPulseMode] = useState(prefs.pulseMode !== undefined ? prefs.pulseMode : false);
  var [notif, setNotif] = useState(DEFAULT_NOTIF);
  var [checkoutLoading, setCheckoutLoading] = useState(false);
  var [portalLoading, setPortalLoading] = useState(false);
  var [tx, setTx] = useState([]);
  var [txPage, setTxPage] = useState(0);
  var [txDone, setTxDone] = useState(false);
  var [txLoading, setTxLoading] = useState(false);
  var [monthTx, setMonthTx] = useState([]);
  var [exporting, setExporting] = useState(false);
  var [delName, setDelName] = useState('');
  var [deleting, setDeleting] = useState(false);
  var TX_PAGE = 20;

  var displayName = fullName || profile?.name || email.split('@')[0] || 'Utilisateur';
  var initials = (fullName
    ? fullName.split(' ').map(function(w){ return w[0]; }).join('').slice(0,2)
    : displayName.slice(0,2)).toUpperCase();

  function showToast(msg) {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(function(){ setToast(null); }, 2200);
  }
  function savePref(key, val) {
    if (onPrefsChange) onPrefsChange(Object.assign({}, prefs, { [key]: val }));
    showToast('Enregistré ✓');
  }

  function loadProfile() {
    if (!sb || !user) return;
    var q = sb.from('clients').select('id,name,avatar_url,logo_url,credits,subscription_status,credits_unlimited,credits_reset_at,stripe_customer_id,notif_prefs,instagram_connected,instagram_username').eq('user_id', user.id);
    if (window.__activeClientId) q = q.eq('id', window.__activeClientId);
    q.order('created_at').limit(1).maybeSingle().then(function(r){
      if (r.data) { setProfile(r.data); setNameField(r.data.name || ''); setNotif(Object.assign({}, DEFAULT_NOTIF, r.data.notif_prefs || {})); }
    });
  }
  useEffect(function(){ loadProfile(); }, []);

  // Hash routing : chaque section = une URL (#account, #billing, …)
  useEffect(function(){
    function onHash(){ setTab(tabFromHash()); }
    window.addEventListener('hashchange', onHash);
    window.__goToSettings = function(t){ location.hash = t; setTab(t); };
    return function(){ window.removeEventListener('hashchange', onHash); };
  }, []);
  function goTab(t){ if ((location.hash || '').replace(/^#/,'') !== t) location.hash = t; setTab(t); }

  var subStatus = profile?.subscription_status || 'trial';
  var unlimited = !!profile?.credits_unlimited;
  var credits = profile?.credits ?? 0;
  var creditsMax = window.FORJE_CREDITS ? window.FORJE_CREDITS.cap(subStatus) : (subStatus === 'active' ? 700 : 50);
  var creditsPct = unlimited ? 100 : Math.min(100, Math.round(credits / creditsMax * 100));
  var planLabel = unlimited ? 'Accès illimité' : subStatus === 'active' ? 'Forje Studio' : subStatus === 'past_due' ? 'Paiement en attente' : subStatus === 'canceled' ? 'Abonnement terminé' : 'Essai gratuit';

  function fmtDate(d){ try { return new Date(d).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' }); } catch(_) { return '—'; } }
  function fmtShort(d){ try { var dt = new Date(d); return dt.toLocaleDateString('fr-FR', { day:'numeric', month:'short' }) + ' ' + dt.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }); } catch(_) { return ''; } }
  var nextRenew = profile?.credits_reset_at ? (function(){ var d = new Date(profile.credits_reset_at); d.setMonth(d.getMonth()+1); return d; })() : null;
  var daysToRenew = nextRenew ? Math.max(0, Math.ceil((nextRenew - new Date())/86400000)) : null;

  async function saveName() {
    if (!sb || !profile) return;
    setSavingName(true);
    await sb.from('clients').update({ name: nameField.trim() }).eq('id', profile.id);
    setSavingName(false); showToast('Enregistré ✓'); loadProfile();
  }
  async function saveEmail() {
    if (!sb || !emailField.trim() || emailField.trim() === email) return;
    var r = await sb.auth.updateUser({ email: emailField.trim() });
    if (r.error) alert(r.error.message); else showToast('Email de vérification envoyé ✓');
  }
  async function handlePwdReset() {
    if (!sb || !email) return;
    await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    showToast('Email de réinitialisation envoyé ✓');
  }
  async function onAvatarFile(e) {
    var f = e.target.files && e.target.files[0];
    if (!f || !sb || !profile || !user) return;
    var ext = (f.name.split('.').pop() || 'png').toLowerCase();
    var path = 'avatars/' + user.id + '/' + Date.now() + '.' + ext;
    var up = await sb.storage.from('brand-assets').upload(path, f, { upsert:true });
    if (up.error) { alert(up.error.message); return; }
    var pub = sb.storage.from('brand-assets').getPublicUrl(path);
    await sb.from('clients').update({ avatar_url: pub.data.publicUrl }).eq('id', profile.id);
    showToast('Photo mise à jour ✓'); loadProfile();
  }
  async function selectPreset(src) {
    if (!sb || !profile) return;
    await sb.from('clients').update({ avatar_url: src }).eq('id', profile.id);
    showToast('Avatar mis à jour ✓'); loadProfile();
  }

  async function toggleNotif(key) {
    var next = Object.assign({}, notif, { [key]: !notif[key] });
    setNotif(next);
    if (sb && profile) await sb.from('clients').update({ notif_prefs: next }).eq('id', profile.id);
    showToast('Enregistré ✓');
  }

  async function startCheckout() {
    var clientId = window.__activeClientId || profile?.id;
    if (!sb || !clientId) { alert('Sélectionne d\'abord une identité de marque.'); return; }
    setCheckoutLoading(true);
    try {
      var res = await veilleFetch('/billing/create-checkout', { method:'POST', body: JSON.stringify({ clientId: clientId }) });
      var json = await res.json();
      if (json.url) window.location.href = json.url;
      else { alert(json.error || 'Paiement indisponible pour le moment.'); setCheckoutLoading(false); }
    } catch (e) { alert('Erreur : ' + e.message); setCheckoutLoading(false); }
  }
  async function openPortal() {
    if (!profile) return;
    setPortalLoading(true);
    try {
      var res = await veilleFetch('/billing/create-portal', { method:'POST', body: JSON.stringify({ clientId: profile.id }) });
      var json = await res.json();
      if (json.url) window.location.href = json.url;
      else { alert(json.error || 'Portail indisponible.'); setPortalLoading(false); }
    } catch (e) { alert('Erreur : ' + e.message); setPortalLoading(false); }
  }

  async function loadTx(reset) {
    if (!sb || !profile) return;
    setTxLoading(true);
    var from = reset ? 0 : txPage * TX_PAGE;
    var r = await sb.from('credit_transactions').select('*').eq('client_id', profile.id).order('created_at', { ascending:false }).range(from, from + TX_PAGE - 1);
    var rows = r.data || [];
    setTx(function(prev){ return reset ? rows : prev.concat(rows); });
    setTxDone(rows.length < TX_PAGE);
    setTxPage(reset ? 1 : txPage + 1);
    setTxLoading(false);
  }
  async function loadMonth() {
    if (!sb || !profile) return;
    var start = new Date(); start.setDate(1); start.setHours(0,0,0,0);
    var r = await sb.from('credit_transactions').select('post_type,variant,credits_used').eq('client_id', profile.id).gte('created_at', start.toISOString());
    setMonthTx(r.data || []);
  }
  useEffect(function(){
    if (tab === 'credits' && profile && tx.length === 0) { loadTx(true); loadMonth(); }
  }, [tab, profile]);

  function exportCsv() {
    var rows = [['date','type','variant','credits','solde_apres'].join(',')];
    tx.forEach(function(t){ rows.push([t.created_at, t.post_type, t.variant, t.credits_used, t.balance_after].join(',')); });
    var blob = new Blob([rows.join('\n')], { type:'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'forje-credits.csv'; a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportAll() {
    setExporting(true);
    try {
      var res = await veilleFetch('/account/export', { method:'POST' });
      if (!res.ok) { var j = await res.json(); throw new Error(j.error || 'Erreur'); }
      var blob = await res.blob();
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'forje-export.zip'; a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { alert(e.message); }
    setExporting(false);
  }
  async function deleteAccount() {
    setDeleting(true);
    try {
      var res = await veilleFetch('/account/delete', { method:'POST', body: JSON.stringify({ confirmName: delName }) });
      var j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Erreur');
      if (sb) await sb.auth.signOut();
      window.location.href = '/';
    } catch (e) { alert(e.message); setDeleting(false); }
  }
  async function handleSignOut() {
    if (!sb) return;
    await sb.auth.signOut();
    window.location.reload();
  }

  // Répartition de la consommation du mois courant (par type de post)
  var breakdown = (function(){
    var acc = { actu:{posts:0,cr:0}, citation:{posts:0,cr:0}, deep_dive:{posts:0,cr:0} };
    monthTx.forEach(function(t){
      if (t.variant === 'refund' || !(t.credits_used > 0)) return;
      if (!acc[t.post_type]) return;
      acc[t.post_type].posts++; acc[t.post_type].cr += t.credits_used;
    });
    return acc;
  })();
  var usedTotal = breakdown.actu.cr + breakdown.citation.cr + breakdown.deep_dive.cr;
  var maxCr = Math.max(breakdown.actu.cr, breakdown.citation.cr, breakdown.deep_dive.cr, 1);
  var TYPE_LABEL = { actu:'Actu', citation:'Citation', deep_dive:'Deep Dive' };
  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <h1 className="page-title">Paramètres</h1>
          <p className="page-subtitle">Compte, plan, connexions et préférences.</p>
        </div>
      </div>

      <div className="settings-layout">

        {/* ── Left nav ── */}
        <nav className="settings-nav">
          {TABS.map(function(item) {
            return (
              <button key={item.id}
                className={'settings-nav-item' + (tab === item.id ? ' active' : '') + (item.id === 'danger' ? ' settings-nav-item--danger-tab' : '')}
                onClick={function(){ goTab(item.id); }}>
                <span className="settings-nav-ico"><AppIcon name={item.icon} size={14}/></span>
                <span className="settings-nav-lbl">{item.label}</span>
              </button>
            );
          })}
          <div className="settings-nav-divider"/>
          <button className="settings-nav-item settings-nav-item--danger" onClick={handleSignOut}>
            <span className="settings-nav-ico"><AppIcon name="logout" size={14}/></span>
            <span className="settings-nav-lbl">Déconnexion</span>
          </button>
        </nav>

        {/* ── Content ── */}
        <div className="settings-content">

          {/* ────────── COMPTE ────────── */}
          {tab === 'account' && (
            <div>
              <div className="settings-avatar-card">
                <div className="settings-avatar-lead">
                  <div className="settings-avatar"
                    style={ profile?.avatar_url ? { backgroundImage:'url('+profile.avatar_url+')', backgroundSize:'cover', backgroundPosition:'center', color:'transparent' } : null }>
                    {profile?.avatar_url ? '' : initials}
                  </div>
                  <div>
                    <div style={{ fontFamily:"'Fraunces',serif", fontSize:20, fontWeight:600,
                      letterSpacing:'-0.03em', color:'var(--app-fg)', lineHeight:1.15 }}>
                      {displayName}
                    </div>
                    <div style={{ fontSize:12, color:'var(--app-fg-4)', marginTop:3 }}>{email}</div>
                    <div style={{ marginTop:8, display:'flex', gap:6 }}>
                      <span className="settings-tag settings-tag--accent">{planLabel}</span>
                      <span className="settings-tag settings-tag--neutral">{unlimited ? '∞ crédits' : credits + ' / ' + creditsMax + ' crédits'}</span>
                    </div>
                  </div>
                </div>

                <div className="avatar-picker">
                  <div className="avatar-picker-label">Choisis ton avatar</div>
                  <div className="avatar-picker-row">
                    {PRESET_AVATARS.map(function(a){
                      return (
                        <button key={a.id} type="button" title={a.label}
                          className={'avatar-opt' + (profile?.avatar_url === a.src ? ' avatar-opt--active' : '')}
                          onClick={function(){ selectPreset(a.src); }}
                          style={{ backgroundImage:'url('+a.src+')' }}/>
                      );
                    })}
                    <button type="button" className="avatar-opt avatar-opt--upload" title="Importer une image"
                      onClick={function(){ if (avatarInputRef.current) avatarInputRef.current.click(); }}>
                      <AppIcon name="plus" size={15}/>
                    </button>
                  </div>
                </div>
                <input ref={avatarInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={onAvatarFile}/>
              </div>

              <SettingsSection title="Profil" sub="Ton nom d'affichage et ta photo.">
                <SettingsRow label="Nom" sub="Affiché dans l'app et sur ton espace."
                  right={
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <input className="settings-input" value={nameField} onChange={function(e){ setNameField(e.target.value); }} placeholder="Ton nom"/>
                      <button className="btn btn-primary btn-sm" onClick={saveName} disabled={savingName || !nameField.trim() || nameField.trim() === (profile?.name||'')}>
                        {savingName ? '…' : 'Enregistrer'}
                      </button>
                    </div>
                  }
                />
                <SettingsRow label="Email" sub="Un email de vérification sera envoyé à la nouvelle adresse."
                  right={
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <input className="settings-input" type="email" value={emailField} onChange={function(e){ setEmailField(e.target.value); }}/>
                      <button className="btn btn-ghost btn-sm" onClick={saveEmail} disabled={!emailField.trim() || emailField.trim() === email}>Modifier</button>
                    </div>
                  }
                />
              </SettingsSection>

              <SettingsSection title="Sécurité" sub="Protège l'accès à ton compte.">
                <SettingsRow label="Mot de passe" sub="On t'envoie un lien de réinitialisation par email."
                  right={<button className="btn btn-ghost btn-sm" onClick={handlePwdReset}>Modifier le mot de passe</button>}
                />
                <SettingsRow label="Identifiant compte" sub="Référence interne — non modifiable."
                  right={<span className="settings-mono">{user?.id ? user.id.slice(0,12) + '…' : '—'}</span>}
                />
              </SettingsSection>

              <SettingsSection title="Préférences" sub="Langue et confort d'usage.">
                <SettingsRow label="Langue" sub="Français uniquement pour l'instant (i18n à venir)."
                  right={<select className="settings-select" disabled><option>🇫🇷  Français</option></select>}
                />
                <SettingsRow label="Format par défaut" sub="Affiché en premier sur l'écran Générer."
                  right={
                    <select className="settings-select" value={defFormat} onChange={function(e){ setDefFormat(e.target.value); savePref('defaultFormat', e.target.value); }}>
                      <option>Actualité</option><option>Citation</option><option>Deep Dive</option>
                    </select>
                  }
                />
                <SettingsRow label="Mode Trader · Pulse" sub="Active un terminal veille façon Bloomberg dans la navigation."
                  right={<SettingsToggle checked={pulseMode} onChange={function(v){ setPulseMode(v); savePref('pulseMode', v); }}/>}
                />
              </SettingsSection>
            </div>
          )}

          {/* ────────── ABONNEMENT ────────── */}
          {tab === 'billing' && (
            <div>
              {subStatus === 'past_due' && !unlimited && (
                <div className="set-banner set-banner--danger">
                  <AppIcon name="flame" size={15}/>
                  <div><strong>Paiement échoué.</strong> Mets à jour ta carte pour continuer à générer.</div>
                  <button className="btn btn-sm set-banner-btn" onClick={openPortal} disabled={portalLoading}>{portalLoading ? '…' : 'Mettre à jour'}</button>
                </div>
              )}

              <div className={'set-bill-card' + (unlimited ? ' set-bill-card--unlim' : subStatus === 'active' ? ' set-bill-card--active' : subStatus === 'trial' ? ' set-bill-card--trial' : '')}>
                <div className="set-bill-top">
                  <div>
                    <div className="set-bill-name">{unlimited ? 'Accès illimité' : 'Forje Studio'}</div>
                    <div className="set-bill-price">
                      {unlimited ? 'À titre spécial · aucun débit' : subStatus === 'active' ? '69 €/mois · 700 crédits' : subStatus === 'canceled' ? 'Abonnement terminé' : '50 crédits d\'essai'}
                    </div>
                  </div>
                  <span className={'set-bill-badge set-bill-badge--' + (unlimited ? 'unlim' : subStatus)}>
                    {unlimited ? '∞ ILLIMITÉ' : subStatus === 'active' ? 'ACTIF' : subStatus === 'trial' ? 'ESSAI · ' + credits + ' cr.' : subStatus === 'past_due' ? 'IMPAYÉ' : 'TERMINÉ'}
                  </span>
                </div>

                {subStatus === 'active' && !unlimited && nextRenew && (
                  <div className="set-bill-meta">Prochain renouvellement : {fmtDate(nextRenew)}</div>
                )}

                <div className="set-bill-actions">
                  {unlimited ? (
                    <span className="set-bill-note">Tu génères sans compter. 💛</span>
                  ) : subStatus === 'active' ? (
                    <>
                      <button className="btn btn-primary" onClick={openPortal} disabled={portalLoading}>
                        {portalLoading ? 'Ouverture…' : 'Gérer mon abonnement →'}
                      </button>
                      <span className="set-bill-note">Moyen de paiement, factures, annulation — géré par Stripe.</span>
                    </>
                  ) : subStatus === 'past_due' ? (
                    <button className="btn btn-primary" onClick={openPortal} disabled={portalLoading}>{portalLoading ? '…' : 'Mettre à jour ma carte →'}</button>
                  ) : (
                    <button className="btn btn-primary" onClick={startCheckout} disabled={checkoutLoading}>
                      <AppIcon name="bolt" size={13}/>
                      {checkoutLoading ? 'Redirection…' : (subStatus === 'canceled' ? 'Se réabonner — 69 €/mois' : 'S\'abonner — 69 €/mois')}
                    </button>
                  )}
                </div>
              </div>

              <SettingsSection title="Tout est inclus" sub="Un seul plan, aucune option.">
                {['700 crédits chaque mois','Actu · Citation · Deep Dive, sans limite de features','Génération IA (Nano Banana / GPT-Image)','Charte de marque + polices personnalisées','Export 4K'].map(function(f){
                  return <div key={f} className="set-incl-row"><AppIcon name="check" size={13}/><span>{f}</span></div>;
                })}
              </SettingsSection>
            </div>
          )}

          {/* ────────── CRÉDITS ────────── */}
          {tab === 'credits' && (
            <div>
              <div className={'set-credits-hero' + (unlimited ? ' set-credits-hero--unlim' : creditsPct <= 15 ? ' set-credits-hero--low' : '')}>
                <div className="set-credits-hero-top">
                  <div>
                    <div className="set-credits-big">{unlimited ? '∞' : credits}<span className="set-credits-max">{unlimited ? '' : ' / ' + creditsMax}</span></div>
                    <div className="set-credits-sub">{unlimited ? 'crédits illimités' : 'crédits restants ce mois'}</div>
                  </div>
                  {!unlimited && <div className="set-credits-pct">{creditsPct}%</div>}
                </div>
                <div className="settings-credits-bar" style={{ width:'100%', height:10 }}>
                  <div className="settings-credits-fill" style={{ width: creditsPct + '%' }}/>
                </div>
                {!unlimited && nextRenew && (
                  <div className="set-credits-reset">Rechargés le {fmtDate(nextRenew)}{daysToRenew != null ? ' · dans ' + daysToRenew + ' jour' + (daysToRenew>1?'s':'') : ''}</div>
                )}
              </div>

              {!unlimited && (
                <SettingsSection title="Répartition de ta consommation" sub={usedTotal + ' crédit' + (usedTotal>1?'s':'') + ' utilisé' + (usedTotal>1?'s':'') + ' ce mois-ci'}>
                  {['actu','citation','deep_dive'].map(function(k){
                    var b = breakdown[k];
                    return (
                      <div key={k} className="set-break-row">
                        <span className="set-break-name">{TYPE_LABEL[k]}</span>
                        <span className="set-break-posts">{b.posts} post{b.posts>1?'s':''}</span>
                        <div className="set-break-bar"><div className="set-break-fill" style={{ width: (b.cr/maxCr*100) + '%' }}/></div>
                        <span className="set-break-cr">{b.cr} cr.</span>
                      </div>
                    );
                  })}
                </SettingsSection>
              )}

              <div className="set-hist-head">
                <div>
                  <div className="settings-section-title">Historique</div>
                  <div className="settings-section-sub">Chaque génération et remboursement.</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!tx.length}><AppIcon name="arrowUp" size={12}/> Exporter CSV</button>
              </div>
              <div className="set-hist">
                {tx.length === 0 && !txLoading && <div className="set-hist-empty">Aucune transaction pour l'instant.</div>}
                {tx.map(function(t){
                  var isRefund = t.credits_used < 0 || t.variant === 'refund';
                  var label = TYPE_LABEL[t.post_type] || t.post_type || '—';
                  if (t.post_type === 'deep_dive' && t.variant && t.variant !== 'refund') label += ' (' + t.variant + ')';
                  if (isRefund) label += ' · remboursement';
                  return (
                    <div key={t.id} className="set-hist-row">
                      <span className="set-hist-date">{fmtShort(t.created_at)}</span>
                      <span className="set-hist-label">{label}</span>
                      <span className={'set-hist-amt' + (isRefund ? ' set-hist-amt--plus' : '')}>{isRefund ? '+' + Math.abs(t.credits_used) : '−' + t.credits_used}</span>
                      <span className="set-hist-bal">{t.balance_after}</span>
                    </div>
                  );
                })}
                {!txDone && tx.length > 0 && (
                  <button className="set-hist-more" onClick={function(){ loadTx(false); }} disabled={txLoading}>{txLoading ? 'Chargement…' : 'Charger plus'}</button>
                )}
              </div>
            </div>
          )}

          {/* ────────── CONNEXIONS ────────── */}
          {tab === 'connections' && (
            <div>
              <SettingsSection title="Comptes connectés"
                sub="Publie tes posts directement depuis Forje, sans téléchargement manuel.">
                {[
                  { name:'Instagram', bg:'linear-gradient(135deg, #F58529, #DD2A7B 55%, #8134AF)', icon:(
                    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1.1" fill="#fff" stroke="none"/></svg>
                  ), desc:'Publie tes posts directement depuis Forje.', cta:'Lier mon compte Instagram' },
                  { name:'X / Twitter', bg:'#0F1528', icon:(
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff"><path d="M18.9 2h3.3l-7.2 8.2L23.6 22h-6.6l-5.2-6.8L5.8 22H2.5l7.7-8.8L1.6 2h6.8l4.7 6.2L18.9 2z"/></svg>
                  ), desc:'Adapte et publie tes posts sur X.', cta:'Lier mon compte X' },
                ].map(function(c) {
                  return (
                    <div key={c.name} className="set-conn-card">
                      <div className="set-conn-glyph" style={{ background:c.bg }}>{c.icon}</div>
                      <div className="set-conn-body">
                        <div className="set-conn-name">{c.name}<span className="set-conn-soon">BIENTÔT</span></div>
                        <div className="set-conn-desc">{c.desc}</div>
                      </div>
                      <button className="btn btn-ghost btn-sm" disabled title="Bientôt disponible">{c.cta}</button>
                    </div>
                  );
                })}
              </SettingsSection>

              <p className="set-conn-foot">D'autres réseaux (LinkedIn, planificateurs) arriveront après le lancement de la publication Instagram.</p>
            </div>
          )}

          {/* ────────── NOTIFICATIONS ────────── */}
          {tab === 'notifications' && (
            <div>
              <SettingsSection title="Alertes" sub="Sois prévenu quand ça compte.">
                <SettingsRow label="🔥 Actu chaude (score ≥ 85)" sub="Un scoop détecté sur ta veille."
                  right={
                    <div className="set-notif-cols">
                      <label className="set-notif-col"><span>Email</span><SettingsToggle checked={!!notif.hot_news_email} onChange={function(){ toggleNotif('hot_news_email'); }}/></label>
                      <label className="set-notif-col"><span>Push</span><SettingsToggle checked={!!notif.hot_news_push} onChange={function(){ toggleNotif('hot_news_push'); }}/></label>
                    </div>
                  }
                />
                <SettingsRow label="⚠️ Crédits faibles (< 50)" sub="Quand ton solde passe sous 50 crédits."
                  right={<label className="set-notif-col"><span>Email</span><SettingsToggle checked={!!notif.low_credits_email} onChange={function(){ toggleNotif('low_credits_email'); }}/></label>}
                />
              </SettingsSection>

              <SettingsSection title="Récaps" sub="Les emails plus posés.">
                <SettingsRow label="📊 Récap hebdo de ta veille" sub="Le meilleur de la semaine, chaque lundi."
                  right={<label className="set-notif-col"><span>Email</span><SettingsToggle checked={!!notif.weekly_recap_email} onChange={function(){ toggleNotif('weekly_recap_email'); }}/></label>}
                />
                <SettingsRow label="✨ Nouveautés Forje" sub="Les nouvelles fonctionnalités, sans spam."
                  right={<label className="set-notif-col"><span>Email</span><SettingsToggle checked={!!notif.product_news_email} onChange={function(){ toggleNotif('product_news_email'); }}/></label>}
                />
              </SettingsSection>
            </div>
          )}

          {/* ────────── ZONE DE DANGER ────────── */}
          {tab === 'danger' && (
            <div>
              <div className="set-danger-card">
                <div className="set-danger-item">
                  <div className="set-danger-txt">
                    <div className="set-danger-title">Exporter mes données</div>
                    <div className="set-danger-desc">Télécharge tout : identité de marque, posts générés, historique de crédits.</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={exportAll} disabled={exporting}>{exporting ? 'Préparation…' : 'Exporter (ZIP)'}</button>
                </div>

                <div className="set-danger-divider"/>

                <div className="set-danger-item">
                  <div className="set-danger-txt">
                    <div className="set-danger-title set-danger-title--red">Supprimer mon compte</div>
                    <div className="set-danger-desc">Irréversible. Ton identité de marque, tes posts et ton historique seront effacés définitivement.</div>
                    <div className="set-danger-confirm">
                      <label>Tape <strong>{profile?.name || '…'}</strong> pour confirmer :</label>
                      <input className="settings-input" value={delName} onChange={function(e){ setDelName(e.target.value); }} placeholder={profile?.name || 'nom du média'}/>
                    </div>
                  </div>
                  <button className="btn btn-sm set-danger-btn"
                    onClick={deleteAccount}
                    disabled={deleting || !profile || delName.trim().toLowerCase() !== (profile?.name||'').trim().toLowerCase()}>
                    {deleting ? 'Suppression…' : 'Supprimer'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
      {toast && <div className="settings-toast"><AppIcon name="check" size={12}/> {toast}</div>}
    </div>
  );
};

Object.assign(window, { GenerateScreen, QueueScreen, BrandScreen, SettingsScreen });
