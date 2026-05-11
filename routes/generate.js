const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI  = require('openai');
const https   = require('https');
const http    = require('http');
const { URL } = require('url');

const Anthropic = require('@anthropic-ai/sdk');

const router = express.Router();
const genai  = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const GEMINI_MODEL = 'gemini-2.5-pro';
let openaiClient;
try { openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); } catch (_) {}
const haiku = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const { supabase }  = require('../lib/supabase');
const { fontDefs, PACK_FONTS_GF } = require('../lib/fontLoader');

async function gemini(prompt) {
  const model  = genai.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function getClientBrand(userId, clientId) {
  if (!userId) return null;
  let q = supabase.from('clients').select(
    'name,logo_url,brand_colors,font_primary,mood,graphic_style,tone_tags,topics,preferred_format,style_ref_url'
  ).eq('user_id', userId);
  if (clientId) q = q.eq('id', clientId);
  const { data } = await q.order('created_at').limit(1).maybeSingle();
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

function extractJSON(str) {
  str = str.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');
  const start = str.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') { depth--; if (depth === 0) return str.slice(start, i + 1); }
  }
  return null;
}

function parseAIJson(raw) {
  const chunk = extractJSON(raw);
  if (!chunk) throw new Error('Pas de JSON dans la réponse');
  return JSON.parse(chunk);
}

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

function isImageBuffer(buf) {
  if (!buf || buf.length < 8) return false;
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8) return true;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50) return true;
  // WEBP: 52 49 46 46 ... 57 45 42 50
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45) return true;
  // GIF: 47 49 46
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
  return false;
}

async function tryDownloadFirst(urls) {
  for (const url of urls) {
    try {
      const buf = await downloadBuffer(url);
      if (buf.length > 5000 && isImageBuffer(buf)) return buf;
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

// ─── Image generation ────────────────────────────────────────────────────────

function buildImagePrompt(brief, client) {
  const mood = client?.mood || 'dramatique';
  const moodLights = {
    dramatique: 'dramatic cinematic lighting, deep shadows, high contrast, chiaroscuro',
    energique:  'vibrant dynamic lighting, energetic composition, strong sense of motion',
    premium:    'soft elegant lighting, refined composition, luxury editorial aesthetic',
    populaire:  'bold direct lighting, maximum contrast, immediate visual impact',
    factuel:    'clean neutral documentary lighting, journalistic credibility',
  };
  const light  = moodLights[mood] || moodLights.dramatique;
  const colors = client?.brand_colors || [];
  return [
    brief.visual_brief,
    `Mood: ${brief.emotion || mood}. ${light}.`,
    colors.length >= 2 ? `Color palette: dominant ${colors[0]}, accent ${colors[1]}.` : '',
    'Portrait format 4:5. Cinematic photorealistic editorial quality.',
    'Absolutely NO text, NO watermarks, NO captions in the image.',
    'Bottom 35% of the frame must be slightly darker (room for text overlay).',
  ].filter(Boolean).join(' ');
}

// Extrait des descripteurs de style depuis une image via GPT-4o Vision
async function extractStyleDescriptors(styleRefBuffer) {
  if (!openaiClient || !styleRefBuffer) return null;
  try {
    const b64 = styleRefBuffer.toString('base64');
    const resp = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 120,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'low' } },
          { type: 'text', text: 'Describe ONLY the visual style of this image in 2-3 sentences: composition style, lighting mood, aesthetic direction, graphic treatment. Do NOT describe the objects, people or colors. Be concise and technical, like a shot description for a photographer.' },
        ],
      }],
    });
    return resp.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.warn('[StyleRef] Vision extraction failed:', e.message);
    return null;
  }
}

