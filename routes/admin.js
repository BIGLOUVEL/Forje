const express    = require('express');
const { supabase } = require('../lib/supabase');

const router = express.Router();
const ADMIN_CODE = 'EARLYADOPTER';

// Middleware auth par code
function requireAdmin(req, res, next) {
  const code = req.headers['x-admin-code'] || req.query.code;
  if (code !== ADMIN_CODE) return res.status(401).json({ error: 'Non autorisé' });
  next();
}

// GET /api/admin/costs?period=7d|30d|all
router.get('/costs', requireAdmin, async (req, res) => {
  const { period = '30d' } = req.query;

  const since = period === 'all' ? null
    : period === '7d'  ? new Date(Date.now() - 7  * 86400000).toISOString()
    : new Date(Date.now() - 30 * 86400000).toISOString();

  try {
    let q = supabase.from('api_costs').select('*').order('created_at', { ascending: false });
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q.limit(2000);
    if (error) throw error;

    // Agrégats
    const totalUsd = data.reduce((s, r) => s + parseFloat(r.cost_usd || 0), 0);

    const byFeature = data.reduce((acc, r) => {
      if (!acc[r.feature]) acc[r.feature] = { calls: 0, cost: 0, input_tokens: 0, output_tokens: 0 };
      acc[r.feature].calls++;
      acc[r.feature].cost         += parseFloat(r.cost_usd || 0);
      acc[r.feature].input_tokens += r.input_tokens || 0;
      acc[r.feature].output_tokens += r.output_tokens || 0;
      return acc;
    }, {});

    const byDay = data.reduce((acc, r) => {
      const day = r.created_at.slice(0, 10);
      if (!acc[day]) acc[day] = 0;
      acc[day] += parseFloat(r.cost_usd || 0);
      return acc;
    }, {});

    res.json({ total_usd: totalUsd, by_feature: byFeature, by_day: byDay, rows: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
