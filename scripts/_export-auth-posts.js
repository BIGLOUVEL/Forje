// One-shot : exporte des posts générés (generated_posts.image = data URI base64)
// vers des fichiers pour inspection / assets auth. Usage : node scripts/_export-auth-posts.js
const fs = require('fs');
const path = require('path');
const { supabase } = require('../lib/supabase');

// [id, fichier de sortie]
const JOBS = process.argv[2] === 'final'
  ? [
      // Sélection finale (posts démo réels sortis du pipeline Forje)
      ['21a5debb-0f94-4bec-9d8e-c9d97108da6b', 'post-demo-1.jpg'], // Ballon Bleu · SPORT · "BRÉSIL : LE CHAOS TOTAL"
      ['c9eacd99-4961-4a82-94b4-212e4e27811e', 'post-demo-2.jpg'], // FRAME · CULTURE · "DONKEY KONG ÉCRASE TOUT"
    ]
  : [
      ['88c9e375-7049-4209-b47c-ee8031aedacc', 'cand-bb-olise.jpg'],
      ['21a5debb-0f94-4bec-9d8e-c9d97108da6b', 'cand-bb-bresil.jpg'],
      ['30aa43ca-8f25-475f-9e93-ed2c97e2acfd', 'cand-bb-seisme.jpg'],
      ['529ebfe3-a671-4806-b614-06420856f2c8', 'cand-bb-mbappe.jpg'],
      ['c9eacd99-4961-4a82-94b4-212e4e27811e', 'cand-fr-donkey.jpg'],
      ['89f83b8f-337d-49ff-a96a-a4d3ab28c034', 'cand-fr-iran.jpg'],
    ];

const OUT = process.argv[3] || path.join(require('os').tmpdir(), 'auth-cand');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  for (const [id, name] of JOBS) {
    const { data, error } = await supabase.from('generated_posts').select('image').eq('id', id).maybeSingle();
    if (error || !data || !data.image) { console.log('SKIP', id, error?.message || 'no image'); continue; }
    const m = /^data:image\/\w+;base64,(.+)$/s.exec(data.image);
    const b64 = m ? m[1] : data.image;
    fs.writeFileSync(path.join(OUT, name), Buffer.from(b64, 'base64'));
    console.log('OK', name);
  }
  console.log('DONE →', OUT);
})();