// Analyse les images Serper via Vision pour décrire précisément le sujet (personne, objet, événement)
async function describeReferenceImages(imageBuffers) {
  if (!openaiClient || !imageBuffers || !imageBuffers.length) return null;
  try {
    const content = [
      ...imageBuffers.slice(0, 3).map(buf => ({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}`, detail: 'low' },
      })),
      {
        type: 'text',
        text: 'These are reference images of the subject of a news article. In 2-3 sentences, describe precisely: who or what is depicted (physical appearance, distinctive features, clothing, context), and the visual atmosphere. Be specific — this description will guide an AI image generator to depict this subject accurately in an editorial photo.',
      },
    ];
    const resp = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [{ role: 'user', content }],
    });
    const desc = resp.choices?.[0]?.message?.content?.trim() || null;
    if (desc) console.log('[RefImages] Subject described:', desc.slice(0, 100) + '...');
    return desc;
  } catch (e) {
    console.warn('[RefImages] Vision failed:', e.message);
    return null;
  }
}

async function generateImageGPT(prompt, styleRefBuffer = null, referenceBuffers = []) {
  if (!openaiClient) throw new Error('OpenAI client not initialized');
  let finalPrompt = prompt;

  // Analyser les images Serper et injecter la description du sujet dans le prompt
  if (referenceBuffers.length > 0) {
    const refDesc = await describeReferenceImages(referenceBuffers);
    if (refDesc) {
      finalPrompt = finalPrompt + ` Subject visual reference (depict this subject accurately): ${refDesc}`;
    }
  }

  // Injecter le style de référence utilisateur si fourni
  if (styleRefBuffer) {
    const styleDesc = await extractStyleDescriptors(styleRefBuffer);
    if (styleDesc) {
      finalPrompt = finalPrompt + ` Visual style (aesthetic only, not content): ${styleDesc}`;
    }
  }

  // Passer les images Serper directement à images.edit pour la meilleure fidélité au sujet
  if (referenceBuffers.length > 0) {
    try {
      const { toFile } = require('openai');
      const files = await Promise.all(
        referenceBuffers.slice(0, 4).map((buf, i) =>
          toFile(buf, `ref${i}.jpg`, { type: 'image/jpeg' })
        )
      );
      const response = await openaiClient.images.edit({
        model:   'gpt-image-1',
        image:   files.length === 1 ? files[0] : files,
        prompt:  finalPrompt,
        size:    '1024x1536',
        quality: 'high',
      });
      const b64 = response.data?.[0]?.b64_json;
      if (b64) {
        console.log('[GPT] images.edit with Serper references OK');
        return Buffer.from(b64, 'base64');
      }
    } catch (editErr) {
      console.warn('[GPT] images.edit failed, fallback to generate:', editErr.message);
    }
  }

  // Génération standard (sans références ou si edit a échoué)
  const response = await openaiClient.images.generate({
    model:   'gpt-image-1',
    prompt:  finalPrompt,
    size:    '1024x1536',
    quality: 'high',
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image data from gpt-image-1');
  return Buffer.from(b64, 'base64');
}

// Hard deadline helper — wraps any promise with a maximum wait
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}


// ─── Caption Instagram ────────────────────────────────────────────────────────
async function generateCaption(type, content, client) {
  const media  = client?.name || '';
  const tone   = client?.tone_tags?.length ? 'Ton éditorial : ' + client.tone_tags.join(', ') + '\n' : '';
  const topics = client?.topics?.length    ? 'Sujets couverts : ' + client.topics.join(', ')  + '\n' : '';

  const subjectMap = {
    actu:     `Actualité : "${content.newsText}"\nTitre visuel : ${content.title} — ${content.subtitle}`,
    citation: `Citation : "${content.quoteText}"\nPar : ${content.authorName}${content.authorTitle ? ', ' + content.authorTitle : ''}`,
    deepdive: `Sujet du carousel : "${content.topic}"\nAccroche slide 1 : ${content.hookTitle} — ${content.hookBody}`,
  };

  const prompt =
    `Tu rédiges la description Instagram${media ? ' pour ' + media : ''}.\n` +
    tone + topics + '\n' +
    subjectMap[type] + '\n\n' +
    `Structure OBLIGATOIRE :\n` +
    `1. HOOK — première ligne : 6-10 mots, tension immédiate, pas de ponctuation classique, doit arrêter le scroll\n` +
    `2. [ligne vide]\n` +
    `3. CORPS — 3-5 lignes : faits précis, contexte utile, language direct, zéro langue de bois\n` +
    `4. [ligne vide]\n` +
    `5. TENSION finale — question clivante OU affirmation provocatrice qui pousse au débat, commence par →\n` +
    `6. [ligne vide]\n` +
    `7. 5-6 hashtags pertinents\n\n` +
    `Règles : 150-250 mots · retours à la ligne vrais · pas de markdown · parle directement au lecteur · langue française\n\n` +
    `RETOURNE UNIQUEMENT LA DESCRIPTION.`;

  const response = await haiku.messages.create({
    model: 'claude-haiku-4-5-20251001', max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content.find(b => b.type === 'text')?.text?.trim() || '';
}

// ─── POST /api/generate/actu ──────────────────────────────────────────────────
router.post('/actu', async (req, res) => {
  const hardDeadline = setTimeout(() => {
    if (!res.headersSent) res.status(504).json({ error: 'Génération trop longue — réessaie (les serveurs IA sont lents en ce moment)' });
  }, 180000);

  if (!sharp) { clearTimeout(hardDeadline); return res.status(500).json({ error: 'Sharp non installe (npm install sharp)' }); }

  const { newsText, photoUrl, photoData, userId, clientId, imageMode = 'classic', styleRefData } = req.body;
  if (!newsText) { clearTimeout(hardDeadline); return res.status(400).json({ error: 'newsText manquant' }); }

  try {
    const client       = await getClientBrand(userId, clientId);
    const brandCtx     = buildBrandContext(client);
    const packId       = getPackId(client?.graphic_style);
    const primaryColor = client?.brand_colors?.[0] || null;
    const accentColor  = client?.brand_colors?.[1] || null;

    // 1. Gemini -> brief éditorial + visuel
    const needsVisual = imageMode === 'ai';
    const raw = await gemini(
      'Tu es directeur artistique d\'un media Instagram.' + brandCtx + '\n\n' +
      'Actu : "' + newsText + '"\n\n' +
      'Genere un JSON :\n' +
      '{\n' +
      '  "search_query": "requete Google Images en anglais pour trouver la meilleure photo",\n' +
      (needsVisual ? '  "visual_brief": "description cinematique de l\'image a generer, 2-3 phrases style shot description",\n' : '') +
      (needsVisual ? '  "emotion": "dramatique | energique | premium | populaire | factuel",\n' : '') +
      '  "title": "titre percutant en MAJUSCULES, 4-6 mots max",\n' +
      '  "subtitle": "sous-titre factuel, 8-12 mots",\n' +
      '  "category": "SPORT | POLITIQUE | ECONOMIE | CULTURE | TECH | SOCIETE"\n' +
      '}\n\n' +
      'Retourne UNIQUEMENT le JSON.'
    );

    let brief;
    try { brief = parseAIJson(raw); } catch (_) { brief = {}; }
    const {
      search_query, title = 'BREAKING', subtitle = newsText.slice(0, 60),
      category = 'ACTU', visual_brief,
    } = brief;

    // Caption lancée en parallèle — Haiku est rapide, pas de latence ajoutée
    const captionPromise = generateCaption('actu', { newsText, title, subtitle }, client).catch(() => '');

    // 2. Serper reference photos (used as classic/fallback background)
    let serperBuffers = [];
    if (photoData) {
      const b64 = photoData.split(',')[1];
      if (b64) serperBuffers.push(Buffer.from(b64, 'base64'));
    }
    if (serperBuffers.length === 0 && photoUrl) {
      try { serperBuffers.push(await downloadBuffer(photoUrl)); } catch (_) {}
    }
    if (serperBuffers.length === 0 && search_query && process.env.SERPER_API_KEY) {
      const images  = await serperImages(search_query);
      const urls    = images.map(img => img.imageUrl).filter(Boolean).slice(0, 3);
      const results = await Promise.all(urls.map(u => downloadBuffer(u).catch(() => null)));
      serperBuffers = results.filter(b => b && b.length > 5000 && isImageBuffer(b));
    }
    // 3. Style ref : one-shot (request) > persistent (brand)
    let styleRefBuffer = null;
    if (styleRefData) {
      const b64 = styleRefData.split(',')[1] || styleRefData;
      if (b64) styleRefBuffer = Buffer.from(b64, 'base64');
    } else if (client?.style_ref_url) {
      try { styleRefBuffer = await downloadBuffer(client.style_ref_url); } catch (_) {}
    }

    // 4. Image : AI mode ou classic
    let photoBuffer = null;
    if (imageMode === 'ai' && visual_brief) {
      const prompt = buildImagePrompt(brief, client);
      try {
        photoBuffer = await withTimeout(generateImageGPT(prompt, styleRefBuffer, serperBuffers), 90000, 'GPT-Image-1');
        console.log('[Actu] GPT image OK');
      } catch (gptErr) {
        console.warn('[Actu] GPT failed:', gptErr.message, '— falling back to Serper');
        photoBuffer = serperBuffers[0] || null;
      }
    } else {
      photoBuffer = serperBuffers[0] || null;
    }

    // 4. Sharp composite 1080x1350
    const W = 1080, H = 1350;

    let base;
    if (photoBuffer) {
      try {
        base = await sharp(photoBuffer).resize(W, H, { fit: 'cover', position: 'center' }).toBuffer();
      } catch (_) {
        photoBuffer = null;
      }
    }
    if (!base) {
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

    const caption = await captionPromise;
    clearTimeout(hardDeadline);

    // Return background + text data — client Canvas renders the text with real fonts
    res.json({
      bgImage: 'data:image/jpeg;base64,' + out.toString('base64'),
      title, subtitle, category, packId,
      primaryColor: primaryColor || BADGE_COLORS[category] || '#6366F1',
      accentColor:  accentColor  || '#10B981',
      caption,
    });

  } catch (err) {
    console.error('[Generate/Actu]', err.message);
    clearTimeout(hardDeadline);
    if (!res.headersSent) res.status(500).json({ error: err.message });
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

    const captionPromise = generateCaption('citation', { quoteText, authorName, authorTitle }, client).catch(() => '');

    // 1. Serper -> photo de l'auteur
    let photoBuffer = null;
    if (process.env.SERPER_API_KEY) {
      const images = await serperImages(authorName + ' portrait officiel');
      const urls   = images.map(i => i.imageUrl).filter(Boolean);
      photoBuffer  = await tryDownloadFirst(urls);
    }

    let base;
    if (photoBuffer) {
      try {
        base = await sharp(photoBuffer).resize(W, H, { fit: 'cover', position: 'center' }).toBuffer();
      } catch (_) {}
    }
    if (!base) {
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

    const caption = await captionPromise;
    res.json({ image: 'data:image/jpeg;base64,' + out.toString('base64'), caption });

  } catch (err) {
    console.error('[Generate/Citation]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Deep Dive — System Prompt ───────────────────────────────────────────────
const DEEP_DIVE_SYSTEM_PROMPT = `Tu es l'orchestrateur Deep Dive de Forje Studio. Tu génères le contenu structuré d'un carousel Instagram éducatif de 5 slides (format 4:5, 1080×1350px).

ENTRÉE (JSON message user) :
{ "topic":"string", "brand":{"primary":"#hex","secondary":"#hex","bg":"#hex","text":"#hex","handle":"@compte","tone":"punchy|informatif|premium|storytelling|académique","darkMode":true}, "template_id":"T1|T2|T3|T4|T5|null", "image_mode":"none|serp|genai|hybrid", "language":"fr" }

SORTIE STRICTE — JSON uniquement, zéro texte avant ou après :
{
  "meta": { "topic_refined":"...", "template_id":"T2", "image_mode":"..." },
  "content": {
    "topic":"...", "subtitle":"...",
    "points": [
      { "num":"01", "title":"...", "body":"...", "stat":"...", "stat_label":"..." },
      { "num":"02", "title":"...", "body":"...", "stat":null, "stat_label":null },
      { "num":"03", "title":"...", "body":"...", "stat":"...", "stat_label":"..." }
    ],
    "cta":"..."
  },
  "slides": [
    { "index":0, "type":"hook",  "variant":"B", "image":{"mode":"genai","prompt":"STYLE: cinematic photography SUBJECT: ... MOOD: ... FORMAT: portrait 4:5 AVOID: text watermarks faces logos"} },
    { "index":1, "type":"point", "variant":"A", "image":null },
    { "index":2, "type":"point", "variant":"B", "image":{"mode":"serp","search_query":"..."} },
    { "index":3, "type":"point", "variant":"A", "image":null },
    { "index":4, "type":"cta",   "variant":"A", "image":null }
  ],
  "caption":"...",
  "hashtags":["#deepdive","..."]
}

RÈGLES CONTENU :
- Hook : titre max 12 mots, tension (paradoxe/chiffre/question). Sous-titre : promet le bénéfice en une phrase.
- Points 1–3 : titre 3–7 mots, body 25–45 mots. Stat réelle et vérifiable uniquement — null si incertaine.
- CTA : action concrète + micro-raison. Variant toujours A, image toujours null.
- Alterne variant A et B au moins 2 fois sur les 5 slides.
- Ton : punchy=phrases courtes/verbes d'action ; premium=posé/raffiné ; académique=rigoureux/nuancé ; storytelling=narratif ; informatif=neutre/clair.
- Langue : toujours celle du champ language.
- Si image_mode=none : tous slides ont "image":null et variant "A". Si image_mode=serp : search_query précise, journalistique, -logo -text. Si image_mode=genai : prompt STYLE/SUBJECT/MOOD/FORMAT/AVOID. Si image_mode=hybrid : index 0→genai, index 1-2→serp si factuel/genai si abstrait, index 3→genai, index 4→null.

TEMPLATE (si template_id null) : punchy→T3, storytelling→T2, premium→T5, analytique→T4, informatif→T1.`;

// ─── Deep Dive — Brand helper ─────────────────────────────────────────────────
function buildDeepDiveBrand(client) {
  const colors  = client?.brand_colors || [];
  const tagStr  = [...(client?.tone_tags || []), client?.mood || ''].join(' ').toLowerCase();
  let tone = 'informatif';
  if (/punchy|viral|percutant|fort|impact/.test(tagStr)) tone = 'punchy';
  else if (/premium|luxe|haut|elite|raffiné/.test(tagStr)) tone = 'premium';
  else if (/storytell|narratif|histoire|cinéma/.test(tagStr)) tone = 'storytelling';
  else if (/academ|expert|rigueur|technique|data/.test(tagStr)) tone = 'académique';
  return {
    primary:     colors[0] || '#6366F1',
    secondary:   colors[1] || '#F5F500',
    bg:          '#0A0A0A',
    text:        '#FFFFFF',
    textMuted:   '#888888',
    handle:      client?.name ? '@' + client.name.toLowerCase().replace(/[^a-z0-9_]/g, '') : '@compte',
    logo:        client?.logo_url || null,
    darkMode:    true,
    tone,
  };
}

const TONE_TO_TEMPLATE = { punchy:'T3', storytelling:'T2', premium:'T5', académique:'T4', informatif:'T1' };

// ─── Deep Dive — Image resolver ───────────────────────────────────────────────
async function resolveSlideImage(slide) {
  if (!slide.image) return null;
  const { mode, prompt, search_query } = slide.image;
  try {
    if (mode === 'genai' && openaiClient) {
      const resp = await withTimeout(
        openaiClient.images.generate({ model:'gpt-image-1', prompt: prompt || 'abstract cinematic background dark', n:1, size:'1024x1536', quality: slide.index === 0 ? 'high' : 'standard' }),
        60000, 'GPT-Image deepdive'
      );
      const b64 = resp.data?.[0]?.b64_json;
      return b64 ? Buffer.from(b64, 'base64') : null;
    }
    if (mode === 'serp' && process.env.SERPER_API_KEY) {
      const imgs = await serperImages(search_query || '');
      const urls = imgs.map(i => i.imageUrl).filter(Boolean);
      return urls.length ? await tryDownloadFirst(urls) : null;
    }
  } catch (e) { console.warn('[DeepDive/Image]', e.message); }
  return null;
}

// ─── Deep Dive — Slide renderer (Sharp + SVG) ─────────────────────────────────
async function renderDeepDiveSlide(tplId, slideIndex, slideType, variant, brand, content, imgBuf) {
  const W = 1080, H = 1350, PAD = 60;
  const primary = brand.primary || '#6366F1';

  // Template palette
  const TC = {
    T1: { bg:'#FAFAF8', text:'#111111', accent: primary, muted:'#555555', barLeft:true,  uppercase:false },
    T2: { bg:'#080808', text:'#FFFFFF', accent: primary, muted:'rgba(255,255,255,0.55)', barTop:true,   uppercase:true  },
    T3: { bg:'#000000', text:'#FFFFFF', accent: primary, muted:'rgba(255,255,255,0.50)', barTop:true,   uppercase:true  },
    T4: { bg:'#0D0B1E', text:'#FFFFFF', accent: primary, muted:'rgba(255,255,255,0.50)', barTop:true,   uppercase:false },
    T5: { bg:'#F5F0E8', text:'#1A1A1A', accent:'#C9A96E',muted:'#7A6952',               barLeft:true,  uppercase:false },
  };
  const tc = TC[tplId] || TC.T2;

  // Content for this slide
  let title = '', body = '', num = '', stat = '', statLab = '';
  if (slideType === 'hook') {
    title = content.topic || '';
    body  = content.subtitle || '';
  } else if (slideType === 'point') {
    const pt = content.points?.[slideIndex - 1] || {};
    num      = pt.num     || String(slideIndex).padStart(2, '0');
    title    = pt.title   || '';
    body     = pt.body    || '';
    stat     = pt.stat    || '';
    statLab  = pt.stat_label || '';
  } else {
    title = content.cta || 'Sauvegardez ce carousel.';
  }
  if (tc.uppercase) { title = title.toUpperCase(); }

  // Base background
  const bgSvg = Buffer.from(
    `<svg width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="${escapeXml(tc.bg)}"/>` +
    (tc.barTop  ? `<rect x="0" y="0" width="${W}" height="5" fill="${escapeXml(tc.accent)}"/>` : '') +
    (tc.barLeft ? `<rect x="${PAD}" y="80" width="4" height="${H - 160}" rx="2" fill="${escapeXml(tc.accent)}" opacity="0.35"/>` : '') +
    `</svg>`
  );
  let base = await sharp(bgSvg).png().toBuffer();
  const composites = [];

  // Background image (variant B)
  if (imgBuf && variant === 'B') {
    try {
      const imgResized = await sharp(imgBuf).resize(W, H, { fit:'cover', position:'center' }).png().toBuffer();
      composites.push({ input: imgResized, left:0, top:0 });
      // Use userSpaceOnUse + black overlay so gradient renders correctly across all librsvg versions
      const overlay = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
        `<defs><linearGradient id="ov" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">` +
        `<stop offset="0%" stop-color="black" stop-opacity="0.28"/>` +
        `<stop offset="55%" stop-color="black" stop-opacity="0.52"/>` +
        `<stop offset="100%" stop-color="black" stop-opacity="0.78"/>` +
        `</linearGradient></defs>` +
        `<rect width="${W}" height="${H}" fill="url(#ov)"/>` +
        `</svg>`
      );
      composites.push({ input: await sharp(overlay).png().toBuffer(), left:0, top:0 });
    } catch (_) {}
  }

  // Ghost big number (T3 background effect)
  if (tplId === 'T3' && num) {
    const ghostSvg = Buffer.from(
      `<svg width="${W}" height="400">` +
      `<text x="${W - 40}" y="360" text-anchor="end" font-family="Arial Black,Arial,sans-serif" font-size="340" font-weight="900" fill="${escapeXml(tc.accent)}" opacity="0.08">${escapeXml(num)}</text>` +
      `</svg>`
    );
    composites.push({ input: ghostSvg, left:0, top: H - 460 });
  }

  // Slide counter
  const ctrSvg = Buffer.from(
    `<svg width="180" height="36">` +
    `<text x="180" y="26" text-anchor="end" font-family="Arial,sans-serif" font-size="20" fill="${escapeXml(tc.muted)}">${slideIndex + 1} / 5</text>` +
    `</svg>`
  );
  composites.push({ input: ctrSvg, left: W - PAD - 180, top: 48 });

  // Number badge (points)
  if (num && tplId !== 'T3') {
    const numSvg = Buffer.from(
      `<svg width="200" height="80">` +
      `<text x="0" y="64" font-family="Arial Black,Arial,sans-serif" font-size="64" font-weight="900" fill="${escapeXml(tc.accent)}">${escapeXml(num)}</text>` +
      `</svg>`
    );
    composites.push({ input: numSvg, left: tc.barLeft ? PAD + 20 : PAD, top: 100 });
  }
  if (num && tplId === 'T3') {
    const numSvg = Buffer.from(
      `<svg width="200" height="80">` +
      `<text x="0" y="64" font-family="Arial Black,Arial,sans-serif" font-size="56" font-weight="900" fill="${escapeXml(tc.accent)}">${escapeXml(num)}</text>` +
      `</svg>`
    );
    composites.push({ input: numSvg, left: PAD, top: 100 });
  }

  // Title
  if (title) {
    const fs       = slideType === 'hook' ? 84 : (tplId === 'T3' ? 76 : 68);
    const maxW     = W - PAD * 2 - (tc.barLeft ? 20 : 0);
    const titleLines = wrapText(title, Math.floor(maxW / (fs * (tc.uppercase ? 0.62 : 0.52)))).slice(0, 3);
    const lineH    = fs + 14;
    const titleH   = titleLines.length * lineH;
    const titleSvg = Buffer.from(
      `<svg width="${maxW}" height="${titleH + 20}">` +
      titleLines.map((l, j) =>
        `<text x="0" y="${fs + j * lineH}" font-family="${tplId === 'T5' ? 'Georgia,serif' : 'Arial Black,Arial,sans-serif'}" font-size="${fs}" font-weight="900" fill="${escapeXml(tc.text)}">${escapeXml(l)}</text>`
      ).join('') +
      `</svg>`
    );
    const titleLeft = tc.barLeft ? PAD + 24 : PAD;
    const titleTop  = slideType === 'hook' ? 180 : (num ? 210 : 160);
    composites.push({ input: titleSvg, left: titleLeft, top: titleTop });

    // Body text (below title)
    if (body) {
      const bodyLines = wrapText(body, Math.floor(maxW / 19)).slice(0, 4);
      const bodySvg = Buffer.from(
        `<svg width="${maxW}" height="${bodyLines.length * 52 + 20}">` +
        bodyLines.map((l, j) =>
          `<text x="0" y="${40 + j * 52}" font-family="Arial,sans-serif" font-size="33" font-weight="400" fill="${escapeXml(tc.muted)}">${escapeXml(l)}</text>`
        ).join('') +
        `</svg>`
      );
      const bodyLeft = titleLeft;
      const bodyTop  = titleTop + titleH + (slideType === 'hook' ? 36 : 28);
      composites.push({ input: bodySvg, left: bodyLeft, top: bodyTop });
    }
  }

  // Stat block (points)
  if (stat) {
    const statSvg = Buffer.from(
      `<svg width="${W - PAD * 2}" height="180">` +
      `<text x="0" y="120" font-family="Arial Black,Arial,sans-serif" font-size="108" font-weight="900" fill="${escapeXml(tc.accent)}">${escapeXml(stat)}</text>` +
      (statLab ? `<text x="0" y="158" font-family="Arial,sans-serif" font-size="28" fill="${escapeXml(tc.muted)}">${escapeXml(statLab)}</text>` : '') +
      `</svg>`
    );
    composites.push({ input: statSvg, left: tc.barLeft ? PAD + 24 : PAD, top: H - 350 });
  }

  // CTA accent (slide 4)
  if (slideType === 'cta') {
    const lineSvg = Buffer.from(
      `<svg width="80" height="6"><rect width="80" height="4" rx="2" fill="${escapeXml(tc.accent)}"/></svg>`
    );
    composites.push({ input: lineSvg, left: PAD, top: 155 });
  }

  // Handle (bottom left)
  const handleSvg = Buffer.from(
    `<svg width="400" height="40">` +
    `<text x="0" y="28" font-family="Arial,sans-serif" font-size="22" fill="${escapeXml(tc.muted)}">${escapeXml(brand.handle || '@compte')}</text>` +
    `</svg>`
  );
  composites.push({ input: handleSvg, left: tc.barLeft ? PAD + 24 : PAD, top: H - 72 });

  // Progress bar
  const prog = Math.round(((slideIndex + 1) / 5) * (W - PAD * 2));
  const progSvg = Buffer.from(
    `<svg width="${W}" height="8">` +
    `<rect width="${W - PAD * 2}" height="2" x="${PAD}" y="3" fill="rgba(128,128,128,0.2)" rx="1"/>` +
    `<rect width="${prog}" height="2" x="${PAD}" y="3" fill="${escapeXml(tc.accent)}" rx="1"/>` +
    `</svg>`
  );
  composites.push({ input: progSvg, left: 0, top: H - 24 });

  return sharp(base).composite(composites).jpeg({ quality: 90 }).toBuffer();
}

// ─── POST /api/generate/deepdive ─────────────────────────────────────────────
router.post('/deepdive', async (req, res) => {
  if (!sharp) return res.status(500).json({ error: 'Sharp non installe' });

  const { topic, userId, clientId, imageMode = 'none', templateId } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic manquant' });

  try {
    const client = await getClientBrand(userId, clientId);
    const brand  = buildDeepDiveBrand(client);

    // 1. Template auto-selection
    const tplId = templateId || TONE_TO_TEMPLATE[brand.tone] || 'T2';

    // 2. Claude orchestration — structured JSON content
    const userMsg = JSON.stringify({ topic, brand, template_id: tplId, image_mode: imageMode, language: 'fr' });
    const aiResp  = await haiku.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 3000,
      system:     DEEP_DIVE_SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userMsg }],
    });
    const rawJson = aiResp.content.find(b => b.type === 'text')?.text || '';
    let carousel;
    try { carousel = parseAIJson(rawJson); } catch (_) { throw new Error('Claude JSON invalide'); }

    const { meta = {}, content = {}, slides: slideSpecs = [] } = carousel;
    if (!slideSpecs.length) throw new Error('Aucun slide dans la réponse Claude');

    // Use effective template (Claude may override)
    const effectiveTpl = meta.template_id || tplId;

    // 3. Resolve images in parallel (if imageMode !== 'none')
    const imgBuffers = new Array(5).fill(null);
    if (imageMode !== 'none') {
      await Promise.all(slideSpecs.map(async (spec) => {
        // CTA slide never gets an image
        if (spec.index === 4) return;
        // For serp-only mode: override any spec that has an image (or add one for first 3 slides)
        if (imageMode === 'serp') {
          const query = spec.image?.search_query || content.points?.[spec.index - 1]?.title || content.topic || 'news';
          const buf = await resolveSlideImage({ index: spec.index, image: { mode: 'serp', search_query: query } });
          if (buf) imgBuffers[spec.index] = buf;
          return;
        }
        if (!spec.image) return;
        const buf = await resolveSlideImage(spec);
        if (buf) imgBuffers[spec.index] = buf;
      }));
    }

    // 4. Render 5 slides (parallel)
    const SLIDE_TYPES = ['hook', 'point', 'point', 'point', 'cta'];
    const slideBuffers = await Promise.all(
      Array.from({ length: 5 }, (_, i) => {
        const spec     = slideSpecs.find(s => s.index === i) || { index:i, type: SLIDE_TYPES[i], variant:'A' };
        const imgBuf   = imgBuffers[i];
        return renderDeepDiveSlide(effectiveTpl, i, spec.type || SLIDE_TYPES[i], imgBuf ? 'B' : (spec.variant || 'A'), brand, content, imgBuf);
      })
    );

    // 5. Caption (from Claude or fallback)
    const caption = carousel.caption || await generateCaption('deepdive', { topic, hookTitle: content.topic, hookBody: content.subtitle }, client).catch(() => '');

    const images = slideBuffers.map(b => 'data:image/jpeg;base64,' + b.toString('base64'));
    res.json({ images, content, meta: { ...meta, template_id: effectiveTpl }, caption, hashtags: carousel.hashtags || [] });

  } catch (err) {
    console.error('[Generate/DeepDive]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/generate/detect-format ────────────────────────────────────────
router.post('/detect-format', async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text manquant' });

  try {
    const response = await haiku.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 250,
      messages: [{
        role:    'user',
        content:
          'Tu es un router de format pour un outil de posts Instagram. ' +
          'Lis ce texte et choisis : actu (info/breaking), citation (phrase forte avec auteur), deepdive (sujet à approfondir).\n' +
          'Texte : "' + text.slice(0, 600) + '"\n\n' +
          'Retourne UNIQUEMENT ce JSON valide :\n' +
          '{"format":"actu|citation|deepdive",' +
          '"newsText":"si actu : reformule en actu directe max 120 car, sinon null",' +
          '"quoteText":"si citation : extrait EXACTEMENT la citation entre guillemets, sinon null",' +
          '"authorName":"si citation : Prénom Nom de l\'auteur, sinon null",' +
          '"topic":"si deepdive : le sujet en une phrase courte, sinon null"}',
      }],
    });

    const raw = response.content.find(b => b.type === 'text')?.text || '';
    res.json(parseAIJson(raw));
  } catch (err) {
    console.error('[DetectFormat]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Brand Identity Generation (onboarding Step 3B) ──────────────────────────
router.post('/brand-identity', async (req, res) => {
  try {
    const { name, topics, styleWords, colorUniverse, typographyFeel } = req.body;
    if (!name) return res.status(400).json({ error: 'name requis' });

    const isDark  = colorUniverse !== 'light';
    const isPunchy = typographyFeel === 'punchy';
    const bgDesc  = isDark ? 'dark background (#080814) with white text' : 'light background (#F0F0EB) with dark text';
    const typoDesc = isPunchy ? 'bold condensed display typography (Bebas Neue style, uppercase)' : 'clean modern sans-serif (DM Sans style, mixed case)';

    const prompt = `Create a complete brand identity style guide for a French digital media brand called "${name}".

Topics covered: ${(topics || []).join(', ') || 'general news'}
Style keywords: ${(styleWords || []).join(', ') || 'modern, premium'}
Color universe: ${bgDesc}
Typography feel: ${typoDesc}

The style guide must include:
1. A bold logo mark — letter-based (first letter of "${name}" stylized) or a clean abstract symbol
2. The brand name "${name}" set in the chosen typography
3. A color palette of 4 colors with large visible hex codes (#XXXXXX format)
4. Two example Instagram post mockups (1:1 square frames) showing the visual style in use
5. Typography hierarchy: headline font name + body font name

Visual requirements:
- ${bgDesc}
- The brand must look like a premium French editorial media brand
- Aesthetic references: ${(styleWords || ['modern', 'premium']).join(' + ')}
- Editorial, credible, contemporary — not corporate or generic
- Include the brand name "${name}" on the posts, never lorem ipsum

Format: professional brand style guide sheet, ${isDark ? 'dark' : 'light'} background, all elements clearly separated.`;

    const response = await openaiClient.images.generate({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
    });

    const imgData = response.data[0];
    const imageUrl = imgData.url
      ? imgData.url
      : imgData.b64_json
        ? 'data:image/png;base64,' + imgData.b64_json
        : null;

    if (!imageUrl) throw new Error('Aucune image retournée par GPT-Image');
    res.json({ ok: true, imageUrl });
  } catch (err) {
    console.error('[brand-identity]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
