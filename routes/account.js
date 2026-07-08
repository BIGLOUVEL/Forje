// routes/account.js
// Zone de danger : export des données (ZIP) et suppression définitive du compte.

const express = require('express');
const { supabase } = require('../lib/supabase');

const router = express.Router();

let JSZip = null;
try { JSZip = require('jszip'); } catch (_) { JSZip = null; }
let Stripe = null;
try { Stripe = require('stripe'); } catch (_) { Stripe = null; }

async function authUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } = {} } = await supabase.auth.getUser(token);
  return user || null;
}

// ─── POST /api/account/export → ZIP {identity.json, posts.json, credits.csv, posts/*} ──
router.post('/export', async (req, res) => {
  if (!JSZip) return res.status(500).json({ error: 'Export indisponible (jszip absent)' });
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { data: clients = [] } = await supabase.from('clients')
      .select('id,name,instagram_handle,logo_url,brand_colors,font_primary,font_body,mood,graphic_style,tone_tags,topics,created_at')
      .eq('user_id', user.id);
    const clientIds = clients.map(c => c.id);

    const { data: posts = [] } = await supabase.from('generated_posts')
      .select('id,client_id,preset_id,title,subtitle,caption,category,created_at,image')
      .eq('user_id', user.id).order('created_at', { ascending: false });

    const { data: tx = [] } = clientIds.length
      ? await supabase.from('credit_transactions').select('*').in('client_id', clientIds).order('created_at', { ascending: false })
      : { data: [] };

    const zip = new JSZip();
    zip.file('identity.json', JSON.stringify({ email: user.email, user_id: user.id, clients }, null, 2));
    zip.file('posts.json', JSON.stringify(posts.map(({ image, ...rest }) => rest), null, 2));

    const csvRows = [['date', 'type', 'variant', 'credits', 'solde_apres'].join(',')];
    for (const t of tx) csvRows.push([t.created_at, t.post_type, t.variant, t.credits_used, t.balance_after].join(','));
    zip.file('credits.csv', csvRows.join('\n'));

    // Images (data URL base64 → fichiers)
    const imgFolder = zip.folder('posts');
    for (const p of posts) {
      if (typeof p.image === 'string' && p.image.startsWith('data:image')) {
        const m = p.image.match(/^data:image\/(\w+);base64,(.+)$/);
        if (m) imgFolder.file(`${p.id}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`, Buffer.from(m[2], 'base64'));
      }
    }

    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="forje-export.zip"');
    res.send(buf);
  } catch (err) {
    console.error('[Account/Export]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/account/delete → suppression définitive ────────────────────────
// Exige confirmName == nom d'une des identités du compte.
router.post('/delete', async (req, res) => {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { confirmName } = req.body || {};
    const { data: clients = [] } = await supabase.from('clients')
      .select('id,name,stripe_subscription_id').eq('user_id', user.id);

    const names = clients.map(c => (c.name || '').trim().toLowerCase());
    if (!confirmName || !names.includes(String(confirmName).trim().toLowerCase())) {
      return res.status(400).json({ error: 'Le nom saisi ne correspond pas à ton média.' });
    }

    // 1. Annule les abonnements Stripe actifs
    if (Stripe && process.env.STRIPE_SECRET_KEY) {
      const stripe = Stripe((process.env.STRIPE_SECRET_KEY || '').trim());
      for (const c of clients) {
        if (c.stripe_subscription_id) {
          try { await stripe.subscriptions.cancel(c.stripe_subscription_id); }
          catch (e) { console.warn('[Account/Delete] stripe cancel:', e.message); }
        }
      }
    }

    // 2. Fichiers Storage (best-effort) : {userId}/ et avatars/{userId}/
    for (const prefix of [user.id, `avatars/${user.id}`]) {
      try {
        const { data: files } = await supabase.storage.from('brand-assets').list(prefix, { limit: 1000 });
        if (files && files.length) {
          await supabase.storage.from('brand-assets')
            .remove(files.map(f => `${prefix}/${f.name}`));
        }
      } catch (e) { console.warn('[Account/Delete] storage:', e.message); }
    }

    // 3. Rows (ordre FK : transactions → posts → clients)
    const clientIds = clients.map(c => c.id);
    if (clientIds.length) await supabase.from('credit_transactions').delete().in('client_id', clientIds);
    await supabase.from('generated_posts').delete().eq('user_id', user.id);
    await supabase.from('clients').delete().eq('user_id', user.id);

    // 4. Utilisateur auth
    try { await supabase.auth.admin.deleteUser(user.id); }
    catch (e) { console.warn('[Account/Delete] auth:', e.message); }

    res.json({ ok: true });
  } catch (err) {
    console.error('[Account/Delete]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
