// lib/generation — les pipelines de génération de posts, appelables par les
// routes API (wrappers fins auth + crédits) ET par le tool generate_post de
// Blaise. AUCUNE logique dupliquée : les pipelines vivent dans
// routes/generate.js (avec leurs ~30 helpers Sharp/Serper/IA) et sont
// consommés ici via require paresseux — même pattern que lib/blaise/tools.js.
//
// IMPORTANT (architecture texte/Canvas) : les pipelines composent UNIQUEMENT
// les fonds ; le texte est peint côté client sur Canvas avec la vraie police
// (Sharp/librsvg ignore les @font-face base64). Le champ `image` du post est
// donc null à la création serveur — le front le remplit après rendu Canvas.

const { supabase } = require('../supabase');

function gen() { return require('../../routes/generate'); }

// Persiste le post dans generated_posts (même shape que l'insert du studio,
// app-screens.jsx) et retourne son id. meta conserve les fonds → post éditable.
async function savePost(client, presetId, payload) {
  const { image: _i, bgImage: _b, ...meta } = payload;
  const { data, error } = await supabase.from('generated_posts').insert({
    user_id:   client.user_id,
    client_id: client.id,
    preset_id: presetId,
    title:     payload.title    || null,
    subtitle:  payload.subtitle || null,
    caption:   payload.caption  || null,
    image:     null, // rendu Canvas côté client → le front met à jour ce champ
    category:  payload.category || null,
    pack_id:   payload.packId   || null,
    meta,
  }).select('id').single();
  if (error) throw new Error('Sauvegarde du post échouée: ' + error.message);
  return data.id;
}

// ─── Actu ─────────────────────────────────────────────────────────────────────
async function generateActu({ client, newsText, photoUrl, photoData, imageMode = 'classic', save = false }) {
  const payload = await gen().runActuPipeline(client, { newsText, photoUrl, photoData, imageMode });
  const postId = save ? await savePost(client, 'actu', payload) : null;
  return { postId, ...payload };
}

// ─── Citation ─────────────────────────────────────────────────────────────────
async function generateCitation({ client, quoteText, authorName, authorTitle, photoUrl, photoData, save = false }) {
  const payload = await gen().runCitationPipeline(client, { quoteText, authorName, authorTitle, photoUrl, photoData });
  const withTitle = { ...payload, title: payload.quoteText };
  const postId = save ? await savePost(client, 'citation', withTitle) : null;
  return { postId, ...withTitle };
}

// ─── Deep Dive ────────────────────────────────────────────────────────────────
// structuredBrief (subject/angle/hook_suggestion/key_facts/…) : assemblé en
// texte via assembleDeepDiveBrief — buildDeepDivePlanPrompt sait l'exploiter
// (même format que forge-from-article).
async function generateDeepDive({ client, topic, variant = 'light', slideCount = 8, structuredBrief = null, save = false }) {
  const fullTopic = structuredBrief ? gen().assembleDeepDiveBrief(structuredBrief) : topic;
  if (!fullTopic) throw new Error('topic ou structuredBrief requis');
  const imageMode = variant === 'premium' ? 'hybrid' : 'photo';
  const payload = await gen().runDeepDivePipeline(client, { topic: fullTopic, imageMode, slideCount });
  const withTitle = { ...payload, title: payload.slides?.[0]?.title || fullTopic.split('\n')[0] };
  const postId = save ? await savePost(client, 'deepdive', withTitle) : null;
  return { postId, ...withTitle };
}

module.exports = { generateActu, generateCitation, generateDeepDive, savePost };
