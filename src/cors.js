'use strict';

/**
 * Minimal CORS for the signup API so a page hosted elsewhere (your GoHighLevel funnel domain)
 * can call it. Only origins listed in ALLOWED_ORIGINS are allowed; everything else gets no
 * CORS headers and the browser blocks the request.
 */

const allowed = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean)
);

function corsForSignup(req, res, next) {
  const origin = req.get('origin');
  if (origin && allowed.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
}

module.exports = { corsForSignup };
