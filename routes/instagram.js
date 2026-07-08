// routes/instagram.js
// Squelette OAuth Meta / Instagram Graph API.
// Tant que INSTAGRAM_CONNECT_ENABLED !== 'true', toutes les routes renvoient 501.
// Le schéma clients.instagram_* est déjà prêt : activer le flag suffira, zéro refonte.

const express = require('express');
const { supabase } = require('../lib/supabase');

const router = express.Router();

const ENABLED = () => (process.env.INSTAGRAM_CONNECT_ENABLED || '').trim() === 'true';
function guard(res) {
  if (ENABLED()) return false;
  res.status(501).json({ error: 'Connexion Instagram bientôt disponible', enabled: false });
  return true;
}

// Expose l'état du flag au front (pour rendre le bouton disabled + badge BIENTÔT)
router.get('/status', (req, res) => res.json({ enabled: ENABLED() }));

// GET /api/instagram/connect → redirigera vers l'OAuth Meta
router.get('/connect', async (req, res) => {
  if (guard(res)) return;
  // TODO Meta OAuth : construire l'URL d'autorisation Instagram Graph et rediriger.
  res.status(501).json({ error: 'OAuth Meta non implémenté' });
});

// GET /api/instagram/callback → échangera le code contre un token longue durée
router.get('/callback', async (req, res) => {
  if (guard(res)) return;
  // TODO : échanger req.query.code → token longue durée, stocker (chiffré) dans clients.instagram_*
  res.status(501).json({ error: 'OAuth Meta non implémenté' });
});

// POST /api/instagram/disconnect → révoque le lien
router.post('/disconnect', async (req, res) => {
  if (guard(res)) return;
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { data: { user } = {} } = token ? await supabase.auth.getUser(token) : {};
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { clientId } = req.body;
    await supabase.from('clients').update({
      instagram_connected: false, instagram_user_id: null, instagram_username: null,
      instagram_access_token: null, instagram_token_expires_at: null,
    }).eq('id', clientId).eq('user_id', user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
