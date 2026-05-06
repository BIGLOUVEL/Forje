// Routes consolidated into root server.js — this file just delegates.
// Whether run as `node veille/server.js` or `node server.js`, same process starts.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('../server');
