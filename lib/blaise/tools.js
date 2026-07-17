// lib/blaise/tools.js
// Les 6 tools de Blaise (directeur artistique IA) + leurs implémentations.
// Crédits : consume_credits AVANT chaque génération, remboursement si échec.
// Le logo appliqué passe par applyLogoVariants (badge rond + nu détouré) pour
// rester compatible avec pickLogoUrl() côté pipelines de posts.

const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { supabase } = require('../supabase');
const { getCreditCost } = require('../credits');

let sharp;
try { sharp = require('sharp'); } catch (_) { sharp = null; }

let openai;
try { openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); } catch (_) {}
const genai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Helpers partagés avec les pipelines de posts (require paresseux : évite tout
// souci d'ordre de chargement, generate.js est déjà dans le cache du serveur).
function gen() { return require('../../routes/generate'); }

// ─── Définitions des tools (schéma Anthropic) ────────────────────────────────

const BLAISE_TOOLS = [
  // Server tool exécuté côté Anthropic (aucune implémentation locale) —
  // Blaise vérifie les faits AVANT de répondre au lieu d'inventer (règles
  // FAITS ET ACTUALITÉ du system prompt). Gratuit en crédits pour le client.
  { type: 'web_search_20250305', name: 'web_search', max_uses: 3 },
  {
    name: 'generate_logo',
    description: "Génère un logo avec GPT-Image-2. Coûte 2 crédits — n'appelle qu'après confirmation explicite du client (coût annoncé). Par défaut : le mark SEUL (aucun texte), décliné fond clair/fond sombre.",
    input_schema: {
      type: 'object',
      properties: {
        brand_name: { type: 'string' },
        niche: { type: 'string' },
        direction: { type: 'string', description: 'direction créative validée en conversation' },
        primary_color: { type: 'string', description: 'hex' },
        secondary_color: { type: 'string' },
        archetype: {
          type: 'string',
          enum: ['monogram', 'pure_symbol', 'symbol_in_letter', 'wordmark', 'badge'],
          description: "l'archétype validé avec le client"
        },
        include_wordmark: {
          type: 'boolean',
          description: 'false par défaut. true UNIQUEMENT si le client a explicitement demandé la version avec le nom écrit.'
        }
      },
      required: ['brand_name', 'niche', 'direction', 'primary_color', 'archetype']
    }
  },
  {
    name: 'edit_image',
    description: "Édite une image existante avec Nano Banana Pro (couleur, épaisseur, retrait d'élément, ajustement de forme). 1 crédit. À préférer à une régénération quand le client aime la base.",
    input_schema: {
      type: 'object',
      properties: {
        image_url: { type: 'string' },
        edit_instruction: { type: 'string', description: 'modification précise, en anglais' }
      },
      required: ['image_url', 'edit_instruction']
    }
  },
  {
    name: 'update_brand_identity',
    description: "Applique des changements VALIDÉS à l'identité (patch partiel). UNIQUEMENT après validation explicite ('on prend', 'c'est bon', 'parfait'). Les générations de posts utiliseront ces valeurs immédiatement. Pour logo_url, passe l'image_url retournée par generate_logo/edit_image.",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        logo_url: { type: 'string' },
        brand_colors: { type: 'array', items: { type: 'string' } },
        font_primary: { type: 'string' },
        mood: { type: 'string', enum: ['dramatique', 'energique', 'premium', 'populaire', 'factuel'] },
        graphic_style: { type: 'string' },
        tone_tags: { type: 'array', items: { type: 'string' } },
        tagline: { type: 'string' }
      }
    }
  },
  {
    name: 'save_strategy',
    description: "Sauvegarde la stratégie réseaux validée. Exploité ensuite par le Deep Dive et la veille.",
    input_schema: {
      type: 'object',
      properties: {
        target_audience: { type: 'string', description: 'une phrase : [qui] qui veulent [quoi] sans [friction]' },
        content_pillars: { type: 'array', items: { type: 'string' }, description: '3-5 piliers' },
        posting_frequency: { type: 'string' },
        format_mix: { type: 'string', description: 'ex: 60% actu, 25% citation, 15% deep dive' },
        positioning: { type: 'string', description: '"le seul média qui..."' }
      },
      required: ['target_audience', 'content_pillars']
    }
  },
  {
    name: 'get_brand_identity',
    description: "Relit l'identité actuelle en base.",
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'search_references',
    description: "Cherche des images de référence (Serper) pour montrer des inspirations. Gratuit. À utiliser AVANT de générer pour calibrer le goût du client.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    }
  },
  {
    name: 'save_editorial_rule',
    description: "Mémorise une préférence éditoriale durable exprimée par le client (ton, interdits, style de titres, choix récurrents). À appeler quand le client formule un retour qui devrait s'appliquer À TOUS les contenus futurs — pas pour une correction ponctuelle. Uniquement avec l'accord du client.",
    input_schema: {
      type: 'object',
      properties: { rule: { type: 'string', description: 'la règle, formulée courte et actionnable' } },
      required: ['rule']
    }
  },
  {
    name: 'schedule_post',
    description: "Planifie un post généré dans le calendrier du client. post_id = le postId retourné par generate_post. scheduled_at = date/heure ISO 8601 (fuseau Europe/Paris). Gratuit.",
    input_schema: {
      type: 'object',
      properties: {
        post_id: { type: 'string' },
        scheduled_at: { type: 'string', description: 'ISO 8601, ex 2026-08-12T09:00:00+02:00' }
      },
      required: ['post_id', 'scheduled_at']
    }
  },
  {
    name: 'generate_post',
    description: "Génère un post Forje complet (le même pipeline que le studio). À n'appeler QU'après validation explicite de l'idée ET annonce du coût. Le brief doit être complet — pour un deep_dive, fournis dans structured_brief la structure que tu as designée en conversation. Coûts : actu 2 cr, citation 1 cr, deep_dive light 3 cr / premium 8 cr.",
    // cache_control sur le DERNIER tool → tout le tableau tools est mis en
    // cache (préfixe stable d'un tour à l'autre, ~90% d'économie dessus).
    cache_control: { type: 'ephemeral' },
    input_schema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['actu', 'citation', 'deep_dive'] },
        // ACTU :
        news_text: { type: 'string', description: "l'actu, factuelle et sourcée par tes recherches" },
        // CITATION :
        quote_text: { type: 'string' },
        author_name: { type: 'string' },
        author_title: { type: 'string' },
        // DEEP DIVE :
        topic: { type: 'string' },
        variant: { type: 'string', enum: ['light', 'premium'] },
        slide_count: { type: 'integer', minimum: 7, maximum: 10 },
        structured_brief: {
          type: 'object',
          description: 'la structure designée en conversation',
          properties: {
            subject: { type: 'string' },
            angle: { type: 'string' },
            hook_suggestion: { type: 'string' },
            key_facts: { type: 'array', items: { type: 'string' } },
            open_questions: { type: 'array', items: { type: 'string' } },
            tone_note: { type: 'string' }
          }
        }
      },
      required: ['format']
    }
  }
];

