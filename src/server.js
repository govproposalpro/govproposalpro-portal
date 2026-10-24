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
const { router: profileRouter } = require('./app/routes/profile');
const { router: extrasRouter } = require('./app/routes/extras');
const { router: toolsRouter } = require('./app/routes/tools');
const { router: aiJobsRouter } = require('./app/routes/aijobs');
const { publicRouter: winsPublicRouter } = require('./app/wins');
const adminAuthRouter = require('./admin/routes/auth');
const adminManageRouter = require('./admin/routes/manage');
const { sameOrigin } = require('./app/session');
const { runAlertJob } = require('./app/alerts');

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
app.use('/api', winsPublicRouter);

// Dashboard API. Responses are per-member, so never cache them anywhere.
app.use(['/api/auth', '/api/me', '/api/bids', '/api/decryptor', '/api/proposals', '/api/capability-statements',
  '/api/vetting', '/api/alerts', '/api/admin', '/api/subs', '/api/foia', '/api/pricing', '/api/milestones', '/api/invoices',
  '/api/legal', '/api/states', '/api/pulse', '/api/matchmaker', '/api/vendors', '/api/jobs'], sameOrigin, (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api', authRouter);
app.use('/api', profileRouter);
app.use('/api', bidsRouter);
app.use('/api', aiRouter);
app.use('/api', extrasRouter);
app.use('/api', toolsRouter);
app.use('/api', aiJobsRouter);
app.use('/api', adminAuthRouter);
app.use('/api', adminManageRouter);

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { maxAge: '7d', index: false }));
app.get('/favicon.ico', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'assets', 'gpp-favicon.png'), { maxAge: '7d' }));

// The marketing site (landing page). Its CSS and JS are files on this origin, like the dashboard.
const SITE_DIR = path.join(PUBLIC_DIR, 'site');
// Buy buttons point at the Whop checkout pages: one-time purchase, then the monthly access plan.
// Env vars override the defaults if the products move.
const checkoutUrl = (name, fallback) => {
  const v = (process.env[name] || '').trim();
  return /^https:\/\/[^\s"'<>]+$/.test(v) ? v : fallback;
};
const siteHtml = fs.readFileSync(path.join(SITE_DIR, 'index.html'), 'utf8')
  .replaceAll('__CTA_URL__', checkoutUrl('SITE_CTA_URL', '#editions'))
  .replaceAll('__CORE_URL__', checkoutUrl('WHOP_CORE_CHECKOUT_URL', 'https://whop.com/contractbros/contract-bros-govproposalpro-operator-pay-in-full/'))
  .replaceAll('__ENTERPRISE_URL__', checkoutUrl('WHOP_ENTERPRISE_CHECKOUT_URL', 'https://whop.com/contractbros/contract-bros-govproposalpro-operator-pay-in-full-72/'))
  .replaceAll('__CORE_ACCESS_URL__', checkoutUrl('WHOP_CORE_ACCESS_URL', 'https://whop.com/contractbros/contract-bros-govproposalpro-core-maintenance/'))
  .replaceAll('__ENTERPRISE_ACCESS_URL__', checkoutUrl('WHOP_ENTERPRISE_ACCESS_URL', 'https://whop.com/contractbros/contract-bros-govproposalpro-operator-maintenance/'));
app.use('/site/static', express.static(path.join(SITE_DIR, 'static'), { maxAge: '1h', index: false }));

// Terms and Privacy. The legal name, governing state and contact email come from the environment.
const htmlText = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const legalState = (process.env.LEGAL_STATE || '').trim() || 'Ohio';
const supportEmail = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(process.env.SUPPORT_EMAIL || '') ? process.env.SUPPORT_EMAIL.trim() : 'contact@govproposalpro.com';
const legalPage = (name) => fs.readFileSync(path.join(SITE_DIR, `${name}.html`), 'utf8')
  .replaceAll('__ENTITY__', htmlText((process.env.LEGAL_ENTITY || '').trim() || 'Valor Innovation Management & Consulting, doing business as GovProposal Pro'))
  .replaceAll('__GOVLAW__', legalState ? `the State of ${htmlText(legalState)}` : 'the state in which the company is organized')
  .replaceAll('__EMAIL__', htmlText(supportEmail));
const legal = { terms: legalPage('terms'), privacy: legalPage('privacy') };
app.get(['/terms', '/privacy'], (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.type('html').send(legal[req.path.slice(1)]);
});

// Contract-win popups for any page, including the main site on another host: paste
// <script src="https://access.govproposalpro.com/embed/wins.js" defer></script>.
app.get('/embed/wins.js', (_req, res) => {
  res.set({ 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' });
  res.sendFile(path.join(SITE_DIR, 'static', 'wins.js'));
});

// access.* (the signup link in purchase emails and the setup PDF) opens the signup page at /;
// every other host (govproposalpro.com, www) opens the landing page there. /access is always signup.
const isAccessHost = (req) => /^access\./i.test(req.hostname || '');
app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(isAccessHost(req) ? indexHtml : siteHtml);
});
app.get('/access', (_req, res) => {
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

// Admin dashboard for the team and VAs: same static-SPA pattern, its own page and bundle.
const ADMIN_DIR = path.join(PUBLIC_DIR, 'admin');
const adminHtml = fs.readFileSync(path.join(ADMIN_DIR, 'index.html'), 'utf8');
app.use('/admin/static', express.static(path.join(ADMIN_DIR, 'static'), { maxAge: '1h', index: false }));
app.get(['/admin', '/admin/*'], (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.type('html').send(adminHtml);
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

const alerts = () => runAlertJob().catch((err) => console.error('[alerts] job failed:', err.message));
setInterval(alerts, 60 * 60 * 1000).unref();
setTimeout(alerts, 60 * 1000).unref();
