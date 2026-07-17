// lib/editorialRules.js — la mémoire éditoriale du client.
// Chaque feedback durable ("jamais de points d'exclamation dans les titres")
// devient une règle active, réinjectée dans le system prompt de Blaise ET
// dans tous les prompts des pipelines de génération (titres, briefs, plans,
// captions). Source unique : table client_editorial_rules.

const { supabase } = require('./supabase');

async function fetchEditorialRules(clientId) {
  if (!clientId) return [];
  const { data, error } = await supabase.from('client_editorial_rules')
    .select('rule')
    .eq('client_id', clientId)
    .eq('active', true)
    .order('created_at')
    .limit(30);
  if (error) { console.warn('[EditorialRules]', error.message); return []; }
  return (data || []).map(r => r.rule);
}

// Ligne prête à injecter dans un prompt (vide si aucune règle).
// Accepte le tableau de règles OU un client portant .editorial_rules.
function editorialRulesLine(rulesOrClient) {
  const rules = Array.isArray(rulesOrClient)
    ? rulesOrClient
    : (rulesOrClient && rulesOrClient.editorial_rules) || [];
  if (!rules.length) return '';
  return `\nRÈGLES ÉDITORIALES DU CLIENT (à respecter absolument) : ${rules.join(' · ')}`;
}

module.exports = { fetchEditorialRules, editorialRulesLine };