// ─── Crédits ──────────────────────────────────────────────────────────────────

async function chargeBlaiseCredits(clientId, postType, variant = null) {
  const cost = getCreditCost(postType, variant || 'light');
  const { data, error } = await supabase.rpc('consume_credits', {
    p_client_id: clientId, p_amount: cost, p_post_id: null,
    p_post_type: postType, p_variant: variant,
  });
  if (error) { console.error('[Blaise/credits] consume:', error.message); return { ok: true, cost, charged: false }; }
  if (data === -1) return { ok: false, cost, charged: false };
  return { ok: true, cost, balance: data, charged: true };
}

async function refundBlaiseCredits(clientId, postType, ctx) {
  if (!ctx || !ctx.charged) return;
  try {
    await supabase.rpc('consume_credits', {
      p_client_id: clientId, p_amount: -ctx.cost, p_post_id: null,
      p_post_type: postType, p_variant: 'refund',
    });
  } catch (e) { console.error('[Blaise/credits] refund:', e.message); }
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const BUCKET = 'brand-assets';

async function uploadBlaiseAsset(clientId, name, buf) {
  const path = `blaise/${clientId}/${name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: 'image/png', upsert: true });
  if (error) throw new Error(`Upload ${name} échoué: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Retrouve le chemin storage depuis une URL publique du bucket (null si externe)
function storagePathFromUrl(url) {
  const m = String(url || '').split(`/${BUCKET}/`);
  return m.length > 1 ? decodeURIComponent(m[1].split('?')[0]) : null;
}

async function downloadFromStorage(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

// Archive les fichiers logo actuels du client AVANT remplacement — jamais
// d'écrasement destructif (checklist Blaise).
async function archiveCurrentLogo(client) {
  const ts = Date.now();
  const urls = [client.logo_url, client.logo_badge_url, client.logo_nu_url].filter(Boolean);
  for (const url of [...new Set(urls)]) {
    const from = storagePathFromUrl(url);
    if (!from) continue;
    const base = from.split('/').pop();
    try {
      const { error } = await supabase.storage.from(BUCKET)
        .copy(from, `blaise/${client.id}/archive/${ts}-${base}`);
      if (error) console.warn('[Blaise/archive]', error.message);
    } catch (e) { console.warn('[Blaise/archive]', e.message); }
  }
}

// ─── generate_logo — GPT-Image-2, clause anti-texte OBLIGATOIRE ──────────────

const ANTI_TEXT = (archetype, monogramChars) =>
  archetype === 'monogram' || archetype === 'symbol_in_letter'
    ? `The ONLY letterform allowed is the monogram character(s) "${monogramChars}" as a designed shape — no other text of any kind. No labels, no annotations, no taglines, no brand name written anywhere, no watermarks.`
    : `ABSOLUTELY NO TEXT: no words, no letters, no labels, no annotations, no taglines, no brand name written anywhere, no watermarks, no captions. The image contains ONLY the logo mark itself.`;

const ARCHETYPE_MODIFIERS = {
  monogram: 'single bold lettermark, solid color block container, extreme simplicity, Swiss design precision',
  pure_symbol: 'abstract geometric symbol, single memorable shape, strong silhouette, zero letterforms',
  symbol_in_letter: 'clever negative space integrating the niche symbol into the letterform, single visual fusion, flat vector',
  wordmark: 'custom tight-tracked wordmark, strong horizontal rhythm, no icon',
  badge: 'contained circular badge mark, minimal line weight variation, athletic heritage style, max 3 elements'
};

// Découpe la zone "mark seul" de la planche générée, pour que l'application du
// logo (update_brand_identity) donne un avatar propre et pas la planche entière.
// layout 'L' = mark en grand à gauche (défaut) · 'Q' = quadrant haut-gauche
// (planche avec wordmark).
async function deriveMarkFromBoard(boardBuf, layout) {
  if (!sharp) return boardBuf;
  try {
    const meta = await sharp(boardBuf).metadata();
    const W = meta.width || 1024, H = meta.height || 1024;
    const region = layout === 'Q'
      ? { left: 0, top: 0, width: Math.round(W * 0.5), height: Math.round(H * 0.5) }
      : { left: 0, top: 0, width: Math.round(W * 0.55), height: H };
    let mark = await sharp(boardBuf).extract(region).png().toBuffer();
    try { mark = await sharp(mark).trim({ threshold: 12 }).png().toBuffer(); } catch (_) {}
    return mark;
  } catch (e) {
    console.warn('[Blaise/mark] crop échoué:', e.message);
    return boardBuf;
  }
}

async function executeGenerateLogo(input, client, clientId) {
  const credit = await chargeBlaiseCredits(clientId, 'blaise_logo');
  if (!credit.ok) return { error: 'insufficient_credits', needed: credit.cost };

  const monogramChars = String(input.brand_name || '').substring(0, 2).toUpperCase();
  const layoutKind = input.include_wordmark ? 'Q' : 'L';

  const layout = input.include_wordmark
    ? `BOARD LAYOUT (single image, neutral background, thin divider lines):
       TOP LEFT: the mark alone. TOP RIGHT: the wordmark "${input.brand_name}".
       BOTTOM LEFT: mark on dark (#0E0E12). BOTTOM RIGHT: mark on light (#F5F5F5).`
    : `BOARD LAYOUT (single image, neutral background):
       CENTER LEFT: the mark alone, large.
       RIGHT COLUMN: the same mark on dark background (#0E0E12) top,
       and on light background (#F5F5F5) bottom. Nothing else.`;

  const prompt = `Professional logo mark for an Instagram media brand.
Niche: ${input.niche}
Creative direction: ${input.direction}
Archetype: ${ARCHETYPE_MODIFIERS[input.archetype] || ARCHETYPE_MODIFIERS.monogram}
Colors: ${input.primary_color}${input.secondary_color ? ' and ' + input.secondary_color : ''} plus black/white only.

${layout}

STYLE RULES (non-negotiable):
- Flat vector, sharp geometric shapes, print-quality, no gradients, no shadows, no 3D, no mockups
- Must be legible at 110px inside a circular avatar crop (nothing essential in corners)
- Consistent geometry: one language of shapes, constant corner radii
${ANTI_TEXT(input.archetype, monogramChars)}`;

  try {
    if (!openai) throw new Error('OpenAI client not initialized');
    const result = await openai.images.generate({
      model: 'gpt-image-2', prompt,
      size: '1024x1024', quality: 'high', output_format: 'png', n: 1,
    });
    let boardBuf;
    if (result.data?.[0]?.b64_json) boardBuf = Buffer.from(result.data[0].b64_json, 'base64');
    else if (result.data?.[0]?.url) boardBuf = await gen().downloadBuffer(result.data[0].url);
    if (!boardBuf) throw new Error('Aucune image retournée par gpt-image-2');

    const ts = Date.now();
    const boardUrl = await uploadBlaiseAsset(clientId, `logo-${ts}-board${layoutKind}.png`, boardBuf);
    // Le mark seul, dérivé tout de suite — c'est lui qui sera appliqué en logo
    const markBuf = await deriveMarkFromBoard(boardBuf, layoutKind);
    await uploadBlaiseAsset(clientId, `logo-${ts}-mark.png`, markBuf);

    return { image_url: boardUrl, credits_spent: credit.cost, credits_left: credit.balance };
  } catch (e) {
    await refundBlaiseCredits(clientId, 'blaise_logo', credit);
    console.error('[Blaise/generate_logo]', e.message);
    return { error: 'generation_failed', message: e.message, refunded: credit.charged };
  }
}

// ─── edit_image — Nano Banana Pro (Gemini image) ─────────────────────────────

async function fetchAsInlineData(imageUrl) {
  const path = storagePathFromUrl(imageUrl);
  const buf = path ? await downloadFromStorage(path) : await gen().downloadBuffer(imageUrl);
  if (!buf) throw new Error('Image source introuvable');
  const mimeType = /\.jpe?g($|\?)/i.test(imageUrl) ? 'image/jpeg'
                 : /\.webp($|\?)/i.test(imageUrl) ? 'image/webp' : 'image/png';
  return { inlineData: { data: buf.toString('base64'), mimeType } };
}

async function executeEditImage(input, client, clientId) {
  const credit = await chargeBlaiseCredits(clientId, 'blaise_edit');
  if (!credit.ok) return { error: 'insufficient_credits', needed: credit.cost };

  try {
    const model = genai.getGenerativeModel({ model: 'gemini-3-pro-image' });
    const sourceImg = await fetchAsInlineData(input.image_url);
    const result = await model.generateContent([
      `Edit this image precisely. ${input.edit_instruction}.
Keep everything else EXACTLY identical — same composition, same style,
same colors except where the edit requires. Flat vector style preserved.
No text added anywhere.`,
      sourceImg,
    ]);
    const parts = result.response?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find(p => p.inlineData && p.inlineData.data);
    if (!imgPart) throw new Error('Aucune image retournée par Nano Banana');
    const editedBuf = Buffer.from(imgPart.inlineData.data, 'base64');

    const ts = Date.now();
    // Si la source est une planche Blaise, on garde la convention -board/-mark
    // pour que update_brand_identity retrouve le mark seul.
    const srcBoard = String(input.image_url).match(/-board([A-Z])\.png/);
    let url;
    if (srcBoard) {
      url = await uploadBlaiseAsset(clientId, `logo-${ts}-board${srcBoard[1]}.png`, editedBuf);
      const markBuf = await deriveMarkFromBoard(editedBuf, srcBoard[1]);
      await uploadBlaiseAsset(clientId, `logo-${ts}-mark.png`, markBuf);
    } else {
      url = await uploadBlaiseAsset(clientId, `edit-${ts}.png`, editedBuf);
    }

    return { image_url: url, credits_spent: credit.cost, credits_left: credit.balance };
  } catch (e) {
    await refundBlaiseCredits(clientId, 'blaise_edit', credit);
    console.error('[Blaise/edit_image]', e.message);
    return { error: 'edit_failed', message: e.message, refunded: credit.charged };
  }
}

// ─── update_brand_identity — le pouvoir d'application ────────────────────────

const IDENTITY_FIELDS = ['name', 'brand_colors', 'font_primary', 'mood', 'graphic_style', 'tone_tags', 'tagline'];

async function executeUpdateIdentity(input, client, clientId) {
  const patch = {};
  for (const k of IDENTITY_FIELDS) {
    if (input[k] !== undefined && input[k] !== null) patch[k] = input[k];
  }

  const applied = Object.keys(patch);

  if (input.logo_url) {
    // ARCHIVER l'ancien logo avant remplacement — jamais d'écrasement destructif
    await archiveCurrentLogo(client);

    // Planche Blaise → on applique le mark seul (fichier sibling -mark.png)
    let logoBuf = null;
    const path = storagePathFromUrl(input.logo_url);
    if (path && /-board[A-Z]\.png$/.test(path)) {
      logoBuf = await downloadFromStorage(path.replace(/-board[A-Z]\.png$/, '-mark.png'));
    }
    if (!logoBuf) {
      logoBuf = path ? await downloadFromStorage(path) : await gen().downloadBuffer(input.logo_url).catch(() => null);
    }
    if (logoBuf) {
      // Badge rond normalisé + logo nu dérivé + update des colonnes logo —
      // même pipeline que la forge : reste compatible pickLogoUrl().
      try {
        await gen().applyLogoVariants(clientId, logoBuf);
        applied.push('logo_url');
      } catch (e) {
        console.error('[Blaise/update] applyLogoVariants:', e.message);
      }
    }
  }

  if (Object.keys(patch).length) {
    const { error } = await supabase.from('clients').update(patch).eq('id', clientId);
    if (error) return { error: 'update_failed', message: error.message };
  }
  return { applied };
}

// ─── save_strategy ────────────────────────────────────────────────────────────

async function executeSaveStrategy(input, clientId) {
  const strategy = {
    target_audience:   input.target_audience,
    content_pillars:   input.content_pillars,
    posting_frequency: input.posting_frequency || null,
    format_mix:        input.format_mix || null,
    positioning:       input.positioning || null,
    saved_at:          new Date().toISOString(),
  };
  const { error } = await supabase.from('clients').update({ strategy }).eq('id', clientId);
  if (error) return { error: 'save_failed', message: error.message };
  return { saved: true, strategy };
}

// ─── get_brand_identity ───────────────────────────────────────────────────────

async function executeGetIdentity(clientId) {
  const { data, error } = await supabase.from('clients')
    .select('name, brand_colors, font_primary, font_body, mood, graphic_style, tone_tags, topics, tagline, logo_url, logo_badge_url, logo_nu_url, logo_style, strategy')
    .eq('id', clientId).maybeSingle();
  if (error || !data) return { error: 'not_found' };
  return data;
}

// ─── search_references — Serper images (gratuit) ─────────────────────────────

async function executeSearchReferences(input) {
  try {
    const imgs = await gen().serperImages(input.query, { hq: false });
    return {
      references: (imgs || []).slice(0, 4).map(img => ({
        image_url: img.imageUrl, title: img.title || '', source: img.link || '',
      })),
    };
  } catch (e) {
    console.error('[Blaise/search_references]', e.message);
    return { error: 'search_failed', message: e.message };
  }
}

// ─── generate_post — le même pipeline que le studio, depuis la conversation ──
// Débit AVANT génération, remboursement si échec (pattern standard). Le
// résultat porte deux niveaux : les champs compacts (postId, title…) qui
// partent dans le tool_result de Claude et la persistance, et `_payload`
// (fonds base64 + texte des slides) réservé au front pour le rendu Canvas —
// routes/blaise.js le retire avant l'envoi à Claude et avant persistance.

async function executeGeneratePost(input, client, clientId) {
  const format = input.format;

  let postType, variant = null;
  if (format === 'actu') {
    postType = 'actu';
    if (!input.news_text) return { error: 'missing_field', field: 'news_text' };
  } else if (format === 'citation') {
    postType = 'citation';
    if (!input.quote_text || !input.author_name) return { error: 'missing_field', field: 'quote_text/author_name' };
  } else if (format === 'deep_dive') {
    postType = 'deep_dive';
    variant = input.variant === 'premium' ? 'premium' : 'light';
    if (!input.topic && !input.structured_brief) return { error: 'missing_field', field: 'topic/structured_brief' };
  } else {
    return { error: 'unknown_format', format };
  }

  const credit = await chargeBlaiseCredits(clientId, postType, variant);
  if (!credit.ok) return { error: 'insufficient_credits', needed: credit.cost };

  try {
    const { generateActu, generateCitation, generateDeepDive } = require('../generation');
    let result;
    if (format === 'actu') {
      result = await generateActu({ client, newsText: input.news_text, save: true });
    } else if (format === 'citation') {
      result = await generateCitation({
        client, quoteText: input.quote_text,
        authorName: input.author_name, authorTitle: input.author_title, save: true,
      });
    } else {
      result = await generateDeepDive({
        client, topic: input.topic, variant,
        slideCount: input.slide_count || 8,
        structuredBrief: input.structured_brief || null,
        save: true,
      });
    }

    const { postId, ...payload } = result;
    return {
      postId,
      format,
      title: payload.title || payload.quoteText || '',
      slide_count: Array.isArray(payload.slides) ? payload.slides.length : undefined,
      caption: String(payload.caption || '').slice(0, 600) || undefined,
      credits_spent: credit.cost,
      credits_left: credit.balance,
      _payload: payload, // fonds + texte → rendu Canvas côté front uniquement
    };
  } catch (e) {
    await refundBlaiseCredits(clientId, postType, credit);
    console.error('[Blaise/generate_post]', e.message);
    return { error: 'generation_failed', message: e.message, refunded: credit.charged };
  }
}

// ─── save_editorial_rule — la mémoire éditoriale ──────────────────────────────

async function executeSaveEditorialRule(input, clientId) {
  const rule = String(input.rule || '').trim().slice(0, 300);
  if (!rule) return { error: 'empty_rule' };
  const { data, error } = await supabase.from('client_editorial_rules')
    .insert({ client_id: clientId, rule, source: 'blaise' })
    .select('id').single();
  if (error) return { error: 'save_failed', message: error.message };
  return { saved: true, rule, rule_id: data.id };
}

// ─── schedule_post — planification calendrier (generated_posts.scheduled_at) ─

async function executeSchedulePost(input, clientId) {
  const when = new Date(input.scheduled_at);
  if (isNaN(when.getTime())) return { error: 'invalid_date', scheduled_at: input.scheduled_at };
  const { data, error } = await supabase.from('generated_posts')
    .update({ scheduled_at: when.toISOString() })
    .eq('id', input.post_id).eq('client_id', clientId)
    .select('id, title, preset_id').maybeSingle();
  if (error) return { error: 'schedule_failed', message: error.message };
  if (!data) return { error: 'post_not_found', post_id: input.post_id };
  return { scheduled: true, postId: data.id, title: data.title, format: data.preset_id, scheduled_at: when.toISOString() };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

async function executeTool(name, input, client, clientId) {
  switch (name) {
    case 'generate_logo':          return executeGenerateLogo(input, client, clientId);
    case 'edit_image':             return executeEditImage(input, client, clientId);
    case 'update_brand_identity':  return executeUpdateIdentity(input, client, clientId);
    case 'save_strategy':          return executeSaveStrategy(input, clientId);
    case 'get_brand_identity':     return executeGetIdentity(clientId);
    case 'search_references':      return executeSearchReferences(input);
    case 'generate_post':          return executeGeneratePost(input, client, clientId);
    case 'save_editorial_rule':    return executeSaveEditorialRule(input, clientId);
    case 'schedule_post':          return executeSchedulePost(input, clientId);
    default: return { error: 'unknown_tool', name };
  }
}

module.exports = { BLAISE_TOOLS, executeTool };
