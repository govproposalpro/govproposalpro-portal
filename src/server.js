'use strict';

require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');

const registerRouter = require('./routes/register');
const whopWebhookRouter = require('./routes/whopWebhook');
const { corsForSignup } = require('./cors');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', Number.parseInt(process.env.TRUST_PROXY || '0', 10));

// The page is fully self-contained (see scripts/build-page.js), so CSP allows exactly its own
// inline <script> and <style> blocks by hash and nothing else: no CDNs, no third-party code.
const indexHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
const hashesOf = (tag) =>
  [...indexHtml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map(
    (m) => `'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`
  );

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", ...hashesOf('script')],
        'style-src': ["'self'", ...hashesOf('style')],
        'connect-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
      },
    },
    strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

// Webhook needs the raw body for signature checks, so it is mounted before any JSON parser.
app.use('/api', whopWebhookRouter);
app.use('/api/register', corsForSignup);
app.use('/api', registerRouter);

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { maxAge: '7d', index: false }));

// Served at both / and /access so the page works on a custom domain path too.
app.get(['/', '/access'], (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(indexHtml);
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
  console.error('[server] unhandled error:', err.message);
  return res.status(500).json({ error: 'Internal error.' });
});

const port = Number.parseInt(process.env.PORT || '3000', 10);
app.listen(port, () => console.log(`Credential portal listening on :${port}`));
