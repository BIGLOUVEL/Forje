const { supabase } = require('./supabase');

// ─── Pricing par modèle (USD / million tokens) ───────────────────────────────
const PRICING = {
  'claude-haiku-4-5-20251001': { input: 1.00,  output: 5.00  },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
  'claude-opus-4-7':           { input: 5.00,  output: 25.00 },
  // Modèles scoring via OpenRouter (ids OpenRouter)
  'google/gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'google/gemini-2.5-flash':      { input: 0.30, output: 2.50 },
  'openai/gpt-4o-mini':           { input: 0.15, output: 0.60 },
  'deepseek/deepseek-chat':       { input: 0.27, output: 1.10 },
  'gemini-2.5-pro':            { input: 1.25,  output: 10.00 },
  'gemini-pro-latest':         { input: 1.25,  output: 10.00 }, // alias auto-mis-à-jour (remplace 2.5-pro retiré)
  'gemini-2.0-flash':          { input: 0.10,  output: 0.40  },
  'gpt-4o':                    { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':               { input: 0.15,  output: 0.60  },
  'web_search':                { flat: 0.01   }, // ~$10/1000 searches
};

function calcCost(model, inputTokens = 0, outputTokens = 0) {
  const p = PRICING[model];
  if (!p) return 0;
  if (p.flat) return p.flat;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

async function track({ feature, model, inputTokens = 0, outputTokens = 0, costUsd = null, compteId = null, meta = null }) {
  // costUsd explicite (ex: usage.cost d'OpenRouter) prioritaire sur le calcul par grille
  const cost = (typeof costUsd === 'number' && costUsd >= 0) ? costUsd : calcCost(model, inputTokens, outputTokens);
  try {
    await supabase.from('api_costs').insert({
      feature,
      model,
      input_tokens:  inputTokens,
      output_tokens: outputTokens,
      cost_usd:      cost,
      compte_id:     compteId || null,
      meta:          meta || null,
    });
  } catch (err) {
    console.error('[CostTracker]', err.message);
  }
  return cost;
}

module.exports = { track, calcCost };
