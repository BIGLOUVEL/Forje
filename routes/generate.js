const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI         = require('openai');
const { toFile }     = require('openai');
const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const { URL } = require('url');

const Anthropic = require('@anthropic-ai/sdk');
const { track } = require('../lib/costTracker');

const router = express.Router();
const genai  = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
// Alias auto-mis-à-jour par Google — évite les 404 quand un modèle daté est retiré
// (gemini-2.5-pro a été retiré de l'inférence en juillet 2026)
// Flash-Lite : le seul usage de gemini() est le brief actu (petit JSON de
// 5 champs) — mesuré à 1,7s contre 14,5s en pro-latest, qualité équivalente.
const GEMINI_MODEL = 'gemini-flash-lite-latest';
let openaiClient;
try { openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); } catch (_) {}
const haiku = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const { supabase }  = require('../lib/supabase');
const { buildFontDefs, resolveFont } = require('../lib/fontLoader');
const { getCreditCost } = require('../lib/credits');

// ─── Crédits ──────────────────────────────────────────────────────────────────
// Consomme des crédits de façon ATOMIQUE avant une génération (RPC consume_credits).
// - clientId absent (dev / anonyme) ou erreur infra → on laisse passer (charged:false).
// - solde insuffisant → { ok:false } → la route renvoie 402.
async function chargeCredits(clientId, postType, variant) {
  const cost = getCreditCost(postType, variant);
  if (!clientId) return { ok: true, cost, charged: false };
  const { data, error } = await supabase.rpc('consume_credits', {
    p_client_id: clientId, p_amount: cost, p_post_id: null,
    p_post_type: postType, p_variant: variant,
  });
  if (error) { console.error('[Credits] consume:', error.message); return { ok: true, cost, charged: false }; }
  if (data === -1) return { ok: false, cost, charged: false };
  return { ok: true, cost, balance: data, charged: true };
}

// Rembourse des crédits déjà consommés (échec de génération après débit).
async function refundCredits(ctx) {
  if (!ctx || !ctx.charged) return;
  try {
    await supabase.rpc('consume_credits', {
      p_client_id: ctx.clientId, p_amount: -ctx.cost, p_post_id: null,
      p_post_type: ctx.postType, p_variant: 'refund',
    });
  } catch (e) { console.error('[Credits] refund:', e.message); }
}

function insufficientCredits(res, cost) {
  return res.status(402).json({
    error: 'Crédits insuffisants',
    message: `Cette génération nécessite ${cost} crédit${cost > 1 ? 's' : ''}. Ton solde est épuisé pour ce mois.`,
    creditsNeeded: cost,
  });
}

async function gemini(prompt) {
  const model  = genai.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ─── Détourage "logo nu" — 100% algorithmique, AUCUN modèle génératif ─────────
// Un modèle image→image peut réinventer le logo ou son fond : interdit ici.
// Le fond est identifié par sa couleur dominante et retiré par croissance de
// région connectée (flood-fill), avec bord adouci. Déterministe et fidèle.

function _colorDist2(r, g, b, ref) {
  const dr = r - ref.r, dg = g - ref.g, db = b - ref.b;
  return dr * dr + dg * dg + db * db;
}

// Retire UNE couche de fond connectée aux seeds.
// mode 'border'   : fond extérieur (seeds = bord de l'image)
// mode 'boundary' : fond du badge (seeds = pixels opaques au contact de la transparence)
// Retourne le nombre de pixels retirés.
function removeConnectedBackground(data, W, H, mode) {
  const S = 4, N = W * H;
  const alphaAt = (p) => data[p * S + 3];

  const seeds = [];
  if (mode === 'border') {
    for (let x = 0; x < W; x++) { seeds.push(x, (H - 1) * W + x); }
    for (let y = 0; y < H; y++) { seeds.push(y * W, y * W + W - 1); }
  } else {
    for (let p = 0; p < N; p++) {
      if (alphaAt(p) < 16) continue;
      const x = p % W, y = (p / W) | 0;
      if ((x > 0 && alphaAt(p - 1) < 16) || (x < W - 1 && alphaAt(p + 1) < 16) ||
          (y > 0 && alphaAt(p - W) < 16) || (y < H - 1 && alphaAt(p + W) < 16)) seeds.push(p);
    }
  }

  // Couleur dominante des seeds opaques (histogramme quantifié /24) = le fond
  const buckets = new Map();
  for (const p of seeds) {
    if (alphaAt(p) < 16) continue;
    const i = p * S;
    const key = ((data[i] / 24) | 0) * 10000 + ((data[i + 1] / 24) | 0) * 100 + ((data[i + 2] / 24) | 0);
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2];
    buckets.set(key, b);
  }
  let bg = null, best = 0;
  for (const b of buckets.values()) if (b.n > best) { best = b.n; bg = { r: b.r / b.n, g: b.g / b.n, b: b.b / b.n }; }
  if (!bg) return 0;

  // Pelage du badge : uniquement si cette couleur est vraiment un FOND
  // (assez présente pour être un aplat, pas assez pour être tout le logo)
  if (mode === 'boundary') {
    let close = 0, opaque = 0;
    for (let p = 0; p < N; p++) {
      if (alphaAt(p) < 16) continue;
      opaque++;
      const i = p * S;
      if (_colorDist2(data[i], data[i + 1], data[i + 2], bg) < 90 * 90) close++;
    }
    if (!opaque || close / opaque < 0.18 || close / opaque > 0.97) return 0;
  }

  const HARD = 72 * 72;   // distance au fond → transparent
  const SOFT = 112 * 112; // zone de transition → alpha partiel (anti-halo)
  const visited = new Uint8Array(N);
  const queue = [];
  for (const p of seeds) { if (!visited[p]) { visited[p] = 1; queue.push(p); } }

  let removed = 0, head = 0;
  while (head < queue.length) {
    const p = queue[head++];
    const i = p * S;
    const a = data[i + 3];
    let pass = false;
    if (a < 16) {
      pass = true; // déjà transparent : on traverse pour atteindre le fond
    } else {
      const d2 = _colorDist2(data[i], data[i + 1], data[i + 2], bg);
      if (d2 < HARD) { data[i + 3] = 0; pass = true; removed++; }
      else if (d2 < SOFT) {
        // bord anti-aliasé : alpha proportionnel à l'éloignement du fond
        const t = (Math.sqrt(d2) - 72) / (112 - 72);
        data[i + 3] = Math.min(a, Math.round(255 * t));
        pass = true; removed++;
      }
    }
    if (!pass) continue;
    const x = p % W, y = (p / W) | 0;
    if (x > 0     && !visited[p - 1]) { visited[p - 1] = 1; queue.push(p - 1); }
    if (x < W - 1 && !visited[p + 1]) { visited[p + 1] = 1; queue.push(p + 1); }
    if (y > 0     && !visited[p - W]) { visited[p - W] = 1; queue.push(p - W); }
    if (y < H - 1 && !visited[p + W]) { visited[p + W] = 1; queue.push(p + W); }
  }
  return removed;
}

async function getClientBrand(userId, clientId) {
  if (!userId) return null;
  let q = supabase.from('clients').select(
    'id,name,logo_url,logo_badge_url,logo_nu_url,logo_style,brand_colors,font_primary,font_body,font_id,font_set,font_custom_url,font_is_custom,mood,graphic_style,tone_tags,topics,preferred_format,style_ref_url,style_ref_urls,strategy'
  ).eq('user_id', userId);
  if (clientId) q = q.eq('id', clientId);
  const { data } = await q.order('created_at').limit(1).maybeSingle();
  if (data) {
    // Mémoire éditoriale : injectée dans tous les prompts via buildBrandContext,
    // buildDeepDivePlanPrompt et generateCaption.
    data.editorial_rules = await require('../lib/editorialRules').fetchEditorialRules(data.id);
  }
  return data || null;
}

// Variante de logo à composer sur les posts, selon le choix du client :
// logo_style = 'badge' (avec fond) | 'logo_nu' (détouré) | 'none' (masqué).
// Fallback sur logo_url (colonne legacy) pour les clients d'avant les variantes.
function pickLogoUrl(client) {
  if (!client) return null;
  const style = client.logo_style || 'badge';
  if (style === 'none') return null;
  if (style === 'logo_nu') return client.logo_nu_url || client.logo_url || null;
  return client.logo_badge_url || client.logo_url || null;
}

// Refs visuelles actives (max 3) — nouvelle colonne tableau, fallback legacy
function pickStyleRefUrls(client) {
  if (!client) return [];
  if (Array.isArray(client.style_ref_urls) && client.style_ref_urls.length) {
    return client.style_ref_urls.filter(Boolean).slice(0, 3);
  }
  return client.style_ref_url ? [client.style_ref_url] : [];
}

function buildBrandContext(client) {
  if (!client) return '';
  const parts = [];
  if (client.name)          parts.push('MEDIA : ' + client.name);
  if (client.mood)          parts.push('Mood visuel : ' + client.mood);
  if (client.graphic_style) parts.push('Style graphique : ' + client.graphic_style);
  if (client.brand_colors?.length) parts.push('Palette : principale ' + client.brand_colors[0] + ', accent ' + client.brand_colors[1]);
  if (client.font_primary)  parts.push('Police de titre : ' + client.font_primary);
  if (client.font_body)     parts.push('Police de texte : ' + client.font_body);
  if (client.tone_tags?.length)  parts.push('Ton editorial : ' + client.tone_tags.join(', '));
  if (client.topics?.length)     parts.push('Sujets couverts : ' + client.topics.join(', '));
  const rules = require('../lib/editorialRules').editorialRulesLine(client);
  return (parts.length ? '\n\nCONTEXTE DU MEDIA :\n' + parts.join('\n') : '') + rules;
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

const WATERMARK_DOMAINS = ['shutterstock.com', 'gettyimages.', 'istockphoto.com', 'alamy.com', 'dreamstime.com', 'depositphotos.com', '123rf.com', 'bigstockphoto.com'];

async function serperImages(query, { hq = false } = {}) {
  const payload = hq
    ? { q: query + ' -watermark -shutterstock -getty', num: 12, imageSize: 'large', imageType: 'photo' }
    : { q: query, num: 5 };
  const body = JSON.stringify(payload);
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
        try {
          let imgs = JSON.parse(raw).images || [];
          if (hq) imgs = imgs.filter(img => !WATERMARK_DOMAINS.some(d => (img.imageUrl || '').includes(d)));
          resolve(imgs);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function isImageBuffer(buf) {
  if (!buf || buf.length < 12) return false;
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8) return true;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50) return true;
  // WEBP: 52 49 46 46 ... 57 45 42 50
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45) return true;
  // GIF: 47 49 46
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
  // AVIF / HEIC : boîte "ftyp" à l'offset 4 (formats de plus en plus fréquents sur Google Images)
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') return true;
  return false;
}

// Vérifie qu'une image est réellement exploitable : décodable, assez grande,
// et NI trop sombre NI trop uniforme (évite les fonds noirs / placeholders vides).
async function isUsablePhoto(buf) {
  if (!buf || !sharp) return false;
  try {
    const img  = sharp(buf, { failOn: 'none' });
    const meta = await img.metadata();
    if (!meta.width || !meta.height || meta.width < 400 || meta.height < 400) return false;
    const stats = await img.stats();
    const ch = stats.channels || [];
    if (ch.length >= 3) {
      const lum = 0.299 * ch[0].mean + 0.587 * ch[1].mean + 0.114 * ch[2].mean;
      if (lum < 24) return false; // quasi-noir → rejeté
      const sd = (ch[0].stdev + ch[1].stdev + ch[2].stdev) / 3;
      if (sd < 7) return false;   // image plate / placeholder uni → rejeté
    }
    return true;
  } catch (_) { return false; }
}

