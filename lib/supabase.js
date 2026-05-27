require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

// Strip BOM (﻿) ajouté par certains outils Windows lors de l'injection des env vars
const clean = (s) => (s || '').replace(/^﻿/, '').trim();

const supabase = createClient(
  clean(process.env.SUPABASE_URL),
  clean(process.env.SUPABASE_SERVICE_KEY)
);

module.exports = { supabase };
