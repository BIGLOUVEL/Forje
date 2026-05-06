const express    = require('express');
const { supabase } = require('../lib/supabase');
const { runAgent3 } = require('./learning');

const router = express.Router();

// ─── POST /api/interactions ───────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const {
    compte_id, news_scored_id, action,
    format_utilise, caption_modifiee, modification_type, temps_passe_secondes,
  } = req.body;

  if (!compte_id || !news_scored_id || !action) {
    return res.status(400).json({ error: 'compte_id, news_scored_id et action sont requis' });
  }

  try {
    const { error } = await supabase.from('interactions').insert({
      compte_id,
      news_scored_id,
      action,
      format_utilise:        format_utilise        ?? null,
      caption_modifiee:      caption_modifiee      ?? null,
      modification_type:     modification_type     ?? null,
      temps_passe_secondes:  temps_passe_secondes  ?? null,
    });
    if (error) throw error;

    // Vérifier si on atteint un multiple de 50 → déclencher Agent 3
    const { count } = await supabase
      .from('interactions')
      .select('*', { count: 'exact', head: true })
      .eq('compte_id', compte_id);

    const trigger = count % 50 === 0 && count > 0;
    if (trigger) {
      runAgent3(compte_id).catch(err => console.error('[Agent 3 auto]', err.message));
    }

    res.json({ ok: true, total_interactions: count, trigger_agent3: trigger });
  } catch (err) {
    console.error('[Interactions]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/interactions/stats — résumé pour Agent 3 ───────────────────────
router.get('/stats', async (req, res) => {
  const { compte_id, limit = 50 } = req.query;
  if (!compte_id) return res.status(400).json({ error: 'compte_id manquant' });

  try {
    const { data, error } = await supabase
      .from('interactions')
      .select('action, format_utilise, caption_modifiee, modification_type, news_scored_id, news_scored(score_total, flag, pourquoi_ce_score)')
      .eq('compte_id', compte_id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    // Agrégats utiles pour Agent 3
    const byAction = data.reduce((acc, r) => {
      acc[r.action] = (acc[r.action] || 0) + 1;
      return acc;
    }, {});

    const opened    = data.filter(r => r.action === 'open');
    const generated = data.filter(r => r.action === 'generate');
    const dismissed = data.filter(r => r.action === 'dismiss');
    const copied    = data.filter(r => r.action === 'copy');

    const avgScoreOpened    = avg(opened.map(r => r.news_scored?.score_total));
    const avgScoreDismissed = avg(dismissed.map(r => r.news_scored?.score_total));

    const formatCounts = generated.reduce((acc, r) => {
      if (r.format_utilise) acc[r.format_utilise] = (acc[r.format_utilise] || 0) + 1;
      return acc;
    }, {});

    res.json({
      total: data.length,
      by_action: byAction,
      avg_score_opened: avgScoreOpened,
      avg_score_dismissed: avgScoreDismissed,
      formats_utilises: formatCounts,
      caption_modifiee_rate: copied.length ? copied.filter(r => r.caption_modifiee).length / copied.length : null,
      raw: data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function avg(nums) {
  const valid = nums.filter(n => n != null);
  return valid.length ? Math.round((valid.reduce((s, n) => s + n, 0) / valid.length) * 10) / 10 : null;
}

module.exports = router;