// Filtre une liste de buffers pour ne garder que les photos exploitables (ordre préservé).
async function keepUsablePhotos(buffers) {
  const checks = await Promise.all(buffers.map(b => isUsablePhoto(b)));
  return buffers.filter((_, i) => checks[i]);
}

// Fond de secours "de marque" — dégradé diagonal aux couleurs du client
// (jamais un aplat noir : un post sans photo doit rester intentionnel).
function brandGradientBuffer(W, H, primary, accent) {
  const c1 = primary || '#1a1a2e';
  const c2 = accent  || '#6366F1';
  return Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>` +
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="${c1}"/>` +
    `<stop offset="100%" stop-color="${c2}"/>` +
    `</linearGradient>` +
    `<radialGradient id="gl" cx="30%" cy="25%" r="80%">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.12"/>` +
    `<stop offset="60%" stop-color="#ffffff" stop-opacity="0"/>` +
    `</radialGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#gl)"/>` +
    `</svg>`
  );
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

// Supprime les pixels à dominante verte (chroma key lime) — détection relative,
// robuste aux variations de teinte que Gemini peut introduire.
async function removeChromaKey(pngBuffer) {
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    if (g > 80 && g > r * 1.4 && g > b * 1.4) data[i+3] = 0;
  }
  return sharp(Buffer.from(data), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// Flood-fill depuis les pixels transparents du bord — retire le ring sombre adjacent.
// S'arrête dès qu'un pixel est trop lumineux (badge coloré) → ne touche pas au contenu.
async function removeRingFromTransparent(pngBuffer, brightnessThreshold = 45) {
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, S = 4;
  const visited = new Uint8Array(W * H);
  const queue = [];
  // Seed : tous les pixels de bord déjà transparents
  for (let x = 0; x < W; x++) {
    for (const y of [0, H - 1]) {
      const px = y * W + x;
      if (data[px * S + 3] === 0 && !visited[px]) { visited[px] = 1; queue.push(px); }
    }
  }
  for (let y = 1; y < H - 1; y++) {
    for (const x of [0, W - 1]) {
      const px = y * W + x;
      if (data[px * S + 3] === 0 && !visited[px]) { visited[px] = 1; queue.push(px); }
    }
  }
  let head = 0;
  while (head < queue.length) {
    const px = queue[head++];
    const x = px % W, y = (px / W) | 0;
    const ns = [];
    if (x > 0) ns.push(px - 1); if (x < W - 1) ns.push(px + 1);
    if (y > 0) ns.push(px - W); if (y < H - 1) ns.push(px + W);
    for (const n of ns) {
      if (visited[n]) continue;
      visited[n] = 1;
      const ni = n * S;
      if (data[ni + 3] === 0) {
        queue.push(n); // pixel déjà transparent, on propage
      } else {
        const brightness = (data[ni] + data[ni + 1] + data[ni + 2]) / 3;
        if (brightness < brightnessThreshold) { data[ni + 3] = 0; queue.push(n); }
      }
    }
  }
  return sharp(Buffer.from(data), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

// Supprime les pixels blancs/clairs d'un PNG (fond généré par GPT Image qui ignore "transparent")
async function removeWhiteBackground(pngBuffer, tolerance = 235) {
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > tolerance && data[i+1] > tolerance && data[i+2] > tolerance) data[i+3] = 0;
  }
  return sharp(Buffer.from(data), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// Flood-fill depuis les 4 coins — supprime uniquement le fond extérieur connecté au bord.
// Contrairement à removeBackground global, préserve les pixels identiques au fond
// qui sont à l'intérieur du logo (ex : lettres blanches dans un badge bleu).
async function removeBackground(pngBuffer, tolerance = 40) {
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, S = 4;
  const bgR = data[0], bgG = data[1], bgB = data[2];

  const visited = new Uint8Array(W * H);
  // BFS depuis les 4 coins
  const queue = [0, W - 1, (H - 1) * W, (H - 1) * W + W - 1];
  for (const px of queue) visited[px] = 1;

  let head = 0;
  while (head < queue.length) {
    const px = queue[head++];
    const i  = px * S;
    if (Math.abs(data[i]-bgR) < tolerance && Math.abs(data[i+1]-bgG) < tolerance && Math.abs(data[i+2]-bgB) < tolerance) {
      data[i+3] = 0;
      const x = px % W, y = (px / W) | 0;
      if (x > 0     && !visited[px-1])   { visited[px-1] = 1;   queue.push(px-1); }
      if (x < W - 1 && !visited[px+1])   { visited[px+1] = 1;   queue.push(px+1); }
      if (y > 0     && !visited[px-W])   { visited[px-W] = 1;   queue.push(px-W); }
      if (y < H - 1 && !visited[px+W])   { visited[px+W] = 1;   queue.push(px+W); }
    }
  }
  return sharp(Buffer.from(data), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

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
const FONT_TO_PACK_SRV = {
  'Bebas Neue':'impact-news', 'Oswald':'impact-news', 'Anton':'impact-news', 'Barlow Condensed':'impact-news', 'Unbounded':'impact-news',
  'Playfair Display':'edito-luxe', 'Fraunces':'edito-luxe',
  'Space Grotesk':'digital-native',
  'Syne':'minimal-power',
  'DM Serif Display':'neo-retro',
};
function getPackId(graphicStyle, fontPrimary) {
  if (fontPrimary && FONT_TO_PACK_SRV[fontPrimary]) return FONT_TO_PACK_SRV[fontPrimary];
  return STYLE_TO_PACK_SRV[graphicStyle] || graphicStyle || 'impact-news';
}
function getPack(graphicStyle, fontPrimary) {
  const id = getPackId(graphicStyle, fontPrimary);
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

async function generateImageGPT(prompt, styleRefBuffers = null, referenceBuffers = []) {
  if (!openaiClient) throw new Error('OpenAI client not initialized');
  let finalPrompt = prompt;

  // Analyser les images Serper et injecter la description du sujet dans le prompt
  if (referenceBuffers.length > 0) {
    const refDesc = await describeReferenceImages(referenceBuffers);
    if (refDesc) {
      finalPrompt = finalPrompt + ` Subject visual reference (depict this subject accurately): ${refDesc}`;
    }
  }

  // Injecter les styles de référence utilisateur (1 à 3 refs, descripteurs fusionnés)
  const styleBufs = Array.isArray(styleRefBuffers)
    ? styleRefBuffers.filter(Boolean)
    : (styleRefBuffers ? [styleRefBuffers] : []);
  if (styleBufs.length) {
    const descs = (await Promise.all(styleBufs.slice(0, 3).map(b => extractStyleDescriptors(b)))).filter(Boolean);
    if (descs.length) {
      finalPrompt = finalPrompt + ` Visual style (aesthetic only, not content): ${descs.join(' ')}`;
    }
  }

  // Passer les images Serper directement à images.edit pour la meilleure fidélité au sujet
  if (referenceBuffers.length > 0) {
    try {
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
  const rules  = require('../lib/editorialRules').editorialRulesLine(client);

  const subjectMap = {
    actu:     `Actualité : "${content.newsText}"\nTitre visuel : ${content.title} — ${content.subtitle}`,
    citation: `Citation : "${content.quoteText}"\nPar : ${content.authorName}${content.authorTitle ? ', ' + content.authorTitle : ''}`,
    deepdive: `Sujet du carousel : "${content.topic}"\nAccroche slide 1 : ${content.hookTitle} — ${content.hookBody}`,
  };

  const prompt =
    `Tu rédiges la description Instagram${media ? ' pour ' + media : ''}.\n` +
    tone + topics + (rules ? rules + '\n' : '') + '\n' +
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
  track({ feature: 'caption_actu', model: 'claude-haiku-4-5-20251001', inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens });
  return response.content.find(b => b.type === 'text')?.text?.trim() || '';
}

// ─── Pipeline actu réutilisable ───────────────────────────────────────────────
// Utilisé par la route standard ET par la démo publique de la landing
// (routes/demo.js) avec une config client hardcodée. Champs supplémentaires
// acceptés sur `client` : logo_local_path (fichier disque au lieu de logo_url).
// `watermark` : texte discret composé en haut à gauche du fond (démo publique).
async function runActuPipeline(client, {
  newsText, photoUrl, photoData, imageMode = 'classic', styleRefData, watermark = null,
} = {}) {
  if (!sharp) throw new Error('Sharp non installe (npm install sharp)');
  if (!newsText) throw new Error('newsText manquant');

  const brandCtx     = buildBrandContext(client);
  const packId       = getPackId(client?.graphic_style, client?.font_primary);
  const clientFont   = resolveFont(client); // police effective (bibliothèque ou custom)
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
    const isGooglePhoto = imageMode !== 'ai';
    const images = await serperImages(search_query, { hq: true }); // toujours HQ — qualité + filtres anti-watermark
    const urls   = images.map(img => img.imageUrl).filter(Boolean).slice(0, isGooglePhoto ? 8 : 3);
    // Deadline dure 5s par photo : Promise.all attend la PLUS LENTE, et une
    // seule image lourde sur un CDN lent tenait tout le pipeline (28s mesurés —
    // le timeout de downloadBuffer est un timeout d'inactivité, un flux lent
    // mais continu ne le déclenche jamais). 7/8 photos arrivent en <3,5s.
    const results = await Promise.all(urls.map(u => Promise.race([
      downloadBuffer(u),
      new Promise(resolve => setTimeout(() => resolve(null), 5000)),
    ]).catch(() => null)));
    const sane = results
      .filter(b => b && b.length > 5000 && isImageBuffer(b))
      .sort((a, b) => isGooglePhoto ? b.length - a.length : 0);
    // Rejette les images non décodables / trop sombres / vides (cause des "fonds noirs")
    serperBuffers = await keepUsablePhotos(sane);
    if (!serperBuffers.length) console.warn('[Actu] aucune photo Serper exploitable → dégradé de marque');
  }
  // 3. Style refs : one-shot (request) > persistantes (brand, jusqu'à 3 fusionnées)
  let styleRefBuffers = [];
  if (styleRefData) {
    const b64 = styleRefData.split(',')[1] || styleRefData;
    if (b64) styleRefBuffers.push(Buffer.from(b64, 'base64'));
  } else {
    const refUrls = pickStyleRefUrls(client);
    styleRefBuffers = (await Promise.all(refUrls.map(u => downloadBuffer(u).catch(() => null)))).filter(Boolean);
  }

  // 4. Image : AI mode ou classic
  let photoBuffer = null;
  if (imageMode === 'ai' && visual_brief) {
    const prompt = buildImagePrompt(brief, client);
    try {
      photoBuffer = await withTimeout(generateImageGPT(prompt, styleRefBuffers, serperBuffers), 90000, 'GPT-Image-1');
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
      base = await sharp(photoBuffer, { failOn: 'none' }).resize(W, H, { fit: 'cover', position: 'center' }).toBuffer();
    } catch (_) {
      photoBuffer = null;
    }
  }
  if (!base) {
    // Pas de photo exploitable → dégradé aux couleurs de la marque (jamais un aplat noir)
    base = await sharp(brandGradientBuffer(W, H, primaryColor, accentColor)).png().toBuffer();
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

  // Logo : fichier local (presets démo) ou variante choisie (badge/nu/masqué)
  let logoBuf = null;
  const activeLogoUrl = pickLogoUrl(client);
  if (client?.logo_local_path) {
    try { logoBuf = fs.readFileSync(client.logo_local_path); } catch (_) { /* logo optionnel */ }
  }
  if (!logoBuf && activeLogoUrl) {
    try { logoBuf = await downloadBuffer(activeLogoUrl); } catch (_) { /* logo optionnel */ }
  }
  if (logoBuf) {
    try {
      // removeBackground (coins) et non removeWhiteBackground (global) :
      // le logo peut avoir des lettres blanches — on supprime uniquement la couleur de fond détectée aux coins
      const logoPng = await sharp(logoBuf)
        .resize(null, 260, { fit: 'inside' })
        .png()
        .toBuffer();

      const logoMeta = await sharp(logoPng).metadata();
      const logoX = W - logoMeta.width - 40;
      const logoY = 36;

      // Ombre portée : copie noire floutée décalée
      const shadow = await sharp(logoPng)
        .modulate({ brightness: 0 })
        .blur(20)
        .toBuffer();

      composites.push({ input: shadow, top: logoY + 12, left: logoX + 6 });
      composites.push({ input: logoPng, top: logoY, left: logoX });
    } catch (_) { /* logo optionnel */ }
  }

  // Watermark discret (démo publique) — haut gauche, sous le logo éventuel
  if (watermark) {
    const wmSvg = Buffer.from(
      `<svg width="620" height="56" xmlns="http://www.w3.org/2000/svg">` +
      `<text x="0" y="36" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="600" ` +
      `fill="#ffffff" fill-opacity="0.48">${escapeXml(watermark)}</text>` +
      `</svg>`
    );
    composites.push({ input: wmSvg, left: 44, top: 40 });
  }

  const out = await sharp(base)
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer();

  const caption = await captionPromise;

  // Aucune photo exploitable → on a rendu le dégradé de marque : invite à ajouter une image
  const photoFallback = !photoBuffer;
  const notice = photoFallback
    ? 'Aucune photo pertinente trouvée — ajoute ta propre image pour un rendu plus fort.'
    : null;

  // Return background + text data — client Canvas renders the text with real fonts
  return {
    bgImage: 'data:image/jpeg;base64,' + out.toString('base64'),
    title, subtitle, category, packId,
    photoFallback, notice,
    // Police effective du client → le Canvas front charge CETTE police (effectivité)
    font: {
      name:          clientFont.fontName,
      url:           clientFont.urlPath,
      weight:        clientFont.weight,
      style:         clientFont.style,
      transform:     clientFont.transform,
      letterSpacing: clientFont.letterSpacing,
    },
    primaryColor: primaryColor || BADGE_COLORS[category] || '#6366F1',
    accentColor:  accentColor  || '#10B981',
    caption,
  };
}

// ─── POST /api/generate/actu ──────────────────────────────────────────────────
router.post('/actu', async (req, res) => {
  let creditCtx = null; // { clientId, postType, cost, charged } — pour remboursement si échec
  const hardDeadline = setTimeout(() => {
    if (!res.headersSent) res.status(504).json({ error: 'Génération trop longue — réessaie (les serveurs IA sont lents en ce moment)' });
    refundCredits(creditCtx); creditCtx = null; // timeout = pas de post livré → rembourse
  }, 180000);

  if (!sharp) { clearTimeout(hardDeadline); return res.status(500).json({ error: 'Sharp non installe (npm install sharp)' }); }

  const { newsText, photoUrl, photoData, userId, clientId, imageMode = 'classic', styleRefData } = req.body;
  if (!newsText) { clearTimeout(hardDeadline); return res.status(400).json({ error: 'newsText manquant' }); }

  try {
    const client       = await getClientBrand(userId, clientId);

    // Crédits : débit atomique AVANT la génération coûteuse (IA + Serper)
    const creditClientId = client?.id || clientId || null;
    const charge = await chargeCredits(creditClientId, 'actu', 'standard');
    if (!charge.ok) { clearTimeout(hardDeadline); return insufficientCredits(res, charge.cost); }
    creditCtx = { clientId: creditClientId, postType: 'actu', cost: charge.cost, charged: charge.charged };

    const payload = await runActuPipeline(client, { newsText, photoUrl, photoData, imageMode, styleRefData });
    clearTimeout(hardDeadline);

    res.json({
      ...payload,
      creditsLeft: charge.charged ? charge.balance : undefined,
    });
    creditCtx = null; // post livré → surtout pas de remboursement

  } catch (err) {
    console.error('[Generate/Actu]', err.message);
    clearTimeout(hardDeadline);
    await refundCredits(creditCtx); creditCtx = null; // génération échouée → rembourse
    if (!res.headersSent) res.status(500).json({ error: err.message, refunded: true });
  }
});

// ─── Pipeline Citation réutilisable ──────────────────────────────────────────
// Utilisé par POST /api/generate/citation (avec crédits) ET par le tool
// generate_post de Blaise. Retourne le payload complet { bgImage, quoteText, … }.
async function runCitationPipeline(client, { quoteText, authorName, authorTitle, photoUrl, photoData } = {}) {
  if (!sharp) throw new Error('Sharp non installe');
  if (!quoteText || !authorName) throw new Error('quoteText et authorName requis');

  // Garde-fou : au-delà d'~6 lignes le post devient illisible (le form limite déjà à 200)
  const quote = String(quoteText).trim().slice(0, 220);

    // Police effective (bibliothèque ou custom) — le TEXTE est rendu côté client sur Canvas :
    // Sharp/librsvg ignore les @font-face base64 (rendu serif systématique quelle que soit la
    // police), donc on ne peut PAS composer le texte au serveur. Même approche que l'Actu.
    const clientFont = resolveFont(client);
    const accent     = client?.brand_colors?.[1] || '#FFFFFF';
    const W = 1080, H = 1350; // portrait 4:5 — cohérent avec Actu / Deep Dive

    const captionPromise = generateCaption('citation', { quoteText: quote, authorName, authorTitle }, client).catch(() => '');

    // ── 1. Photo de fond : override CM (photoData base64 > photoUrl) sinon Serper ──
    let photoBuffer = null;
    let photoUsed   = null;
    if (photoData) {
      const b64 = photoData.split(',')[1] || photoData;
      if (b64) photoBuffer = Buffer.from(b64, 'base64');
    } else if (photoUrl) {
      try { photoBuffer = await downloadBuffer(photoUrl); photoUsed = photoUrl; } catch (_) {}
    }
    if (!photoBuffer && process.env.SERPER_API_KEY) {
      const images  = await serperImages(authorName + ' portrait officiel');
      const urls    = images.map(i => i.imageUrl).filter(Boolean).slice(0, 6);
      // Télécharge plusieurs candidates et garde la première réellement exploitable
      const results = await Promise.all(urls.map((u, i) => downloadBuffer(u).then(b => ({ b, url: urls[i] })).catch(() => null)));
      const sane    = results.filter(r => r && r.b && r.b.length > 5000 && isImageBuffer(r.b));
      const usable  = await keepUsablePhotos(sane.map(r => r.b));
      if (usable.length) {
        photoBuffer = usable[0];
        photoUsed   = sane.find(r => r.b === usable[0])?.url || null;
      }
    }

    let base;
    if (photoBuffer) {
      try {
        // 'attention' cadre automatiquement sur le visage / zone d'intérêt
        base = await sharp(photoBuffer, { failOn: 'none' }).resize(W, H, { fit: 'cover', position: 'attention' }).toBuffer();
      } catch (_) { photoBuffer = null; }
    }
    if (!base) {
      // Pas de portrait exploitable → dégradé aux couleurs de la marque plutôt qu'un aplat noir
      base = await sharp(brandGradientBuffer(W, H, client?.brand_colors?.[0], client?.brand_colors?.[1])).png().toBuffer();
    }

    // ── 2. Vignettage 3 stops : haut sombre / milieu clair / bas très sombre ──
    const vignette = Buffer.from(
      `<svg width="${W}" height="${H}"><defs>` +
      `<radialGradient id="r" cx="50%" cy="38%" r="70%">` +
      `<stop offset="0%" stop-color="black" stop-opacity="0"/>` +
      `<stop offset="100%" stop-color="black" stop-opacity="0.55"/>` +
      `</radialGradient>` +
      `<linearGradient id="l" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="black" stop-opacity="0.55"/>` +
      `<stop offset="35%" stop-color="black" stop-opacity="0.30"/>` +
      `<stop offset="100%" stop-color="black" stop-opacity="0.90"/>` +
      `</linearGradient></defs>` +
      `<rect width="${W}" height="${H}" fill="url(#r)"/>` +
      `<rect width="${W}" height="${H}" fill="url(#l)"/>` +
      `</svg>`
    );

    // ── 3. Fond = photo + vignette + logo. Le texte (citation/auteur) est ajouté
    //        côté client sur Canvas avec la vraie police (voir renderCitationCanvas). ──
    const composites = [{ input: vignette }];

    // Logo du média (haut à droite) — variante badge/nu selon le choix client
    const citLogoUrl = pickLogoUrl(client);
    if (citLogoUrl) {
      try {
        const logoBuf  = await downloadBuffer(citLogoUrl);
        const logoPng  = await sharp(logoBuf).resize(null, 56, { fit: 'inside' }).png().toBuffer();
        const logoMeta = await sharp(logoPng).metadata();
        const logoX    = W - 56 - logoMeta.width;
        // Ombre douce pour lisibilité sur photo claire
        const shadow   = await sharp(logoPng).modulate({ brightness: 0 }).blur(12).toBuffer();
        composites.push({ input: shadow,  top: 62, left: logoX + 4 });
        composites.push({ input: logoPng, top: 56, left: logoX });
      } catch (_) { /* logo optionnel */ }
    }

    const bg = await sharp(base)
      .composite(composites)
      .jpeg({ quality: 92 })
      .toBuffer();

    const caption = await captionPromise;
    return {
      bgImage:     'data:image/jpeg;base64,' + bg.toString('base64'),
      quoteText:   quote,
      authorName,
      authorTitle: authorTitle || null,
      accentColor: accent,
      // Police effective du client → le Canvas front charge CETTE police (effectivité réelle)
      font: {
        name:          clientFont.fontName,
        url:           clientFont.urlPath,
        weight:        clientFont.weight,
        style:         clientFont.style,
        transform:     clientFont.transform,
        letterSpacing: clientFont.letterSpacing,
      },
      caption,
      photoUsed, // permet au CM de valider / changer la photo
    };
}

// ─── POST /api/generate/citation — wrapper fin (auth marque + crédits) ───────
router.post('/citation', async (req, res) => {
  if (!sharp) return res.status(500).json({ error: 'Sharp non installe' });

  // photoUrl / photoData : optionnels — le CM peut fournir sa propre photo au lieu de Serper
  const { quoteText, authorName, authorTitle, userId, clientId, photoUrl, photoData } = req.body;
  if (!quoteText || !authorName) return res.status(400).json({ error: 'quoteText et authorName requis' });

  let creditCtx = null;
  try {
    // clientId respecté → charte + police du client ACTIF (et non du premier client trouvé)
    const client = await getClientBrand(userId, clientId);

    // Crédits : débit atomique AVANT Serper + Sharp
    const creditClientId = client?.id || clientId || null;
    const charge = await chargeCredits(creditClientId, 'citation', 'standard');
    if (!charge.ok) return insufficientCredits(res, charge.cost);
    creditCtx = { clientId: creditClientId, postType: 'citation', cost: charge.cost, charged: charge.charged };

    const payload = await runCitationPipeline(client, { quoteText, authorName, authorTitle, photoUrl, photoData });
    res.json({
      ...payload,
      creditsLeft: charge.charged ? charge.balance : undefined,
    });
    creditCtx = null; // post livré → pas de remboursement

  } catch (err) {
    console.error('[Generate/Citation]', err.message);
    await refundCredits(creditCtx); creditCtx = null;
    res.status(500).json({ error: err.message, refunded: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DEEP DIVE v2 — carousel narratif 7-10 slides (format le plus sauvegardé IG)
// ---------------------------------------------------------------------------
// Architecture : le SERVEUR compose UNIQUEMENT le fond de chaque slide
// (photo + overlay/vignette selon le layout + logo). Le TEXTE (titre, body,
// stat, liste, CTA) est peint CÔTÉ CLIENT sur Canvas avec la VRAIE police du
// média — car librsvg (sous Sharp) ignore les @font-face base64 et rendrait
// un serif système. Même principe éprouvé que l'Actu et la Citation.
//   → renderDeepDiveSlideCanvas() dans app-screens.jsx fait le rendu texte.
// ═══════════════════════════════════════════════════════════════════════════
const { deepDiveVariant } = require('../lib/credits');

const DD_W = 1080, DD_H = 1350;
// Zone grid-safe : Instagram croppe en carré (1080×1080) sur la grille du profil
// → il coupe 135px en haut et 135px en bas. Le texte critique reste entre ces bornes.
const DD_SAFE_TOP = 135, DD_SAFE_BOTTOM = DD_H - 135;
const DD_LAYOUTS = ['full_impact', 'split_bottom', 'stat_focus', 'list_recap', 'cta_clean'];

// Layout par défaut selon le rôle narratif (si Claude renvoie un layout invalide)
function layoutForRole(role, hasStat) {
  if (role === 'hook' || role === 'climax') return hasStat ? 'stat_focus' : 'full_impact';
  if (role === 'recap') return 'list_recap';
  if (role === 'cta')   return 'cta_clean';
  return hasStat ? 'stat_focus' : 'split_bottom';
}

// ─── Prompt Claude — recherche web + plan narratif (le cerveau du Deep Dive) ──
function buildDeepDivePlanPrompt(topic, client, slideCount) {
  const name   = client?.name || 'le média';
  const tone   = client?.tone_tags?.join(', ') || 'direct, informatif';
  const mood   = client?.mood || 'factuel';
  const topics = client?.topics?.join(', ') || '';
  return `Tu es rédacteur en chef d'un média Instagram premium.
Tu construis un carousel "deep dive" pédagogique de ${slideCount} slides.

SUJET : "${topic}"

IDENTITÉ DU MÉDIA :
- Nom : ${name}
- Ton : ${tone}
- Mood : ${mood}
- Sujets habituels : ${topics}${require('../lib/editorialRules').editorialRulesLine(client)}${client?.strategy ? `

STRATÉGIE ÉDITORIALE (validée avec le client — cadre tes angles dessus) :
- Cible : ${client.strategy.target_audience || '—'}
- Piliers de contenu : ${(client.strategy.content_pillars || []).join(' · ') || '—'}${client.strategy.positioning ? `
- Positionnement : ${client.strategy.positioning}` : ''}
Rattache l'angle du carousel au pilier le plus pertinent et calibre le niveau
de vulgarisation sur la cible.` : ''}

NOTE — BRIEF STRUCTURÉ : si le SUJET ci-dessus contient déjà des lignes
"Angle :", "Hook suggéré :", "Faits clés :", "À creuser :", "Ton :" (brief issu
d'un article de veille), EXPLOITE-le :
- les "Faits clés" sont la matière première de tes slides de contenu (vérifie-les
  et enrichis-les via la recherche web) ;
- "À creuser" indique précisément ce que ta recherche web doit compléter ;
- "Hook suggéré" est une base pour le slide 1 — améliore-le si tu peux faire plus fort ;
- respecte l'"Angle" et le "Ton" indiqués.

ÉTAPE 1 — RECHERCHE (obligatoire) :
Utilise la recherche web pour trouver des FAITS RÉELS sur ce sujet : chiffres
précis, dates, noms, statistiques récentes, citations. Un deep dive média sans
facts vérifiables est un deep dive raté. 2 à 4 recherches maximum, cible les
infos les plus percutantes et les plus récentes.

ÉTAPE 2 — CONSTRUIS LE PLAN selon cet arc narratif STRICT :

Slide 1 — HOOK (role "hook", layout "full_impact")
  title : 5-8 mots MAXIMUM, le plus percutant. Pose une tension/question SANS la
  résoudre (open loop). Formules qui marchent : chiffre choc + mystère, question
  provocante, affirmation contre-intuitive.
  body : une seule phrase courte qui amplifie la curiosité. Aucune réponse ici.

Slide 2 — SETUP (role "setup", layout "split_bottom")
  Réduit le scepticisme, pose le contexte en 2 phrases max, promet implicitement
  ce que le lecteur va apprendre.

Slides 3 à ${slideCount - 3} — CONTENU (role "content")
  UNE idée par slide, jamais deux. Chaque slide donne un fait concret issu de ta
  recherche. body : 30 mots MAXIMUM (c'est une flashcard, pas un paragraphe).
  Progression logique. Quand un slide repose sur un CHIFFRE fort, mets ce chiffre
  dans "stat" (ex "87%", "1,2 Md€", "×3").
  RYTHME VISUEL (impératif) : ALTERNE les layouts entre "stat_focus" et
  "split_bottom" sur les slides de contenu. JAMAIS plus de 2 "stat_focus"
  d'affilée — même si plusieurs slides ont un chiffre, mets-en certaines en
  "split_bottom". IMPORTANT : sur un slide "split_bottom", le champ "stat" n'est
  PAS affiché → intègre alors le chiffre directement dans le "title" ou le "body".
  Le "stat" géant n'est montré que sur les slides "stat_focus".
  Le carousel doit respirer comme un magazine, pas enchaîner 4 fois le même écran.

Slide ${slideCount - 2} — CLIMAX (role "climax", layout "full_impact" ou "stat_focus")
  LA révélation : résout l'open loop du slide 1. Le fait le plus fort.

Slide ${slideCount - 1} — RÉCAP (role "recap", layout "list_recap")
  Résume les 3 points clés. Mets-les dans "body" séparés par " • " (ex
  "Point un • Point deux • Point trois"). C'est la slide qu'on screenshot.

Slide ${slideCount} — CTA (role "cta", layout "cta_clean")
  title court + body = appel à l'action : "Enregistre ce post pour plus tard" et
  "Suis ${name} pour d'autres analyses".

POUR CHAQUE SLIDE fournis aussi :
- "image_query" : requête Google Images EN ANGLAIS, 4-6 mots, pour trouver une
  vraie photo illustrant CETTE slide (personne, lieu, événement précis). Varie
  les sujets d'image — jamais deux fois la même requête.

ÉTAPE 3 — LA CAPTION Instagram : première ligne = hook autonome (visible avant
le "voir plus"), puis 3-4 lignes de contexte, puis "Enregistre ce post 📌".
Fournis aussi 5 hashtags pertinents dans "hashtags".

RETOURNE UNIQUEMENT CE JSON (aucun texte autour, pas de markdown) :
{
  "slides": [
    { "position":1, "role":"hook", "layout":"full_impact", "title":"...", "body":"...", "stat":null, "image_query":"..." }
  ],
  "caption":"...",
  "hashtags":["#...","#..."]
}`;
}

// ─── Claude : recherche web + plan (extrait le JSON du dernier bloc texte) ────
async function deepDivePlan(topic, client, slideCount) {
  const resp = await withTimeout(haiku.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 4500,
    tools:      [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
    messages:   [{ role: 'user', content: buildDeepDivePlanPrompt(topic, client, slideCount) }],
  }), 120000, 'DeepDive plan');
  track({ feature: 'deepdive_plan', model: 'claude-sonnet-4-6', inputTokens: resp.usage?.input_tokens, outputTokens: resp.usage?.output_tokens });
  const ddSearches = (resp.content || []).filter(b => b.type === 'server_tool_use').length;
  for (let s = 0; s < ddSearches; s++) track({ feature: 'deepdive_plan_search', model: 'web_search' });
  // Les blocs de recherche (server_tool_use / web_search_tool_result) précèdent le
  // texte final. On concatène tous les blocs texte puis on extrait le JSON.
  const raw = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  const plan = parseAIJson(raw);
  if (!plan || !Array.isArray(plan.slides) || !plan.slides.length) {
    throw new Error('Plan Deep Dive vide ou invalide');
  }
  return plan;
}

// ─── Serper : 1 photo exploitable + liste de candidats (pour l'éditeur) ───────
async function fetchSlidePhoto(query) {
  if (!process.env.SERPER_API_KEY || !query) return { buffer: null, candidates: [] };
  try {
    const imgs       = await serperImages(query, { hq: true });
    const candidates = imgs.map(i => i.imageUrl).filter(Boolean).slice(0, 6);
    const results    = await Promise.all(candidates.slice(0, 5).map(u => downloadBuffer(u).catch(() => null)));
    const sane       = results.filter(b => b && b.length > 10000 && isImageBuffer(b));
    const usable     = await keepUsablePhotos(sane);
    return { buffer: usable[0] || null, candidates };
  } catch (e) {
    console.warn('[DeepDive/img]', e.message);
    return { buffer: null, candidates: [] };
  }
}

// ─── Logo média : téléchargé + détouré une seule fois, réutilisé sur tous les fonds ──
async function loadDDLogo(logoUrl) {
  if (!logoUrl) return null;
  try {
    const raw  = await downloadBuffer(logoUrl);
    const png  = await sharp(raw).resize(null, 60, { fit: 'inside' }).png().toBuffer();
    const meta = await sharp(png).metadata();
    const shadow = await sharp(png).modulate({ brightness: 0 }).blur(10).toBuffer();
    return { buffer: png, shadow, width: meta.width || 60, height: meta.height || 60 };
  } catch (_) { return null; }
}

// ─── Overlay SVG par layout (fond uniquement — le texte est peint côté client) ──
function ddOverlay(layout) {
  if (layout === 'full_impact') {
    return Buffer.from(
      `<svg width="${DD_W}" height="${DD_H}" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<linearGradient id="v" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${DD_H}">` +
      `<stop offset="0%" stop-color="black" stop-opacity="0.50"/>` +
      `<stop offset="42%" stop-color="black" stop-opacity="0.22"/>` +
      `<stop offset="100%" stop-color="black" stop-opacity="0.92"/>` +
      `</linearGradient></defs><rect width="${DD_W}" height="${DD_H}" fill="url(#v)"/></svg>`
    );
  }
  if (layout === 'stat_focus') {
    return Buffer.from(
      `<svg width="${DD_W}" height="${DD_H}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${DD_W}" height="${DD_H}" fill="black" fill-opacity="0.66"/></svg>`
    );
  }
  if (layout === 'split_bottom') {
    const panelH = 470;
    return Buffer.from(
      `<svg width="${DD_W}" height="${DD_H}" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<linearGradient id="s" gradientUnits="userSpaceOnUse" x1="0" y1="${DD_H - panelH - 120}" x2="0" y2="${DD_H - panelH}">` +
      `<stop offset="0%" stop-color="#0C0C10" stop-opacity="0"/>` +
      `<stop offset="100%" stop-color="#0C0C10" stop-opacity="0.97"/>` +
      `</linearGradient></defs>` +
      `<rect width="${DD_W}" height="${panelH + 120}" y="${DD_H - panelH - 120}" fill="url(#s)"/>` +
      `<rect width="${DD_W}" height="${panelH}" y="${DD_H - panelH}" fill="#0C0C10" fill-opacity="0.97"/></svg>`
    );
  }
  // list_recap / cta_clean : slides typographiques → panneau quasi opaque (photo = texture)
  const op = layout === 'cta_clean' ? 0.96 : 0.94;
  return Buffer.from(
    `<svg width="${DD_W}" height="${DD_H}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${DD_W}" height="${DD_H}" fill="#0C0C10" fill-opacity="${op}"/></svg>`
  );
}

// ─── Composition du FOND d'une slide (photo + overlay + logo) ─────────────────
async function composeDeepDiveBg(base, layout, logoResized) {
  const composites = [{ input: await sharp(ddOverlay(layout)).png().toBuffer() }];
  // Logo haut-droite (sauf cta_clean qui est centré côté client → logo discret quand même)
  if (logoResized) {
    const lx = DD_W - 56 - logoResized.width;
    composites.push({ input: logoResized.shadow, left: lx + 3, top: 57 });
    composites.push({ input: logoResized.buffer, left: lx,     top: 54 });
  }
  return sharp(base).composite(composites).jpeg({ quality: 92 }).toBuffer();
}

// Prépare la base 1080×1350 depuis un buffer photo (ou dégradé de marque en secours)
async function ddBaseFromPhoto(photoBuffer, brand) {
  if (photoBuffer) {
    try {
      return await sharp(photoBuffer, { failOn: 'none' })
        .resize(DD_W, DD_H, { fit: 'cover', position: 'attention' })
        .modulate({ saturation: 0.92 })
        .toBuffer();
    } catch (_) { /* photo illisible → dégradé */ }
  }
  return sharp(brandGradientBuffer(DD_W, DD_H, brand.primary, brand.accent)).png().toBuffer();
}

// ─── Pipeline Deep Dive réutilisable ─────────────────────────────────────────
// Utilisé par POST /api/generate/deepdive (avec crédits) ET par le deep dive
// quotidien pré-forgé de la démo landing (routes/demo.js, sans crédits).
// Retourne le payload complet { slides, total, caption, hashtags, font, brand }.
async function runDeepDivePipeline(client, { topic, imageMode = 'hybrid', slideCount = 8 } = {}) {
  if (!sharp) throw new Error('Sharp non installé');
  if (!topic) throw new Error('topic manquant');

  const variant      = deepDiveVariant(imageMode);
  const clampedCount = Math.min(10, Math.max(7, Number(slideCount) || 8));

  // 1+2. Claude : recherche web + plan narratif
  const plan   = await deepDivePlan(topic, client, clampedCount);
  const slides = plan.slides.slice(0, 10);

    // Marque + police effective (la police part au client pour le rendu Canvas)
    const clientFont = resolveFont(client);
    const brand = {
      primary: client?.brand_colors?.[0] || '#FF3B30',
      accent:  client?.brand_colors?.[1] || '#FFFFFF',
    };
    const logoResized = await loadDDLogo(pickLogoUrl(client));

    // 3. Images en parallèle (Serper + éventuelle génération IA pour hook/climax en premium)
    const imgData = await Promise.all(slides.map(async (slide) => {
      if (imageMode === 'none') return { buffer: null, candidates: [] };
      // Récap & CTA restent typographiques (panneau quasi opaque) → pas de photo à chercher
      if (slide.role === 'recap' || slide.role === 'cta') return { buffer: null, candidates: [] };
      const isKey = slide.role === 'hook' || slide.role === 'climax';
      if (variant === 'premium' && isKey) {
        try {
          const brief    = { visual_brief: (slide.image_query || slide.title || topic) + '.', emotion: client?.mood };
          const aiPrompt = buildImagePrompt(brief, client);
          const buf      = await withTimeout(generateImageGPT(aiPrompt, null, []), 70000, 'DeepDive genai');
          // On récupère quand même les candidats Serper pour l'éditeur "changer l'image"
          const { candidates } = await fetchSlidePhoto(slide.image_query).catch(() => ({ candidates: [] }));
          return { buffer: buf, candidates };
        } catch (e) {
          console.warn('[DeepDive] genai échec, fallback Serper:', e.message);
          return fetchSlidePhoto(slide.image_query);
        }
      }
      return fetchSlidePhoto(slide.image_query);
    }));

    // 3b. Rythme visuel garanti côté code : jamais plus de 2 "stat_focus" d'affilée
    // (le 3ᵉ consécutif bascule en "split_bottom" — qui affiche aussi le "stat").
    // On ne touche qu'aux slides de contenu, jamais au hook/climax/recap/cta.
    let ddRun = 0, ddPrev = null;
    const ddLayouts = slides.map((slide) => {
      let lay = DD_LAYOUTS.includes(slide.layout) ? slide.layout : layoutForRole(slide.role, !!slide.stat);
      if (lay === ddPrev) ddRun++; else ddRun = 0;
      if (ddRun >= 2 && lay === 'stat_focus' && slide.role === 'content') { lay = 'split_bottom'; ddRun = 0; }
      ddPrev = lay;
      return lay;
    });

    // 4. Composition des fonds slide par slide (texte ajouté côté client)
    const outSlides = [];
    for (let i = 0; i < slides.length; i++) {
      const slide  = slides[i];
      const layout = ddLayouts[i];
      const base   = await ddBaseFromPhoto(imgData[i].buffer, brand);
      const bg     = await composeDeepDiveBg(base, layout, logoResized);
      outSlides.push({
        position:      i + 1,
        role:          slide.role || 'content',
        layout,
        title:         slide.title || '',
        body:          slide.body  || '',
        stat:          slide.stat  || null,
        bg:            'data:image/jpeg;base64,' + bg.toString('base64'),
        candidates:    imgData[i].candidates || [],
        photoFallback: !imgData[i].buffer,
      });
    }

  const caption = plan.caption
    || await generateCaption('deepdive', { topic, hookTitle: slides[0].title, hookBody: slides[0].body }, client).catch(() => '');

  return {
    slides:   outSlides,
    total:    outSlides.length,
    caption,
    hashtags: plan.hashtags || [],
    topic,
    variant,
    // Police effective + couleurs → le Canvas client peint le texte avec la VRAIE police
    font: {
      name:          clientFont.fontName,
      url:           clientFont.urlPath,
      weight:        clientFont.weight,
      style:         clientFont.style,
      transform:     clientFont.transform,
      letterSpacing: clientFont.letterSpacing,
    },
    // logo inclus → le Canvas client peut redessiner le logo sur un fond importé manuellement
    brand: { ...brand, logo: pickLogoUrl(client) },
  };
}

// ─── POST /api/generate/deepdive ─────────────────────────────────────────────
router.post('/deepdive', async (req, res) => {
  let creditCtx = null;
  const hardDeadline = setTimeout(() => {
    if (!res.headersSent) res.status(504).json({ error: 'Génération trop longue — réessaie' });
    refundCredits(creditCtx); creditCtx = null;
  }, 175000);

  if (!sharp) { clearTimeout(hardDeadline); return res.status(500).json({ error: 'Sharp non installé' }); }

  const { topic, userId, clientId, imageMode = 'hybrid', slideCount = 8 } = req.body;
  if (!topic) { clearTimeout(hardDeadline); return res.status(400).json({ error: 'topic manquant' }); }

  try {
    const client   = await getClientBrand(userId, clientId);
    const variant  = deepDiveVariant(imageMode); // 'premium' si genai/hybrid, sinon 'light'
    const creditClientId = client?.id || clientId || null;
    const charge   = await chargeCredits(creditClientId, 'deep_dive', variant);
    if (!charge.ok) { clearTimeout(hardDeadline); return insufficientCredits(res, charge.cost); }
    creditCtx = { clientId: creditClientId, postType: 'deep_dive', cost: charge.cost, charged: charge.charged };

    const payload = await runDeepDivePipeline(client, { topic, imageMode, slideCount });

    clearTimeout(hardDeadline);
    res.json({
      ...payload,
      creditsLeft: charge.charged ? charge.balance : undefined,
    });
    creditCtx = null; // carousel livré → pas de remboursement

  } catch (err) {
    console.error('[Generate/DeepDive]', err.message);
    clearTimeout(hardDeadline);
    await refundCredits(creditCtx); creditCtx = null;
    if (!res.headersSent) res.status(500).json({ error: err.message, refunded: true });
  }
});

// ─── POST /api/generate/regenerate-slide ─────────────────────────────────────
// Recompose le FOND d'UNE seule slide avec une image choisie par le CM.
// Gratuit : la génération du carousel est déjà payée (simple changement d'image).
router.post('/regenerate-slide', async (req, res) => {
  if (!sharp) return res.status(500).json({ error: 'Sharp non installé' });
  // imageUrl : photo web · imageData : image importée (base64) · clear : revenir au fond de marque
  const { userId, clientId, layout, imageUrl, imageData, clear } = req.body;
  if (!imageUrl && !imageData && !clear) return res.status(400).json({ error: 'imageUrl, imageData ou clear requis' });

  try {
    const client = await getClientBrand(userId, clientId);
    const brand = {
      primary: client?.brand_colors?.[0] || '#FF3B30',
      accent:  client?.brand_colors?.[1] || '#FFFFFF',
    };
    const logoResized = await loadDDLogo(pickLogoUrl(client));

    let photoBuffer = null;
    if (!clear) {
      if (imageData) {
        const b64 = String(imageData).split(',')[1] || imageData;
        try { const buf = Buffer.from(b64, 'base64'); if (buf.length > 500 && isImageBuffer(buf)) photoBuffer = buf; } catch (_) {}
      } else if (imageUrl) {
        try { const buf = await downloadBuffer(imageUrl); if (buf && buf.length > 5000 && isImageBuffer(buf)) photoBuffer = buf; } catch (_) {}
      }
    }

    const safeLayout = DD_LAYOUTS.includes(layout) ? layout : 'split_bottom';
    const base = await ddBaseFromPhoto(photoBuffer, brand);
    const bg   = await composeDeepDiveBg(base, safeLayout, logoResized);
    res.json({ bg: 'data:image/jpeg;base64,' + bg.toString('base64'), photoFallback: !photoBuffer });

  } catch (err) {
    console.error('[Generate/RegenerateSlide]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/generate/search-images ────────────────────────────────────────
// Recherche d'images à la demande (Serper) pour ajouter/changer le fond d'une slide,
// y compris quand le carousel a été généré en "Typo seul" (aucun candidat au départ).
router.post('/search-images', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query manquant' });
  if (!process.env.SERPER_API_KEY) return res.json({ candidates: [] });
  try {
    const imgs = await serperImages(String(query).slice(0, 120), { hq: true });
    const candidates = imgs.map(i => i.imageUrl).filter(Boolean).slice(0, 12);
    res.json({ candidates });
  } catch (err) {
    console.error('[Generate/SearchImages]', err.message);
    res.status(500).json({ error: err.message, candidates: [] });
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

    track({ feature: 'detect_format', model: 'claude-haiku-4-5-20251001', inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens });
    const raw = response.content.find(b => b.type === 'text')?.text || '';
    res.json(parseAIJson(raw));
  } catch (err) {
    console.error('[DetectFormat]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/generate/forge-from-article ───────────────────────────────────
// Transforme un article de veille en un brief ADAPTÉ au format choisi
// (actu / citation / deep_dive). Un seul appel Claude, prompt par format.
// Renvoie { format, prefill } → le front pré-remplit la page de génération.
function forgeActuPrompt(a) {
  return `Tu es rédacteur en chef d'un média Instagram. Voici un article de veille :

TITRE : ${a.title}
CONTENU : ${a.content}
SOURCE : ${a.source}

Reformule cet article en une actu directe et percutante, prête à devenir un post
breaking (max 220 caractères, factuelle, sans emoji superflu).

Retourne UNIQUEMENT ce JSON : {"newsText":"…"}`;
}

function forgeCitationPrompt(a) {
  return `Tu es rédacteur en chef d'un média Instagram.
Voici un article de veille :

TITRE : ${a.title}
CONTENU : ${a.content}
SOURCE : ${a.source}

Extrais LA citation la plus forte de cet article — une déclaration textuelle
prononcée par une personne (pas une paraphrase du journaliste).

Critères de sélection :
- Une vraie phrase entre guillemets dans l'article, attribuée à quelqu'un
- La plus percutante / polémique / émotionnelle / marquante
- Maximum 200 caractères (elle doit tenir sur un post)
- Si la citation est trop longue, coupe-la proprement à l'endroit le plus fort
  avec "..." (sans déformer le sens)

Si l'article ne contient AUCUNE citation directe exploitable, retourne
{ "found": false } — ne fabrique JAMAIS une citation.

Retourne UNIQUEMENT ce JSON :
{ "found": true, "quoteText": "la citation exacte", "authorName": "Prénom Nom", "authorTitle": "sa fonction (ex: Sélectionneur des Bleus)" }`;
}

function forgeDeepDivePrompt(a) {
  return `Tu es rédacteur en chef d'un média Instagram.
Voici un article de veille :

TITRE : ${a.title}
CONTENU : ${a.content}
SOURCE : ${a.source}
DATE : ${a.publishedAt || 'non précisée'}

Transforme cet article en un BRIEF DE DEEP DIVE structuré — un carousel
pédagogique de 7 à 10 slides. Le brief doit donner au générateur tout ce qu'il
faut pour construire un arc narratif complet.

Retourne UNIQUEMENT ce JSON :
{
  "subject": "le sujet reformulé en une phrase claire et précise",
  "angle": "l'angle éditorial recommandé (chronologique / analyse / décryptage / conséquences / coulisses)",
  "hook_suggestion": "une proposition de hook en 5-8 mots qui crée une tension",
  "key_facts": ["fait 1 tiré de l'article (chiffre, date, nom précis)", "fait 2", "fait 3 — minimum 3, maximum 6 faits"],
  "open_questions": ["question que l'article soulève et que la recherche web devra compléter"],
  "tone_note": "consigne de ton spécifique à ce sujet (ex: éducatif sans moralisme, factuel sans sensationnalisme)"
}

Les key_facts doivent être VÉRIFIABLES et venir de l'article — pas d'invention.
Les open_questions guideront la recherche web complémentaire du générateur.`;
}

// Assemble le brief Deep Dive structuré en texte pour le champ "Sujet du carousel"
function assembleDeepDiveBrief(b) {
  const lines = [b.subject || ''];
  if (b.angle)           lines.push('Angle : ' + b.angle);
  if (b.hook_suggestion) lines.push('Hook suggéré : ' + b.hook_suggestion);
  if (Array.isArray(b.key_facts) && b.key_facts.length)         lines.push('Faits clés : ' + b.key_facts.join(' · '));
  if (Array.isArray(b.open_questions) && b.open_questions.length) lines.push('À creuser : ' + b.open_questions.join(' · '));
  if (b.tone_note)       lines.push('Ton : ' + b.tone_note);
  return lines.filter(Boolean).join('\n');
}

router.post('/forge-from-article', async (req, res) => {
  const { article = {}, format = 'actu' } = req.body;
  const a = {
    title:       article.title       || article.titre || '',
    content:     article.content     || article.description || article.text || article.extrait || '',
    source:      article.source      || '',
    publishedAt: article.publishedAt || article.published_at || article.date || '',
  };
  if (!a.title && !a.content) return res.status(400).json({ error: 'Article vide' });

  const fmt = (format === 'deepdive' || format === 'deep_dive') ? 'deep_dive'
            : (format === 'citation' ? 'citation' : 'actu');

  try {
    const prompt = fmt === 'citation'  ? forgeCitationPrompt(a)
                 : fmt === 'deep_dive' ? forgeDeepDivePrompt(a)
                 : forgeActuPrompt(a);

    const response = await withTimeout(haiku.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 900,
      messages:   [{ role: 'user', content: prompt }],
    }), 30000, 'forge-from-article');
    track({ feature: 'forge_from_article', model: 'claude-haiku-4-5-20251001', inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens });

    const raw  = response.content.find(b => b.type === 'text')?.text || '';
    const data = parseAIJson(raw);

    if (fmt === 'actu') {
      return res.json({ format: 'actu', prefill: { newsText: data.newsText || a.title } });
    }
    if (fmt === 'citation') {
      if (!data.found) return res.json({ format: 'citation', found: false });
      return res.json({
        format: 'citation', found: true,
        prefill: { quoteText: data.quoteText || '', authorName: data.authorName || '', authorTitle: data.authorTitle || '' },
      });
    }
    // deep_dive
    return res.json({
      format: 'deepdive',
      brief:  data,
      prefill: { topic: assembleDeepDiveBrief(data) },
    });

  } catch (err) {
    console.error('[ForgeFromArticle]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Brand Identity — energy palette + mapping helpers ───────────────────────
const ENERGY_PALETTE = {
  brut:    { primary:'#FF3B30', accent:'#FFFFFF', bg:'#0A0A0A', text:'#FFFFFF', ref:'L\'Équipe, NY Post — rouge vif, noir dense, impact maximal' },
  premium: { primary:'#C8A96E', accent:'#2A1F5C', bg:'#0D0D1A', text:'#F5F0E8', ref:'Monocle, The Atlantic — or chaud, marine profond, raffinement' },
  vif:     { primary:'#00D4FF', accent:'#FF9ED3', bg:'#050D2E', text:'#EEF4FF', ref:'Wired, Vice — cyan électrique, rose, bleu nuit saturé' },
  sobre:   { primary:'#0047FF', accent:'#111111', bg:'#F8F8F8', text:'#111111', ref:'Bloomberg, Le Monde — bleu intense, blanc pur, typographie forte' },
};

function biEnergyPalette(energy) {
  return ENERGY_PALETTE[energy] || ENERGY_PALETTE.brut;
}

function biFont(typo, sw) {
  const punchy = typo === 'punchy' || typo === 'dynamique';
  if (punchy) {
    if (sw.includes('Dynamique') || sw.includes('Énergique')) return 'Bebas Neue';
    if (sw.includes('Percutant'))                              return 'Oswald';
    return 'Anton';
  }
  if (sw.includes('Premium') || sw.includes('Élégant')) return 'Space Grotesk';
  if (sw.includes('Moderne'))                            return 'DM Sans';
  return 'Sora';
}

function biMood(sw) {
  if (sw.includes('Dramatique'))                             return 'dramatique';
  if (sw.includes('Énergique') || sw.includes('Dynamique')) return 'energique';
  if (sw.includes('Premium')   || sw.includes('Élégant'))   return 'premium';
  if (sw.includes('Percutant') || sw.includes('Audacieux')) return 'populaire';
  return 'factuel';
}

function biGraphicStyle(sw, topics) {
  const sport = ['Football','Sport','NBA','Tennis','Rugby','Basket','Foot'];
  if ((topics || []).some(t => sport.includes(t))) return 'sport';
  if (sw.includes('Premium') || sw.includes('Élégant')) return 'magazine';
  if (sw.includes('Moderne') || sw.includes('Sobre'))   return 'minimaliste';
  return 'breaking';
}

// ─── Vision extraction — lit la config réelle depuis le brand kit généré ──────
async function extractBrandConfigFromImage(imageUrl, name) {
  if (!openaiClient) return null;
  try {
    const resp = await openaiClient.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          { type: 'text', text: `This is a brand identity sheet for "${name}". Extract EXACTLY:
1. All hex color codes from the palette section (read precisely as printed)
2. The font used for headlines/titles — map it to the CLOSEST match from this exact list (return the exact string):
   "Bebas Neue" | "Oswald" | "Anton" | "Barlow Condensed" | "Playfair Display" | "Fraunces" | "Space Grotesk" | "Syne" | "DM Serif Display" | "Unbounded" | "DM Sans" | "Inter" | "Montserrat" | "Lato"
   If unsure, pick the visually closest. Never invent a name outside this list.
3. The tagline text (read exactly as written)
4. Graphic style as one word: "breaking", "magazine", "lifestyle", or "minimaliste"
5. Three editorial tone keywords

Return ONLY this JSON, no markdown:
{"brand_colors":["#HEX1","#HEX2","#HEX3","#HEX4"],"font_primary":"Font Name","tagline":"exact tagline","graphic_style":"one word","tone_tags":["tag1","tag2","tag3"]}` }
        ]
      }]
    });
    const raw = resp.choices[0].message.content.trim();
    return JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  } catch(e) {
    console.warn('[Vision extract]', e.message);
    return null;
  }
}

function buildBrandKitVariantPrompt({ name, topics, userPrompt, variant }) {
  const handle = '@' + name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_.]/g, '').slice(0, 20);
  const topic1 = (topics || ['actualité'])[0];
  const topicsStr = (topics || []).slice(0, 3).join(' · ');

  const executionAngle = userPrompt ? {
    1: `CREATIVE CONCEPT (Concept A): Your first and most instinctive interpretation of the creative brief. Every design decision — palette, typography, atmosphere — must flow directly from it. Make it distinctive and coherent.`,
    2: `CREATIVE CONCEPT (Concept B): A second, genuinely different interpretation of the same brief. Find a different angle or tension. Completely different visual world from Concept A — different palette, typography, mood — but still rooted in the brief.`,
    3: `CREATIVE CONCEPT (Concept C): A third interpretation, maximally distinct from both A and B. Push the least obvious dimension of the brief. Surprise, but stay defensible from the brief.`,
  }[variant] : {
    1: `CONCEPT A: Derive the visual identity purely from the brand name "${name}" and its topics (${topicsStr}). Do not invent or assume any style — let the subject matter dictate everything. One coherent visual world.`,
    2: `CONCEPT B: A second interpretation derived only from "${name}" and topics (${topicsStr}). Explore a different facet of the subject matter. Completely different palette, typography and mood from Concept A. Zero invented assumptions.`,
    3: `CONCEPT C: A third interpretation derived only from "${name}" and topics (${topicsStr}). The most unexpected angle that the subject matter itself can justify. Fully distinct from A and B.`,
  }[variant] || '';

  const followerCount = Math.floor(Math.random() * 60 + 20) + 'K';
  const pubCount = Math.floor(Math.random() * 200 + 100);

  return `You are a senior brand identity designer at a top Paris creative agency. Create a COMPLETE, ULTRA-DETAILED brand identity guide for a digital media brand. Output must look like a real professional brand book — premium, dense, agency-grade. No lorem ipsum, no generic content.

BRAND NAME: "${name}"
TOPICS COVERED: ${topicsStr}
${userPrompt ? `CREATIVE BRIEF — this is the primary source of truth. All design decisions must flow from this: "${userPrompt}"` : ''}
${executionAngle}

FORMAT: Portrait 1024×1536px. Full-bleed layout. Three major sections stacked vertically.

══════════════════════════════════════
SECTION 1 — TOP HERO  (top ~30% of image)
══════════════════════════════════════
Split horizontally into two halves with a subtle dividing line:

LEFT HALF — LOGO & BRAND MARK:
• Big custom logotype: "${name}" in a typeface that perfectly matches the brand personality
• Below: brand icon/monogram — a custom geometric or letter-based mark
• Tagline in small-caps under the mark: original, specific, punchy (French, max 6 words)
• Section label "NOM & POSITIONNEMENT" in tiny uppercase at top

RIGHT HALF — POSITIONING:
• Large editorial statement (2–3 sentences in French) explaining what "${name}" stands for in the ${topic1} space — specific, passionate, professional
• "NOTRE PROMESSE" subtitle with 3 brand promise bullets, each with a small inline icon:
  e.g.: ⚡ [Core promise 1]   🎯 [Core promise 2]   🌍 [Core promise 3]
• Background: dramatic visual — abstract 3D shape, flowing gradient, or atmospheric texture in brand accent color

══════════════════════════════════════
SECTION 2 — IDENTITY SPECS  (middle ~30% of image, 3 columns separated by thin lines)
══════════════════════════════════════

COLUMN A — COLOR & TYPE (~33%):
• "PALETTE DE COULEURS" tiny-caps header
• 5 rectangular color swatches in a row — each with its EXACT HEX CODE as legible printed text directly below (e.g. #FF3B30, #0F0F0F, #FFFFFF). HEX TEXT MUST BE READABLE — this is critical production data
• ——— divider line ———
• "TYPOGRAPHIES" tiny-caps header
• Large "Aa" in the chosen display font
• Font name clearly printed below
• Three weight examples stacked:
  "TITRE PRINCIPAL" in heavy/black weight
  "Sous-titre accrocheur" in medium
  "Texte courant et lisibilité" in regular

COLUMN B — IDENTITY & TONE (~33%):
• "IDENTITÉ VISUELLE" tiny-caps header
• 4–5 editorial icon set with labels below each (relevant to ${topic1}):
  e.g.: clock icon→RAPIDITÉ, target→PRÉCISION, etc.
• ——— divider line ———
• "TONALITÉ" tiny-caps header
• 4 brand voice keywords — each in a small rounded pill/card:
  [Keyword] — [one-line French description]
  [Keyword] — [one-line French description]
  [Keyword] — [one-line French description]
  [Keyword] — [one-line French description]

COLUMN C — CONTENT STYLE (~34%):
• "STYLE DE CONTENU" tiny-caps header
• 3 tall Instagram post mockups (4:5 portrait crops) displayed side by side:
  Post 1: Real action photo of ${topic1} + bold "${name}"-branded headline overlay + category badge
  Post 2: Stat card — big bold number (e.g. "2.4M", "68%") with short context text, brand color bg
  Post 3: Typography-only editorial list "5 choses à savoir sur..." with brand colors
• Each post shows "${name}" brand mark at the bottom

══════════════════════════════════════
SECTION 3 — SHOWCASE  (bottom ~40% of image)
══════════════════════════════════════
Split into two parts:

LEFT SIDE (~42%):
• "GRAPHISMES & IMAGERIE" tiny-caps header
• 2 image thumbnails: the photographic/graphic aesthetic for ${topic1} content (action shots, atmosphere)
• Caption: 1-line description of the visual style
• ——— divider line ———
• "STORIES & HIGHLIGHTS" tiny-caps header
• 5 story highlight icons (circle with icon + French label below):
  Categories relevant to "${name}" (e.g. ACTU · MERCATO · MATCHS · ANALYSES · COULISSES)

RIGHT SIDE (~58%):
• Realistic iPhone 15 mockup — dark mode — displayed slightly angled or flat
• Screen shows actual Instagram profile for "${name}":
  - Circular avatar = the brand MONOGRAM or LETTERMARK in brand colors on a solid color background — a flat abstract graphic shape, NOT a photograph, NOT a face, NOT a silhouette, NOT a realistic image of any kind
  - Handle: ${handle}
  - Stats bar: ${pubCount} Publications  ${followerCount} Abonnés  [small] Abonnements
  - Bio: brand description (2 lines, French)
  - Highlighted stories row (5 circles matching the categories above)
  - 2×3 grid of 6 posts — mixing the 3 styles from Section 2 Column C
• BELOW the phone, large bold text: brand slogan/tagline in display font (e.g. "L'INFO ${topic1.toUpperCase()}. SUR TA LIGNE.")
• "EN RÉSUMÉ" section: 4–5 value pills in a row: e.g. ⚡ RAPIDE  ✓ CRÉDIBLE  🌍 INTERNATIONAL  ♥ PASSIONNÉ

══════════════════════════════════════
CRITICAL RULES:
• All text in FRENCH — real editorial content, nothing generic or placeholder
• "${name}" must appear at least 8 times across the layout
• HEX codes under palette swatches MUST be exact, readable text (not decorative)
• The phone mockup must look photorealistic — reflections, shadows, depth
• Colors used in the mockups MUST match the palette swatches
• Layout must be extremely dense, every zone used intentionally — like a real agency deliverable
• This is ONE creative concept among three — it must look visually distinct from the other two while remaining rooted in the brand brief. ALL colors, typography and mood must come from interpreting the brief — never from generic presets
• CRITICAL — Instagram profile avatar: the circle must contain ONLY a flat graphic monogram or abstract mark in brand colors. Absolutely NO human face, NO portrait photo, NO silhouette, NO stock photo. A flat logo on a solid background. This rule is non-negotiable.
`.trim();
}

// ─── Brand Identity — génère 3 kits en parallèle (onboarding Step 3B) ─────────
router.post('/brand-identity', async (req, res) => {
  try {
  const { clientId, name, topics, userPrompt, refImageB64 } = req.body;
  if (!clientId || !name) return res.status(400).json({ error: 'clientId et name requis' });

  // Auth — vérifie que le clientId appartient bien à l'utilisateur connecté
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non autorisé', debug: 'no_token' });
  const authResult = await supabase.auth.getUser(token);
  const user = authResult.data?.user;
  const authErr = authResult.error;
  if (authErr || !user) return res.status(401).json({ error: 'Non autorisé' });

  const clientResult = await supabase.from('clients').select('id').eq('id', clientId).eq('user_id', user.id).maybeSingle();
  const clientCheck = clientResult.data;
  if (!clientCheck) return res.status(403).json({ error: 'Accès interdit' });

  // Enrichit le prompt avec la description de l'image de référence si fournie
  let enrichedPrompt = userPrompt || '';
  if (refImageB64) {
    try {
      const desc = await extractStyleDescriptors(Buffer.from(refImageB64, 'base64'));
      if (desc) enrichedPrompt = [enrichedPrompt, 'Visual reference style: ' + desc].filter(Boolean).join(' ');
    } catch(_) {}
  }

  // Étape 1 — 3 images GPT Image 2 en parallèle
  let imageResults;
  try {
    imageResults = await Promise.all([1, 2, 3].map(v =>
      openaiClient.images.generate({
        model: 'gpt-image-2', size: '1024x1536', quality: 'high', n: 1,
        prompt: buildBrandKitVariantPrompt({ name, topics, userPrompt: enrichedPrompt, variant: v }),
      })
    ));
  } catch(err) {
    console.error('[brand-identity] generation failed:', err.message);
    return res.status(500).json({ error: 'La génération a échoué. Réessaie dans quelques secondes.' });
  }

  // Étape 2 — Upload + extraction config depuis image (Vision GPT-4o) en parallèle
  const kits = (await Promise.all(imageResults.map(async (imgResult, i) => {
    let imgBuffer;
    try {
      if (imgResult.data[0].b64_json) {
        imgBuffer = Buffer.from(imgResult.data[0].b64_json, 'base64');
      } else {
        const fetched = await fetch(imgResult.data[0].url);
        imgBuffer = Buffer.from(await fetched.arrayBuffer());
      }
    } catch(e) { console.error(`[brand-identity] image ${i+1} failed:`, e.message); return null; }

    const fileName = `brand-kits/${clientId}/option-${i+1}-${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from('brand-assets').upload(fileName, imgBuffer, { contentType: 'image/jpeg', upsert: true });
    if (upErr) { console.error('upload failed', upErr.message); return null; }
    const { data: { publicUrl: imageUrl } } = supabase.storage.from('brand-assets').getPublicUrl(fileName);

    // Extraire palette/fonts/tagline DEPUIS l image générée — garantit la cohérence
    let config = await extractBrandConfigFromImage(imageUrl, name);
    if (!config) {
      config = { brand_colors: ['#111111','#FF3B30','#FFFFFF'],
                 mood: 'energique', graphic_style: 'breaking', tone_tags: ['Direct','Percutant','Informatif'],
                 topics: topics||[], tagline: '' };
    } else {
      config.topics = topics || [];
      config.mood = config.mood || 'energique';
      config.graphic_style = config.graphic_style || 'breaking';
    }
    // Pack typographique imposé à la création : Impact News (Bebas Neue) — modifiable ensuite
    config.font_primary  = 'Bebas Neue';
    config.font_id       = 'bebas-neue';
    config.font_set      = 'impact';
    config.font_body     = config.font_body || 'Barlow';
    config.font_is_custom = false;
    return { imageUrl, config };
  }))).filter(Boolean);

  if (!kits.length) return res.status(500).json({ error: 'Aucun kit généré — réessaie' });
  res.json({ ok: true, kits });
  } catch (err) {
    console.error('[brand-identity] unhandled:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur — réessaie' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// FORGE DE LOGO — génération dédiée (remplace l'ancien crop depuis le mockup)
// Le badge est généré directement (rond plein aux couleurs de la marque), le
// brand kit sert de référence visuelle pour la cohérence. Le "logo nu" est
// dérivé du badge par détourage façon remove.bg (Gemini + flood-fill).
// ═══════════════════════════════════════════════════════════════════════════

function buildLogoPrompt(client, userPrompt, variantSeed) {
  const name   = client?.name || 'the brand';
  const colors = client?.brand_colors || [];
  return [
    `Professional flat vector logo badge for the Instagram media brand "${name}".`,
    'A bold, iconic, memorable mark: monogram, lettermark or simple abstract symbol — flat 2D graphic design, crisp clean edges, instantly readable at avatar size.',
    colors.length >= 2
      ? `Brand palette: primary ${colors[0]}, accent ${colors[1]}. The badge fill must be a solid color from this palette (or a near-black/near-white that complements it).`
      : 'Solid color badge fill.',
    client?.mood ? `Brand mood: ${client.mood}.` : '',
    client?.topics?.length ? `The media covers: ${client.topics.slice(0, 4).join(', ')}.` : '',
    userPrompt ? `Creative direction from the user (top priority): ${userPrompt}.` : '',
    variantSeed ? `Creative variation #${variantSeed}: explore a visually distinct direction (different mark concept or composition) from other variations.` : '',
    'Composition: the mark centered inside ONE filled circle badge occupying ~85% of the canvas, on a PLAIN UNIFORM single-color background outside the badge.',
    'STRICT: flat design only — no photo, no 3D, no mockup, no shadows outside the badge, no watermark. Text limited to the brand initials or short name.',
  ].filter(Boolean).join(' ');
}

// Génère UNE image de logo — brand kit en référence si dispo (cohérence),
// sinon génération pure. Retourne un buffer PNG/JPEG brut (fond uni à détourer).
async function generateLogoImage(client, userPrompt, variantSeed, kitBuf) {
  if (!openaiClient) throw new Error('OpenAI client not initialized');
  const prompt = buildLogoPrompt(client, userPrompt, variantSeed);

  if (kitBuf) {
    try {
      const file = await toFile(kitBuf, 'brandkit.jpg', { type: 'image/jpeg' });
      const r = await openaiClient.images.edit({
        model: 'gpt-image-2', image: file, size: '1024x1024', quality: 'high',
        prompt: 'Use this brand identity board ONLY as style, color and mood reference — do not copy its layout or reproduce the board itself. ' + prompt,
      });
      const b64 = r.data?.[0]?.b64_json;
      if (b64) return Buffer.from(b64, 'base64');
    } catch (e) {
      console.warn('[logo-forge] edit avec brand kit échoué → génération pure:', e.message);
    }
  }

  const r = await openaiClient.images.generate({
    model: 'gpt-image-2', prompt, size: '1024x1024', quality: 'high', n: 1,
  });
  if (r.data?.[0]?.b64_json) return Buffer.from(r.data[0].b64_json, 'base64');
  if (r.data?.[0]?.url) {
    const fetched = await fetch(r.data[0].url);
    return Buffer.from(await fetched.arrayBuffer());
  }
  throw new Error('Aucune image retournée par gpt-image-2');
}

// Retire uniquement le fond uni EXTÉRIEUR (autour d'un badge généré)
async function removeOuterBackground(pngBuf) {
  const { data, info } = await sharp(pngBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  removeConnectedBackground(data, info.width, info.height, 'border');
  return sharp(Buffer.from(data), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// Dérive la variante "logo nu" depuis le badge — remove.bg déterministe :
// pass 1 retire le fond extérieur, pass 2 pèle la couleur de fond du disque.
// Le résultat est recadré sur la marque et recentré sur un canvas carré.
async function deriveLogoNu(badgeBuf) {
  const { data, info } = await sharp(badgeBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;

  // UNE seule couche de fond est retirée : si le passage par le bord a déjà
  // enlevé un vrai fond (photo, disque plein-cadre), on s'arrête là — sinon on
  // pèle le fond du badge. Jamais deux couches : la 2e serait le sujet lui-même.
  const removedOuter = removeConnectedBackground(data, W, H, 'border');
  if (removedOuter < W * H * 0.02) {
    removeConnectedBackground(data, W, H, 'boundary');
  }

  const cut = await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();

  // Recadre sur le contenu restant puis recentre sur un carré avec marge
  try {
    const trimmed = await sharp(cut).trim({ threshold: 12 }).png().toBuffer();
    const meta = await sharp(trimmed).metadata();
    const side = Math.max(meta.width || 1, meta.height || 1);
    const pad  = Math.round(side * 0.08);
    return await sharp(trimmed)
      .extend({
        top:    Math.round((side - (meta.height || side)) / 2) + pad,
        bottom: Math.round((side - (meta.height || side)) / 2) + pad,
        left:   Math.round((side - (meta.width  || side)) / 2) + pad,
        right:  Math.round((side - (meta.width  || side)) / 2) + pad,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  } catch (_) {
    return cut; // trim impossible (image vide ?) → version détourée brute
  }
}

async function uploadLogoAsset(clientId, kind, buf) {
  const path = `logos/${clientId}/${kind}.png`;
  const { error } = await supabase.storage.from('brand-assets').upload(path, buf, { contentType: 'image/png', upsert: true });
  if (error) throw new Error(`Upload ${kind} échoué: ${error.message}`);
  return supabase.storage.from('brand-assets').getPublicUrl(path).data.publicUrl;
}

// Applique une image de logo comme identité : badge normalisé ROND (façon PP
// Instagram) + nu dérivé, upload des deux variantes et mise à jour du client
// (logo_url = legacy badge).
async function applyLogoVariants(clientId, rawBuf) {
  // Plein cadre AVANT tout : sans trim, un badge avec marges transparentes
  // paraît minuscule partout (posts, sidebar, démo) à taille de boîte égale.
  let framed = rawBuf;
  try { framed = await sharp(rawBuf).trim({ threshold: 10 }).png().toBuffer(); } catch (_) {}
  const badgeSquare = await sharp(framed)
    .resize(800, 800, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  // Masque circulaire — le badge est toujours un disque, coins transparents
  const circleMask = Buffer.from(
    '<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg"><circle cx="400" cy="400" r="400" fill="#fff"/></svg>'
  );
  const badgeBuf = await sharp(badgeSquare)
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  let nuBuf = null;
  try { nuBuf = await deriveLogoNu(badgeBuf); } catch (e) { console.warn('[logo nu] dérivation échouée:', e.message); }

  const ts = Date.now();
  const badgeUrl = await uploadLogoAsset(clientId, `badge-${ts}`, badgeBuf);
  const nuUrl    = nuBuf ? await uploadLogoAsset(clientId, `nu-${ts}`, nuBuf) : null;

  const upd = { logo_badge_url: badgeUrl, logo_url: badgeUrl };
  if (nuUrl) upd.logo_nu_url = nuUrl;
  const { error } = await supabase.from('clients').update(upd).eq('id', clientId);
  if (error) console.error('[logo apply] db:', error.message);

  return { badgeUrl, nuUrl };
}
// ─── Brand Identity Confirm — Vision extraction + logo + save DB ──────────────
router.post('/brand-identity/confirm', async (req, res) => {
  const { clientId, name, topics, energy, selectedKit } = req.body;
  if (!clientId || !selectedKit) return res.status(400).json({ error: 'Données manquantes' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non autorisé' });
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Non autorisé' });
  // Fetch existing client to preserve the user-uploaded logo
  const { data: clientCheck } = await supabase.from('clients').select('id, logo_url').eq('id', clientId).eq('user_id', user.id).single();
  if (!clientCheck) return res.status(403).json({ error: 'Accès interdit' });

  // Config directement depuis le kit sélectionné — déjà calculée lors de la génération
  const finalConfig = selectedKit.config || {};

  // Preserve the logo the user uploaded — never overwrite it
  const logoUrl = clientCheck.logo_url || null;

  // Save to DB
  const updatePayload = {
    id: clientId, user_id: user.id, name,
    brand_colors:  finalConfig.brand_colors,
    font_primary:  finalConfig.font_primary || 'Bebas Neue',
    font_id:       finalConfig.font_id      || 'bebas-neue',
    font_set:      finalConfig.font_set     || 'impact',
    font_body:     finalConfig.font_body    || 'Barlow',
    font_is_custom: false,
    mood:          finalConfig.mood,
    graphic_style: finalConfig.graphic_style,
    tone_tags:     finalConfig.tone_tags,
    topics:        finalConfig.topics || topics,
    tagline:       finalConfig.tagline,
    brand_kit_url: selectedKit.imageUrl,
    onboarding_step: 4,
  };
  // Only set logo_url if the user actually uploaded one (don't null-out an existing logo)
  if (logoUrl) updatePayload.logo_url = logoUrl;

  const { error: dbErr } = await supabase.from('clients').upsert(updatePayload);
  if (dbErr) console.error('[brand-identity/confirm] db:', dbErr.message);

  res.json({ ok: true, imageUrl: selectedKit.imageUrl, logoUrl, config: finalConfig });
});

// ─── Relogo — forge UN logo cohérent avec le brand kit (gratuit, inclus) ─────
// Remplace l'ancien crop de la PP du mockup (fragile). Le kit sert de référence
// visuelle à la génération — même palette, même univers.
router.post('/brand-identity/relogo', async (req, res) => {
  const { clientId, imageUrl } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId requis' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non autorisé' });
  const authResult = await supabase.auth.getUser(token);
  const user = authResult.data?.user;
  if (!user) return res.status(401).json({ error: 'Non autorisé' });

  const { data: client } = await supabase.from('clients').select('*').eq('id', clientId).eq('user_id', user.id).maybeSingle();
  if (!client) return res.status(403).json({ error: 'Accès interdit' });

  try {
    let kitBuf = null;
    const kitUrl = imageUrl || client.brand_kit_url;
    if (kitUrl) { try { kitBuf = await downloadBuffer(kitUrl); } catch (_) {} }

    const rawLogo  = await generateLogoImage(client, null, null, kitBuf);
    // Retire le fond uni autour du disque badge → badge transparent hors cercle
    const badgeCut = await removeOuterBackground(await sharp(rawLogo).png().toBuffer());
    const { badgeUrl, nuUrl } = await applyLogoVariants(clientId, badgeCut);

    res.json({ ok: true, logoUrl: badgeUrl, badgeUrl, nuUrl });
  } catch(e) {
    console.error('[relogo]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Logo Forge — 3 propositions IA guidées par la marque (payant : crédits) ─
router.post('/brand-identity/logo-forge', async (req, res) => {
  const { clientId, userPrompt } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId requis' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non autorisé' });
  const authResult = await supabase.auth.getUser(token);
  const user = authResult.data?.user;
  if (!user) return res.status(401).json({ error: 'Non autorisé' });

  const { data: client } = await supabase.from('clients').select('*').eq('id', clientId).eq('user_id', user.id).maybeSingle();
  if (!client) return res.status(403).json({ error: 'Accès interdit' });

  const charge = await chargeCredits(clientId, 'logo_forge');
  if (!charge.ok) return insufficientCredits(res, charge.cost);
  let creditCtx = { clientId, postType: 'logo_forge', cost: charge.cost, charged: charge.charged };

  try {
    let kitBuf = null;
    if (client.brand_kit_url) { try { kitBuf = await downloadBuffer(client.brand_kit_url); } catch (_) {} }

    // 3 propositions en parallèle — chaque variante explore une direction distincte
    const rawResults = await Promise.all([1, 2, 3].map(v =>
      generateLogoImage(client, (userPrompt || '').trim() || null, v, kitBuf)
        .catch(e => { console.error(`[logo-forge] variante ${v}:`, e.message); return null; })
    ));

    // Détourage du fond uni → badges transparents hors cercle, puis upload
    const ts = Date.now();
    const candidates = (await Promise.all(rawResults.map(async (raw, i) => {
      if (!raw) return null;
      try {
        const cut = await removeOuterBackground(await sharp(raw).resize(800, 800, { fit: 'inside' }).png().toBuffer());
        return await uploadLogoAsset(clientId, `forge-${ts}-${i + 1}`, cut);
      } catch (e) { console.error(`[logo-forge] post-process ${i + 1}:`, e.message); return null; }
    }))).filter(Boolean);

    if (!candidates.length) {
      await refundCredits(creditCtx);
      return res.status(500).json({ error: 'La forge a échoué — réessaie dans quelques secondes.', refunded: true });
    }

    res.json({ ok: true, candidates, creditsLeft: charge.charged ? charge.balance : undefined });
  } catch (e) {
    console.error('[logo-forge]', e.message);
    await refundCredits(creditCtx);
    if (!res.headersSent) res.status(500).json({ error: e.message, refunded: true });
  }
});

// ─── Logo Apply — adopte une image comme logo : badge + nu dérivé ────────────
// imageUrl : proposition de la forge OU image importée/recadrée par le client.
router.post('/brand-identity/logo-apply', async (req, res) => {
  const { clientId, imageUrl } = req.body;
  if (!clientId || !imageUrl) return res.status(400).json({ error: 'clientId et imageUrl requis' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non autorisé' });
  const authResult = await supabase.auth.getUser(token);
  const user = authResult.data?.user;
  if (!user) return res.status(401).json({ error: 'Non autorisé' });

  const { data: client } = await supabase.from('clients').select('id').eq('id', clientId).eq('user_id', user.id).maybeSingle();
  if (!client) return res.status(403).json({ error: 'Accès interdit' });

  try {
    const raw = await downloadBuffer(imageUrl);
    const { badgeUrl, nuUrl } = await applyLogoVariants(clientId, raw);
    res.json({ ok: true, badgeUrl, nuUrl });
  } catch (e) {
    console.error('[logo-apply]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Logo Export 4K — retourne le logo en PNG 2048×2048 ──────────────────────
router.get('/brand-identity/logo-export', async (req, res) => {
  const { clientId } = req.query;
  if (!clientId) return res.status(400).json({ error: 'clientId requis' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non autorisé' });
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Non autorisé' });

  const { data: client } = await supabase.from('clients').select('logo_url, name').eq('id', clientId).eq('user_id', user.id).single();
  if (!client?.logo_url) return res.status(404).json({ error: 'Logo introuvable' });

  try {
    const resp = await fetch(client.logo_url);
    if (!resp.ok) throw new Error('Fetch logo failed');
    const raw = Buffer.from(await resp.arrayBuffer());

    const png4k = await sharp(raw)
      .resize(2048, 2048, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const safeName = (client.name || 'logo').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `attachment; filename="${safeName}-logo-4k.png"`);
    res.set('Content-Length', png4k.length);
    res.send(png4k);
  } catch(e) {
    console.error('[logo-export]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
// Pipeline réutilisé par la démo publique de la landing (routes/demo.js)
module.exports.runActuPipeline = runActuPipeline;
module.exports.runCitationPipeline = runCitationPipeline;
module.exports.runDeepDivePipeline = runDeepDivePipeline;
module.exports.assembleDeepDiveBrief = assembleDeepDiveBrief;
module.exports.getClientBrand = getClientBrand;
// Helpers réutilisés par Blaise (lib/blaise/tools.js)
module.exports.applyLogoVariants = applyLogoVariants;
module.exports.serperImages = serperImages;
module.exports.downloadBuffer = downloadBuffer;
