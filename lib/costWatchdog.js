const { supabase } = require('./supabase');

// ─── Watchdog de coûts API ────────────────────────────────────────────────────
// Tourne toutes les heures (voir server.js). Trois vigies :
//   1. Budget Anthropic/jour dépassé  → les crédits Claude partent trop vite
//   2. Solde OpenRouter trop bas      → le fallback Haiku va se déclencher
//   3. Fallback Haiku actif sur le scoring → OpenRouter est down quelque part
// Chaque alerte est loggée en console ET insérée dans cost_alerts (visible
// dans /admin), au plus une fois par jour et par type.

const BUDGET_ANTHROPIC_JOUR = parseFloat(process.env.BUDGET_ANTHROPIC_JOUR_USD || '3');
const BUDGET_TOTAL_JOUR     = parseFloat(process.env.BUDGET_TOTAL_JOUR_USD     || '6');
const OPENROUTER_SOLDE_MIN  = parseFloat(process.env.OPENROUTER_SOLDE_MIN_USD  || '2');
const FALLBACK_SCORING_MAX  = 5; // appels Haiku/jour tolérés sur le scoring (transitoires)

async function getOpenRouterBalance() {
  if (!process.env.OPENROUTER_API_KEY) return null;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const { data } = await res.json();
    return Math.round((data.total_credits - data.total_usage) * 100) / 100;
  } catch {
    return null;
  }
}

// Dépenses du jour (UTC) ventilées par provider + détection fallback scoring
async function getTodaySpend() {
  const { data, error } = await supabase
    .from('api_costs')
    .select('feature, model, cost_usd')
    .gte('created_at', new Date().toISOString().slice(0, 10));
  if (error) throw error;

  let anthropic = 0, openrouter = 0, autres = 0, fallbackScoringCalls = 0;
  for (const r of (data || [])) {
    const cost = Number(r.cost_usd) || 0;
    if (r.model?.startsWith('claude') || r.model === 'web_search') {
      anthropic += cost;
      if (r.feature === 'scoring' && r.model?.startsWith('claude')) fallbackScoringCalls += 1;
    } else if (r.model?.includes('/')) {
      openrouter += cost;
    } else {
      autres += cost;
    }
  }
  const round = (n) => Math.round(n * 100) / 100;
  return {
    anthropic: round(anthropic),
    openrouter: round(openrouter),
    autres: round(autres),
    total: round(anthropic + openrouter + autres),
    fallbackScoringCalls,
  };
}

// Une alerte max par type et par jour
async function alertOncePerDay(type, message, value, threshold) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('cost_alerts').select('id')
    .eq('type', type).gte('created_at', today).limit(1);
  if (data?.length) return false;

  console.error(`[Coûts] 🚨 ALERTE ${type} : ${message}`);
  await supabase.from('cost_alerts').insert({ type, message, value, threshold });
  return true;
}

async function runCostWatchdog(getBreakerState) {
  try {
    const [spend, orBalance] = await Promise.all([getTodaySpend(), getOpenRouterBalance()]);

    console.log(
      `[Coûts] Aujourd'hui : ${spend.total.toFixed(2)} $ ` +
      `(Anthropic ${spend.anthropic.toFixed(2)} $ · OpenRouter ${spend.openrouter.toFixed(2)} $)` +
      (orBalance != null ? ` — solde OpenRouter : ${orBalance.toFixed(2)} $` : '')
    );

    if (spend.anthropic > BUDGET_ANTHROPIC_JOUR) {
      await alertOncePerDay('budget_anthropic',
        `Dépense Anthropic du jour : ${spend.anthropic.toFixed(2)} $ (budget ${BUDGET_ANTHROPIC_JOUR} $/j). Vérifier le fallback scoring et les features dans /admin.`,
        spend.anthropic, BUDGET_ANTHROPIC_JOUR);
    }
    if (spend.total > BUDGET_TOTAL_JOUR) {
      await alertOncePerDay('budget_total',
        `Dépense API totale du jour : ${spend.total.toFixed(2)} $ (budget ${BUDGET_TOTAL_JOUR} $/j).`,
        spend.total, BUDGET_TOTAL_JOUR);
    }
    if (orBalance != null && orBalance < OPENROUTER_SOLDE_MIN) {
      await alertOncePerDay('openrouter_balance',
        `Solde OpenRouter : ${orBalance.toFixed(2)} $ (seuil ${OPENROUTER_SOLDE_MIN} $). Recharger sur openrouter.ai/settings/credits sinon le scoring bascule sur les crédits Claude.`,
        orBalance, OPENROUTER_SOLDE_MIN);
    }
    if (spend.fallbackScoringCalls > FALLBACK_SCORING_MAX) {
      const breaker = typeof getBreakerState === 'function' ? getBreakerState() : null;
      await alertOncePerDay('fallback_scoring',
        `${spend.fallbackScoringCalls} scorings Haiku aujourd'hui — OpenRouter ne répond plus${breaker?.creditsExhausted ? ' (CRÉDITS OPENROUTER ÉPUISÉS)' : ''}. Le circuit breaker limite la casse mais il faut réparer.`,
        spend.fallbackScoringCalls, FALLBACK_SCORING_MAX);
    }

    return { spend, orBalance };
  } catch (err) {
    console.error('[Coûts] Watchdog en erreur :', err.message);
    return null;
  }
}

// Résumé pour le panneau /admin : 14 jours par provider + aujourd'hui par feature
async function getCostSummary() {
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: rows, error }, orBalance, { data: alerts }] = await Promise.all([
    supabase.from('api_costs').select('created_at, feature, model, cost_usd').gte('created_at', since),
    getOpenRouterBalance(),
    supabase.from('cost_alerts').select('*').order('created_at', { ascending: false }).limit(20),
  ]);
  if (error) throw error;

  const days = {};        // date → { anthropic, openrouter, autres }
  const todayFeatures = {}; // feature → { cost, calls, models: Set }
  for (const r of (rows || [])) {
    const day  = r.created_at.slice(0, 10);
    const cost = Number(r.cost_usd) || 0;
    const provider = (r.model?.startsWith('claude') || r.model === 'web_search') ? 'anthropic'
                   : r.model?.includes('/') ? 'openrouter' : 'autres';
    days[day] = days[day] || { anthropic: 0, openrouter: 0, autres: 0 };
    days[day][provider] += cost;

    if (day === today) {
      todayFeatures[r.feature] = todayFeatures[r.feature] || { cost: 0, calls: 0, models: {} };
      todayFeatures[r.feature].cost  += cost;
      todayFeatures[r.feature].calls += 1;
      todayFeatures[r.feature].models[r.model] = (todayFeatures[r.feature].models[r.model] || 0) + 1;
    }
  }

  return {
    days: Object.entries(days).sort(([a], [b]) => b.localeCompare(a))
      .map(([date, d]) => ({ date, ...d, total: d.anthropic + d.openrouter + d.autres })),
    today_features: Object.entries(todayFeatures)
      .map(([feature, f]) => ({ feature, ...f }))
      .sort((a, b) => b.cost - a.cost),
    openrouter_balance: orBalance,
    alerts: alerts || [],
    budgets: {
      anthropic_jour: BUDGET_ANTHROPIC_JOUR,
      total_jour: BUDGET_TOTAL_JOUR,
      openrouter_solde_min: OPENROUTER_SOLDE_MIN,
    },
  };
}

module.exports = { runCostWatchdog, getCostSummary, getTodaySpend, getOpenRouterBalance };
