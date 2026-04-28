const express = require('express');
const https   = require('https');
const zlib    = require('zlib');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const router = express.Router();
const genai  = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

function normalizeHandle(input) {
  let h = String(input).trim().replace(/^@/, '');
  const m = h.match(/instagram\.com\/([^/?#\s]+)/);
  if (m) h = m[1];
  return h.replace(/\/$/, '').split('/')[0].split('?')[0];
}

function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path:     u.pathname + u.search,
      headers:  {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        ...headers,
      },
      timeout: 12000,
    };
    const req = https.request(opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, headers).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const enc = res.headers['content-encoding'];
        if (enc === 'gzip') {
          zlib.gunzip(buf, (e, d) => e ? reject(e) : resolve({ status: res.statusCode, body: d.toString() }));
        } else if (enc === 'deflate') {
          zlib.inflate(buf, (e, d) => e ? reject(e) : resolve({ status: res.statusCode, body: d.toString() }));
        } else {
          resolve({ status: res.statusCode, body: buf.toString() });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function serperSearch(query) {
  const body = JSON.stringify({ q: query, num: 5 });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'google.serper.dev',
      path:     '/search',
      method:   'POST',
      headers:  {
        'X-API-KEY':      process.env.SERPER_API_KEY,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// POST /api/brand/analyze-instagram
router.post('/analyze-instagram', async (req, res) => {
  const { handle: rawHandle } = req.body;
  if (!rawHandle) return res.status(400).json({ error: 'handle manquant' });

  const handle = normalizeHandle(rawHandle);
  if (!handle || handle.length < 1) return res.status(400).json({ error: 'handle invalide' });

  let profileName = handle;
  let profileBio  = '';
  let avatarUrl   = '';

  // 1. Tentative scrape direct Instagram
  try {
    const { status, body } = await fetchUrl('https://www.instagram.com/' + handle + '/');
    if (status === 200) {
      const titleM = body.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
                  || body.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i);
      const descM  = body.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)
                  || body.match(/<meta\s+content="([^"]+)"\s+property="og:description"/i);
      const imgM   = body.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
                  || body.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
      if (titleM) profileName = titleM[1].replace(/\s*[•\|].*/, '').replace('Instagram', '').trim();
      if (descM)  profileBio  = descM[1].replace(/&amp;/g,'&').replace(/&#039;/g,"'").replace(/&quot;/g,'"');
      if (imgM)   avatarUrl   = imgM[1];
    }
  } catch (_) {}

  // 2. Fallback Serper si bio vide
  if (!profileBio && process.env.SERPER_API_KEY) {
    try {
      const data = await serperSearch('site:instagram.com ' + handle);
      const hit  = (data.organic || []).find(r => r.link && r.link.includes(handle));
      if (hit) {
        if (hit.title)   profileName = hit.title.replace(/\s*\(@[^)]+\)/, '').replace('Instagram', '').trim();
        if (hit.snippet) profileBio  = hit.snippet;
      }
    } catch (_) {}
  }

  // 3. Gemini analyse et suggere les champs
  try {
    const model  = genai.getGenerativeModel({ model: 'gemini-2.5-pro' });
    const prompt =
      'Analyse ce profil Instagram et genere les parametres de charte editoriale pour Forje Studio.\n\n' +
      'Compte : @' + handle + '\n' +
      'Nom affiche : ' + profileName + '\n' +
      'Bio : ' + (profileBio || '(non disponible)') + '\n\n' +
      'Retourne UNIQUEMENT ce JSON valide (pas de markdown, pas de commentaires) :\n' +
      '{\n' +
      '  "name": "nom du media ou du compte",\n' +
      '  "mood": "un parmi : dramatique energique premium populaire factuel",\n' +
      '  "graphic_style": "un parmi : impact-news edito-luxe digital-native minimal-power neo-retro",\n' +
      '  "tone_tags": ["mot1", "mot2", "mot3"],\n' +
      '  "topics": ["sujet1", "sujet2", "sujet3", "sujet4", "sujet5"],\n' +
      '  "rationale": "1 phrase expliquant les choix"\n' +
      '}\n\n' +
      'Regles :\n' +
      '- tone_tags : choisir dans Direct Percutant Informatif Premium Populaire Serieux Engage Decale Expert Accessible Emotionnel Factuel Inspirant Provocateur Pedagogue (3 max)\n' +
      '- topics : deduis les sujets couverts depuis la bio, le nom et le handle (3 a 8 sujets precis)\n' +
      '- Si la bio est vide, deduis tout depuis le handle et le nom';

    const result = await model.generateContent(prompt);
    const raw    = result.response.text();

    let suggestions = {};
    try {
      suggestions = JSON.parse(raw.trim());
    } catch (_) {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) try { suggestions = JSON.parse(m[0]); } catch (_) {}
    }

    console.log('[Brand/Instagram] @' + handle + ' analysé — mood:', suggestions.mood, '| topics:', suggestions.topics?.length);
    res.json({ handle, name: profileName, bio: profileBio, avatarUrl, suggestions });

  } catch (err) {
    console.error('[Brand/Instagram]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
