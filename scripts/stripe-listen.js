// Dev only : forwarde les webhooks Stripe vers le serveur local.
// Lance : npm run stripe:listen  (le serveur doit tourner sur PORT)
require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

const key = (process.env.STRIPE_SECRET_KEY || '').trim();
if (!key) { console.error('STRIPE_SECRET_KEY manquant dans .env'); process.exit(1); }

const port = process.env.PORT || 3001;
const bin = path.join(__dirname, '..', 'tools', 'stripe.exe');

const child = spawn(bin, [
  'listen',
  '--api-key', key,
  '--forward-to', `localhost:${port}/api/billing/webhook`,
], { stdio: 'inherit' });

child.on('exit', (code) => process.exit(code ?? 0));
