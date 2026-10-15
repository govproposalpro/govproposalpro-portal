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
const authRouter = require('./app/routes/auth');
const { router: bidsRouter } = require('./app/routes/bids');
const { router: aiRouter, failInterruptedJobs } = require('./app/routes/ai');
const { sameOrigin } = require('./app/session');

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

// Dashboard API. Responses are per-member, so never cache them anywhere.
app.use(['/api/auth', '/api/me', '/api/bids', '/api/decryptor', '/api/proposals'], sameOrigin, (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api', authRouter);
app.use('/api', bidsRouter);
app.use('/api', aiRouter);

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { maxAge: '7d', index: false }));

// Served at both / and /access so the page works on a custom domain path too.
app.get(['/', '/access'], (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(indexHtml);
});

// The dashboard: a static single-page app. Its scripts and styles are files on this origin, so
// the same strict CSP applies (no inline code, no third-party scripts).
const APP_DIR = path.join(PUBLIC_DIR, 'app');
const appHtml = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
app.use('/app/static', express.static(path.join(APP_DIR, 'static'), { maxAge: '1h', index: false }));
app.get(['/app', '/app/*'], (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(appHtml);
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
app.listen(port, () => console.log(`GovProposalPro listening on :${port}`));

const sweep = () => failInterruptedJobs().catch((err) => console.error('[jobs] sweep failed:', err.message));
setInterval(sweep, 5 * 60 * 1000).unref();
sweep();
