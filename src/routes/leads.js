'use strict';

/**
 * Opt-ins from the demo video page (/watch). The visitor gives a first name, email and phone to
 * watch; the lead is saved here first, so nothing is lost if GoHighLevel is down, then sent to
 * GoHighLevel tagged with the ad source (UTM tags or a Facebook/Google click id).
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const ghl = require('../services/ghl');
const { sameOrigin } = require('../app/session');
const { normalizeEmail, isValidEmail } = require('../validation');

const router = express.Router();

// A real visitor opts in once or twice; this stops scripted floods without getting in their way.
const leadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many tries. Please wait a few minutes and try again.' },
});

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, max) : '');

/** US numbers become +1XXXXXXXXXX; numbers typed with a country code keep it. Null if it can't be a phone. */
function normalizePhone(value) {
  const raw = clean(value, 40);
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  if (raw.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

router.post('/leads', sameOrigin, leadLimiter, express.json({ limit: '4kb' }), async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    // Hidden field people never see; bots that fill every input get a quiet success and are dropped.
    if (clean(body.website, 200)) return res.json({ ok: true });

    const firstName = clean(body.firstName, 80);
    const email = normalizeEmail(body.email);
    const phone = normalizePhone(body.phone);
    if (!firstName) return res.status(400).json({ error: 'Please enter your first name.', field: 'firstName' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.', field: 'email' });
    if (!phone) return res.status(400).json({ error: 'Please enter a valid phone number.', field: 'phone' });

    const src = body.source && typeof body.source === 'object' ? body.source : {};
    const utm = {
      source: clean(src.utm_source, 150), medium: clean(src.utm_medium, 150), campaign: clean(src.utm_campaign, 150),
      content: clean(src.utm_content, 150), term: clean(src.utm_term, 150),
    };
    const clickId = clean(src.fbclid, 255) ? `fbclid:${clean(src.fbclid, 240)}` : clean(src.gclid, 255) ? `gclid:${clean(src.gclid, 240)}` : '';
    const referrer = clean(src.referrer, 300);
    const page = clean(body.page, 40).toLowerCase().replace(/[^a-z0-9-]/g, '') || 'watch';
    // No UTM tags but a click id still tells us which ad network sent them.
    if (!utm.source && clickId) utm.source = clickId.startsWith('fbclid') ? 'facebook' : 'google';

    const nul = (v) => v || null;
    const { rows } = await db.query(
      `INSERT INTO leads (email, first_name, phone, page, utm_source, utm_medium, utm_campaign, utm_content, utm_term, click_id, referrer)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name, phone = EXCLUDED.phone,
         visits = leads.visits + 1, updated_at = now()
       RETURNING id`,
      [email, firstName, phone, page, nul(utm.source), nul(utm.medium), nul(utm.campaign), nul(utm.content), nul(utm.term), nul(clickId), nul(referrer)]
    );
    res.json({ ok: true });

    // After the response, so the video unlocks right away whatever GoHighLevel is doing.
    if (ghl.enabled()) {
      ghl.onLead({ email, firstName, phone, page, utm, clickId, referrer })
        .then(({ contactId }) => db.query('UPDATE leads SET ghl_contact_id = $1 WHERE id = $2', [contactId, rows[0].id]))
        .catch((err) => console.error('[leads] GoHighLevel sync failed:', err.message));
    }
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.normalizePhone = normalizePhone;
