const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const https   = require('https');
const http    = require('http');
const { URL } = require('url');

const router = express.Router();
const genai  = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const GEMINI_MODEL = 'gemini-2.5-pro';

const { supabase }  = require('../lib/supabase');
const { fontDefs, PACK_FONTS_GF } = require('../lib/fontLoader');

async function gemini(prompt) {
  const model  = genai.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function getClientBrand(userId) {
  if (!userId) return null;
  const { data } = await supabase.from('clients').select(
    'name,logo_url,brand_colors,font_primary,mood,graphic_style,tone_tags,topics,preferred_format'
  ).eq('user_id', userId).maybeSingle();
  return data || null;
}

function buildBrandContext(client) {
  if (!client) return '';
  const parts = [];
  if (client.name)          parts.push('MEDIA : ' + client.name);
  if (client.mood)          parts.push('Mood visuel : ' + client.mood);
  if (client.graphic_style) parts.push('Style graphique : ' + client.graphic_style);
  if (client.brand_colors?.length) parts.push('Palette : principale ' + client.brand_colors[0] + ', accent ' + client.brand_colors[1]);
  if (client.font_primary)  parts.push('Police : ' + client.font_primary);
  if (client.tone_tags?.length)  parts.push('Ton editorial : ' + client.tone_tags.join(', '));
  if (client.topics?.length)     parts.push('Sujets couverts : ' + client.topics.join(', '));
  return parts.length ? '\n\nCONTEXTE DU MEDIA :\n' + parts.join('\n') : '';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text, maxChars) {
  const words  = String(text).split(' ');
  const lines  = [];
  let   current = '';
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const parsed   = new URL(url);
    const lib      = parsed.protocol === 'https:' ? https : http;
    const options  = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      headers:  { 'User-Agent': 'Mozilla/5.0' },
      timeout:  12000,
    };
    const req = lib.request(options, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function serperImages(query) {
  const body = JSON.stringify({ q: query, num: 5 });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'google.serper.dev',
      path:     '/images',
      method:   'POST',
      headers:  {
        'X-API-KEY':      process.env.SERPER_API_KEY,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw).images || []); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function tryDownloadFirst(urls) {
  for (const url of urls) {
    try {
      const buf = await downloadBuffer(url);
      if (buf.length > 5000) return buf;
    } catch (_) { /* try next */ }
  }
  return null;
}

// ─── Chargement lazy de Sharp ─────────────────────────────────────────────────
let sharp;
try { sharp = require('sharp'); } catch (_) { sharp = null; }

// ─── Pack typographique → fallbacks systeme ───────────────────────────────────
const FONT_PACKS_SRV = {
  'impact-news':    { headFont:'Impact,Arial Black,sans-serif',  bodyFont:'Arial,Helvetica,sans-serif', headStyle:'normal', headWeight:'400', headSpacing:'2',  transform:true  },
  'edito-luxe':     { headFont:'Georgia,Times New Roman,serif',  bodyFont:'Georgia,serif',              headStyle:'italic', headWeight:'700', headSpacing:'-1', transform:false },
  'digital-native': { headFont:'Arial,Helvetica,sans-serif',     bodyFont:'Courier New,monospace',      headStyle:'normal', headWeight:'700', headSpacing:'-2', transform:false },
  'minimal-power':  { headFont:'Arial Black,Impact,sans-serif',  bodyFont:'Arial,Helvetica,sans-serif', headStyle:'normal', headWeight:'900', headSpacing:'-3', transform:true  },
  'neo-retro':      { headFont:'Georgia,Times New Roman,serif',  bodyFont:'Georgia,serif',              headStyle:'italic', headWeight:'400', headSpacing:'-1', transform:false },
};
const STYLE_TO_PACK_SRV = {
  magazine:'edito-luxe', breaking:'impact-news', sport:'impact-news',
  lifestyle:'neo-retro', minimaliste:'minimal-power',
};
function getPackId(graphicStyle) {
  return STYLE_TO_PACK_SRV[graphicStyle] || graphicStyle || 'impact-news';
}
function getPack(graphicStyle) {
  const id = getPackId(graphicStyle);
  return FONT_PACKS_SRV[id] || FONT_PACKS_SRV['impact-news'];
}

// ─── POST /api/generate/actu ──────────────────────────────────────────────────
router.post('/actu', async (req, res) => {
  if (!sharp) return res.status(500).json({ error: 'Sharp non installe (npm install sharp)' });

  const { newsText, photoUrl, photoData, userId } = req.body;
  if (!newsText) return res.status(400).json({ error: 'newsText manquant' });

  try {
    const client  = await getClientBrand(userId);
    const brandCtx = buildBrandContext(client);
    const packId       = getPackId(client?.graphic_style);
    const primaryColor = client?.brand_colors?.[0] || null;
    const accentColor  = client?.brand_colors?.[1] || null;

    // 1. Gemini -> brief editorial
    const raw = await gemini(
      'Tu es directeur artistique d\'un media Instagram.' + brandCtx + '\n\n' +
      'Actu : "' + newsText + '"\n\n' +
      'Genere un JSON :\n' +
      '{\n' +
      '  "search_query": "requete Google Images (en anglais) pour trouver la meilleure photo de la personne ou du sujet concerne",\n' +
      '  "title": "titre percutant en MAJUSCULES, 4-6 mots max",\n' +
      '  "subtitle": "sous-titre factuel, 8-12 mots",\n' +
      '  "category": "categorie 1 mot : SPORT | POLITIQUE | ECONOMIE | CULTURE | TECH | SOCIETE"\n' +
      '}\n\n' +
      'Retourne UNIQUEMENT le JSON.'
    );

    let brief;
    try {
      brief = JSON.parse(raw.trim());
    } catch (_) {
      const m = raw.match(/\{[\s\S]*\}/);
      brief = m ? JSON.parse(m[0]) : {};
    }
    const { search_query, title = 'BREAKING', subtitle = newsText.slice(0, 60), category = 'ACTU' } = brief;

    // 2. Photo : base64 > URL > Serper
    let photoBuffer = null;
    if (photoData) {
      const b64 = photoData.split(',')[1];
      if (b64) photoBuffer = Buffer.from(b64, 'base64');
    }
    if (!photoBuffer && photoUrl) {
      try { photoBuffer = await downloadBuffer(photoUrl); } catch (_) {}
    }
    if (!photoBuffer && search_query && process.env.SERPER_API_KEY) {
      const images = await serperImages(search_query);
      const urls   = images.map(img => img.imageUrl).filter(Boolean);
      photoBuffer  = await tryDownloadFirst(urls);
    }

    // 3. Sharp composite 1080x1350
    const W = 1080, H = 1350;

    let base;
    if (photoBuffer) {
      base = await sharp(photoBuffer).resize(W, H, { fit: 'cover', position: 'center' }).toBuffer();
    } else {
      base = await sharp({
        create: { width: W, height: H, channels: 4, background: { r: 15, g: 15, b: 25, alpha: 1 } },
      }).png().toBuffer();
    }

    const gradient = Buffer.from(
      `<svg width="${W}" height="${H}"><defs>` +
      `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="35%" stop-color="black" stop-opacity="0"/>` +
      `<stop offset="100%" stop-color="black" stop-opacity="0.92"/>` +
      `</linearGradient></defs>` +
      `<rect width="${W}" height="${H}" fill="url(#g)"/>` +
      `</svg>`
    );

    const BADGE_COLORS = {
      SPORT: '#E11D48', POLITIQUE: '#7C3AED', ECONOMIE: '#0EA5E9',
      CULTURE: '#F59E0B', TECH: '#10B981', SOCIETE: '#6366F1',
    };

    // Accent bar only — text rendered client-side with real Google Fonts
    const accentBar = Buffer.from(
      `<svg width="${W}" height="8"><rect width="${W}" height="8" fill="${accentColor || '#10B981'}"/></svg>`
    );

    const composites = [
      { input: gradient,  blend: 'over' },
      { input: accentBar, left: 0, top: H - 8 },
    ];

    if (client?.logo_url) {
      try {
        const logoBuf     = await downloadBuffer(client.logo_url);
        const logoResized = await sharp(logoBuf).resize(null, 52, { fit: 'inside' }).png().toBuffer();
        const logoMeta    = await sharp(logoResized).metadata();
        composites.push({ input: logoResized, top: 40, left: W - logoMeta.width - 40 });
      } catch (_) { /* logo optionnel */ }
    }

    const out = await sharp(base)
      .composite(composites)
      .jpeg({ quality: 92 })
      .toBuffer();

    // Return background + text data — client Canvas renders the text with real fonts
    res.json({
      bgImage: 'data:image/jpeg;base64,' + out.toString('base64'),
      title, subtitle, category, packId,
      primaryColor: primaryColor || BADGE_COLORS[category] || '#6366F1',
      accentColor:  accentColor  || '#10B981',
    });

  } catch (err) {
    console.error('[Generate/Actu]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/generate/citation ─────────────────────────────────────────────
router.post('/citation', async (req, res) => {
  if (!sharp) return res.status(500).json({ error: 'Sharp non installe' });

  const { quoteText, authorName, authorTitle, userId } = req.body;
  if (!quoteText || !authorName) return res.status(400).json({ error: 'quoteText et authorName requis' });

  try {
    const client  = await getClientBrand(userId);
    const packId  = getPackId(client?.graphic_style);
    const pack    = getPack(client?.graphic_style);
    const fDefs   = fontDefs(packId);
    const fontFam = PACK_FONTS_GF[packId]?.name || pack.headFont;
    const W = 1080, H = 1080;

    // 1. Serper -> photo de l'auteur
    let photoBuffer = null;
    if (process.env.SERPER_API_KEY) {
      const images = await serperImages(authorName + ' portrait officiel');
      const urls   = images.map(i => i.imageUrl).filter(Boolean);
      photoBuffer  = await tryDownloadFirst(urls);
    }

    let base;
    if (photoBuffer) {
      base = await sharp(photoBuffer).resize(W, H, { fit: 'cover', position: 'center' }).toBuffer();
    } else {
      base = await sharp({
        create: { width: W, height: H, channels: 4, background: { r: 20, g: 20, b: 30, alpha: 1 } },
      }).png().toBuffer();
    }

    // 2. Double vignettage
    const vignette = Buffer.from(
      `<svg width="${W}" height="${H}"><defs>` +
      `<radialGradient id="r" cx="50%" cy="40%" r="65%">` +
      `<stop offset="0%" stop-color="black" stop-opacity="0"/>` +
      `<stop offset="100%" stop-color="black" stop-opacity="0.65"/>` +
      `</radialGradient>` +
      `<linearGradient id="l" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="20%" stop-color="black" stop-opacity="0"/>` +
      `<stop offset="100%" stop-color="black" stop-opacity="0.88"/>` +
      `</linearGradient></defs>` +
      `<rect width="${W}" height="${H}" fill="url(#r)"/>` +
      `<rect width="${W}" height="${H}" fill="url(#l)"/>` +
      `</svg>`
    );

    const qMark = Buffer.from(
      `<svg width="72" height="72">` +
      `<text x="0" y="60" font-family="Georgia,serif" font-size="100" font-weight="700" fill="white" opacity="0.45">"</text>` +
      `</svg>`
    );

    const qLines = wrapText(quoteText, 22);
    const qSvg = Buffer.from(
      `<svg width="${W - 120}" height="${qLines.length * 74 + 20}">` +
      fDefs +
      qLines.map((l, i) =>
        `<text x="${(W - 120) / 2}" y="${60 + i * 74}" font-family="${fontFam}" font-size="52" font-weight="${pack.headWeight}" font-style="${pack.headStyle}" fill="white" text-anchor="middle">${escapeXml(l)}</text>`
      ).join('') +
      `</svg>`
    );

    const authLine2 = authorTitle
      ? `<text x="${(W - 120) / 2}" y="73" font-family="Arial,Helvetica,sans-serif" font-size="20" fill="rgba(255,255,255,0.52)" text-anchor="middle">${escapeXml(authorTitle)}</text>`
      : '';
    const authSvg = Buffer.from(
      `<svg width="${W - 120}" height="80">` +
      `<line x1="${(W - 120) / 2 - 50}" y1="18" x2="${(W - 120) / 2 + 50}" y2="18" stroke="white" stroke-opacity="0.28" stroke-width="1"/>` +
      `<text x="${(W - 120) / 2}" y="50" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="600" fill="white" text-anchor="middle" letter-spacing="1">${escapeXml(authorName.toUpperCase())}</text>` +
      authLine2 +
      `</svg>`
    );

    const qH    = qLines.length * 74 + 20;
    const total = 72 + 12 + qH + 20 + 80;
    const startY = Math.round((H - total) / 2);

    const out = await sharp(base)
      .composite([
        { input: vignette },
        { input: qMark,   left: 60, top: startY },
        { input: qSvg,    left: 60, top: startY + 72 + 12 },
        { input: authSvg, left: 60, top: startY + 72 + 12 + qH + 20 },
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

    res.json({ image: 'data:image/jpeg;base64,' + out.toString('base64') });

  } catch (err) {
    console.error('[Generate/Citation]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/generate/deepdive ─────────────────────────────────────────────
router.post('/deepdive', async (req, res) => {
  if (!sharp) return res.status(500).json({ error: 'Sharp non installe' });

  const { topic, userId } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic manquant' });

  try {
    const client    = await getClientBrand(userId);
    const brandCtx  = buildBrandContext(client);
    const packId    = getPackId(client?.graphic_style);
    const pack      = getPack(client?.graphic_style);
    const fDefs     = fontDefs(packId);
    const fontFam   = PACK_FONTS_GF[packId]?.name || pack.headFont;
    const accentCol = client?.brand_colors?.[1] || null;

    // 1. Gemini -> plan 6 slides
    const raw = await gemini(
      'Plan un carousel Instagram pedagogique de 6 slides sur : "' + topic + '"' + brandCtx + '\n\n' +
      'Retourne UNIQUEMENT ce JSON :\n' +
      '{\n' +
      '  "slides": [\n' +
      '    {\n' +
      '      "position": 1,\n' +
      '      "role": "hook",\n' +
      '      "title": "titre accrocheur max 5 mots",\n' +
      '      "body": "phrase courte max 15 mots",\n' +
      '      "color_from": "#hexcolor",\n' +
      '      "color_to": "#hexcolor"\n' +
      '    }\n' +
      '  ]\n' +
      '}\n\n' +
      'Roles : hook (slide 1), content (slides 2-5), cta (slide 6).\n' +
      'Pour color_from et color_to : choisis des degrades coherents et distincts par slide, ambiance editoriale sombre.\n' +
      'La progression doit etre narrative : accroche -> developpement -> conclusion actionnable.'
    );

    let slides;
    try {
      const parsed = JSON.parse(raw.trim());
      slides = parsed.slides;
    } catch (_) {
      const m = raw.match(/\{[\s\S]*\}/);
      slides = m ? JSON.parse(m[0]).slides : [];
    }

    if (!slides || !slides.length) throw new Error('Pas de plan genere');

    // 2. Sharp composite chaque slide
    const W = 1080, H = 1080;

    const DEFAULTS = [
      ['#0F0C29', '#302B63'], ['#1A1A2E', '#16213E'],
      ['#0D0D0D', '#1a1a2e'], ['#0F2027', '#203A43'],
      ['#1a1a2e', '#16213E'], ['#0D0D0D', '#302B63'],
    ];

    const slideBuffers = await Promise.all(slides.map(async (slide, i) => {
      const cf = slide.color_from || DEFAULTS[i][0];
      const ct = slide.color_to   || DEFAULTS[i][1];
      const isHook = slide.role === 'hook';

      const bg = Buffer.from(
        `<svg width="${W}" height="${H}"><defs>` +
        `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0%" stop-color="${escapeXml(cf)}"/>` +
        `<stop offset="100%" stop-color="${escapeXml(ct)}"/>` +
        `</linearGradient>` +
        `<linearGradient id="ov" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0%" stop-color="black" stop-opacity="0.1"/>` +
        `<stop offset="100%" stop-color="black" stop-opacity="0.55"/>` +
        `</linearGradient></defs>` +
        `<rect width="${W}" height="${H}" fill="url(#bg)"/>` +
        `<rect width="${W}" height="${H}" fill="url(#ov)"/>` +
        `</svg>`
      );

      const base = await sharp(bg).png().toBuffer();

      const numSvg = Buffer.from(
        `<svg width="120" height="30">` +
        `<text x="0" y="22" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="500" fill="rgba(255,255,255,0.38)" letter-spacing="1">${slide.position} / 6</text>` +
        `</svg>`
      );

      const fs = isHook ? 96 : 76;
      const slideText  = pack.transform ? (slide.title || '').toUpperCase() : (slide.title || '');
      const titleLines = wrapText(slideText, isHook ? 14 : 18);
      const titleSvg = Buffer.from(
        `<svg width="${W - 80}" height="${titleLines.length * (fs + 10) + 20}">` +
        fDefs +
        titleLines.map((l, j) =>
          `<text x="0" y="${fs + j * (fs + 10)}" font-family="${fontFam}" font-size="${fs}" font-weight="${pack.headWeight}" font-style="${pack.headStyle}" fill="white" letter-spacing="${pack.headSpacing}">${escapeXml(l)}</text>`
        ).join('') +
        `</svg>`
      );

      const bodyLines = wrapText(slide.body || '', 38);
      const bodySvg = Buffer.from(
        `<svg width="${W - 80}" height="${bodyLines.length * 44 + 10}">` +
        bodyLines.map((l, j) =>
          `<text x="0" y="${36 + j * 44}" font-family="${pack.bodyFont}" font-size="30" font-weight="400" fill="rgba(255,255,255,0.72)">${escapeXml(l)}</text>`
        ).join('') +
        `</svg>`
      );

      const prog = Math.round((slide.position / 6) * (W - 80));
      const progBar = Buffer.from(
        `<svg width="${W}" height="8">` +
        `<rect width="${W - 80}" height="2" x="40" y="3" fill="rgba(255,255,255,0.15)" rx="1"/>` +
        `<rect width="${prog}" height="2" x="40" y="3" fill="${accentCol || 'rgba(255,255,255,0.8)'}" rx="1"/>` +
        `</svg>`
      );

      const titleH        = titleLines.length * (fs + 10) + 20;
      const bodyH         = bodyLines.length * 44 + 10;
      const totalContentH = titleH + 24 + bodyH;
      const contentTop    = H - 80 - totalContentH;

      return sharp(base)
        .composite([
          { input: numSvg,   left: 40, top: 44 },
          { input: titleSvg, left: 40, top: Math.max(80, contentTop) },
          { input: bodySvg,  left: 40, top: Math.max(80, contentTop) + titleH + 20 },
          { input: progBar,  left: 0,  top: H - 48 },
        ])
        .jpeg({ quality: 92 })
        .toBuffer();
    }));

    const images = slideBuffers.map(b => 'data:image/jpeg;base64,' + b.toString('base64'));
    res.json({ images, slides });

  } catch (err) {
    console.error('[Generate/DeepDive]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
