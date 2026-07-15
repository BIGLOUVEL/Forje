// lib/credits.js
// Système de crédits Forje Studio — source unique du coût de chaque type de post.
// Le nombre de crédits reflète le coût de revient réel (génération IA >> Serper/Sharp).
// Fichier CommonJS : consommé par le serveur (require) ET exposé au front via window
// (voir le bloc window.FORJE_CREDITS dans index.html qui recopie ces mêmes valeurs).

const CREDIT_COSTS = {
  // ─── Actu : génération IA (GPT-Image) — coût réel ~0,055€ ───
  actu: 2,

  // ─── Citation : Serper + Sharp.js, aucune génération IA — ~0,002€ ───
  citation: 1,

  // ─── Deep Dive léger : fonds Serper + Sharp.js sur les slides — ~0,017€ ───
  deep_dive_light: 3,

  // ─── Deep Dive premium : slides générées en IA — ~0,30€, protège la marge ───
  deep_dive_premium: 8,

  // ─── Forge de logo : 3 propositions GPT-Image haute qualité — ~0,25€ ───
  logo_forge: 6,
};

// Retourne le coût en crédits pour un type de post donné.
// postType : 'actu' | 'citation' | 'deep_dive'
// variant  : 'light' | 'premium' (uniquement pour deep_dive)
function getCreditCost(postType, variant = 'light') {
  if (postType === 'actu') return CREDIT_COSTS.actu;
  if (postType === 'citation') return CREDIT_COSTS.citation;
  if (postType === 'logo_forge') return CREDIT_COSTS.logo_forge;
  if (postType === 'deep_dive') {
    return variant === 'premium'
      ? CREDIT_COSTS.deep_dive_premium
      : CREDIT_COSTS.deep_dive_light;
  }
  return 1; // fallback sécurité
}

// Le Deep Dive est "premium" (slides générées en IA) dès que l'imageMode
// déclenche une génération. Sinon c'est du léger (fonds Serper / aucun fond).
function deepDiveVariant(imageMode) {
  return imageMode === 'genai' || imageMode === 'hybrid' ? 'premium' : 'light';
}

const PLAN = {
  name: 'Forje Studio',
  price: 69,                // €/mois
  monthlyCredits: 700,
  trialCredits: 50,
  currency: 'eur',
  stripePriceId: process.env.STRIPE_PRICE_ID || 'price_XXXXX',
};

module.exports = { CREDIT_COSTS, getCreditCost, deepDiveVariant, PLAN };
