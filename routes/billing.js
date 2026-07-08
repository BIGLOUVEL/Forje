// routes/billing.js
// Facturation Forje Studio — un seul plan (69€/mois, 700 crédits).
//   POST /api/billing/create-checkout  → crée une session Stripe Checkout
//   POST /api/billing/webhook          → reçoit les events Stripe (raw body, voir server.js)
//
// Le webhook est monté AVANT express.json() dans server.js (express.raw) car la
// vérification de signature Stripe exige le corps brut de la requête.

const express = require('express');
const { supabase } = require('../lib/supabase');
const { PLAN } = require('../lib/credits');

// Init paresseuse : le serveur ne doit pas crasher si Stripe n'est pas encore configuré.
let stripe = null;
function getStripe() {
  if (stripe) return stripe;
  const key = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return null;
  stripe = require('stripe')(key);
  return stripe;
}

const router = express.Router();

// ─── POST /api/billing/create-checkout ────────────────────────────────────────
router.post('/create-checkout', async (req, res) => {
  const s = getStripe();
  if (!s) return res.status(503).json({ error: 'Paiement non configuré (STRIPE_SECRET_KEY manquant)' });

  const priceId = (process.env.STRIPE_PRICE_ID || '').trim();
  if (!priceId) return res.status(503).json({ error: 'STRIPE_PRICE_ID manquant' });

  try {
    // Auth : le token Supabase de l'utilisateur connecté
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { data: { user } = {} } = token ? await supabase.auth.getUser(token) : {};
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'clientId manquant' });

    // Le client doit appartenir à l'utilisateur
    const { data: client } = await supabase
      .from('clients').select('id, stripe_customer_id')
      .eq('id', clientId).eq('user_id', user.id).single();
    if (!client) return res.status(403).json({ error: 'Forbidden' });

    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/?checkout=success`,
      cancel_url:  `${appUrl}/?checkout=cancel`,
      customer:       client.stripe_customer_id || undefined,
      customer_email: client.stripe_customer_id ? undefined : user.email,
      client_reference_id: clientId,
      metadata: { clientId },
      subscription_data: { metadata: { clientId } },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Billing/Checkout]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/billing/create-portal ─────────────────────────────────────────
// Stripe Customer Portal : moyen de paiement, factures PDF, annulation — géré
// entièrement par Stripe. Une seule route suffit.
router.post('/create-portal', async (req, res) => {
  const s = getStripe();
  if (!s) return res.status(503).json({ error: 'Paiement non configuré (STRIPE_SECRET_KEY manquant)' });

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { data: { user } = {} } = token ? await supabase.auth.getUser(token) : {};
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'clientId manquant' });

    const { data: client } = await supabase
      .from('clients').select('stripe_customer_id')
      .eq('id', clientId).eq('user_id', user.id).single();
    if (!client) return res.status(403).json({ error: 'Forbidden' });
    if (!client.stripe_customer_id) return res.status(400).json({ error: 'Aucun abonnement actif' });

    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
    const session = await s.billingPortal.sessions.create({
      customer: client.stripe_customer_id,
      return_url: `${appUrl}/?screen=settings#billing`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[Billing/Portal]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/billing/webhook (raw body — monté avant express.json) ──────────
async function webhook(req, res) {
  const s = getStripe();
  if (!s) return res.status(503).json({ error: 'Stripe non configuré' });

  const whSecret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    // req.body est un Buffer (express.raw) — requis pour la vérif de signature
    event = s.webhooks.constructEvent(req.body, sig, whSecret);
  } catch (err) {
    console.error('[Billing/Webhook] signature invalide:', err.message);
    return res.status(400).json({ error: 'Signature invalide' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const sess = event.data.object;
        const clientId = sess.metadata?.clientId || sess.client_reference_id;
        if (clientId) {
          await supabase.from('clients').update({
            stripe_customer_id:     sess.customer,
            stripe_subscription_id: sess.subscription,
            subscription_status:    'active',
            plan:                   'forje_studio',
            credits:                PLAN.monthlyCredits,   // 700 à l'abonnement
            credits_reset_at:       new Date().toISOString(),
          }).eq('id', clientId);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        // Renouvellement mensuel → reset des crédits à 700
        await supabase.rpc('reset_monthly_credits', {
          p_stripe_customer: event.data.object.customer,
        });
        // Re-active si on venait de past_due
        await supabase.from('clients')
          .update({ subscription_status: 'active' })
          .eq('stripe_customer_id', event.data.object.customer);
        break;
      }

      case 'customer.subscription.deleted': {
        await supabase.from('clients')
          .update({ subscription_status: 'canceled' })
          .eq('stripe_customer_id', event.data.object.customer);
        break;
      }

      case 'invoice.payment_failed': {
        await supabase.from('clients')
          .update({ subscription_status: 'past_due' })
          .eq('stripe_customer_id', event.data.object.customer);
        break;
      }
    }
  } catch (err) {
    console.error('[Billing/Webhook] traitement:', err.message);
    // On répond quand même 200 : l'event a été reçu, Stripe ne doit pas rejouer en boucle
    // sur une erreur DB transitoire côté nous.
  }

  res.json({ received: true });
}

module.exports = { router, webhook };
