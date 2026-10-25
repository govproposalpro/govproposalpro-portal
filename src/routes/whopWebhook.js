'use strict';

/**
 * Whop purchase webhook -> authorized_purchasers.
 *
 * Signature check follows the Standard Webhooks spec (webhook-id / webhook-timestamp /
 * webhook-signature headers, HMAC-SHA256 over "id.timestamp.body" with the whsec_ secret).
 * Confirm in your Whop webhook settings that this is the format your endpoint receives, then
 * send a test event and check the logs before relying on it. The CSV import script is the
 * fallback that always works.
 */

const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { normalizeEmail, isValidEmail } = require('../validation');
const ghl = require('../services/ghl');

const router = express.Router();
const TOLERANCE_SECONDS = 5 * 60;

const GRANT_EVENTS = new Set(['membership.went_valid', 'membership.activated', 'payment.succeeded']);
// A one-time edition keeps access when its maintenance membership is cancelled or lapses (owner's
// call, 2026-10-24); only a refund removes it.
const REVOKE_EVENTS = new Set(['payment.refunded']);
// Monthly edition plans are the product itself, so access ends when that membership ends.
const MEMBERSHIP_END_EVENTS = new Set(['membership.went_invalid', 'membership.deactivated', 'membership.expired']);

const listFromEnv = (name) => new Set((process.env[name] || '').split(',').map((s) => s.trim()).filter(Boolean));
const ENTERPRISE_PRODUCTS = listFromEnv('WHOP_ENTERPRISE_PRODUCT_IDS');
const CORE_PRODUCTS = listFromEnv('WHOP_CORE_PRODUCT_IDS');
// The monthly plans ($199 Core, $999 Enterprise) are matched by plan id; env vars override the defaults.
const planFromEnv = (name, fallback) => {
  const v = (process.env[name] || '').trim();
  return /^plan_[A-Za-z0-9]{4,40}$/.test(v) ? v : fallback;
};
const MONTHLY_PLANS = new Map([
  [planFromEnv('WHOP_CORE_MONTHLY_PLAN_ID', 'plan_3fn88Y0V7nDy8'), 'core'],
  [planFromEnv('WHOP_ENTERPRISE_MONTHLY_PLAN_ID', 'plan_dodFFyk8v95Fv'), 'enterprise'],
]);

function verifySignature(secret, headers, rawBody) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody.toString('utf8')}`).digest();

  // Header may carry several space-separated "v1,<base64>" signatures during secret rotation.
  return signatureHeader.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

function extract(event) {
  const data = event.data || {};
  const type = event.type || event.action || '';
  const email = normalizeEmail(data.user?.email || data.email || data.customer?.email || '');
  const productId = data.product?.id || data.product_id || data.plan?.product_id || null;
  const planId = data.plan?.id || data.plan_id || null;
  const ref = data.membership?.id || data.membership_id || data.id || null;
  const fullName = typeof data.user?.name === 'string' ? data.user.name.slice(0, 120) : '';
  let tier = null;
  const monthly = Boolean(planId && MONTHLY_PLANS.has(planId));
  if (monthly) tier = MONTHLY_PLANS.get(planId);
  else if (productId && ENTERPRISE_PRODUCTS.has(productId)) tier = 'enterprise';
  else if (productId && CORE_PRODUCTS.has(productId)) tier = 'core';
  return { type, email, tier, monthly, fullName, ref: ref ? String(ref).slice(0, 128) : null };
}

// Whop sends several grant events per purchase; the access_email_sent_at claim makes the
// "set up your access" email go out exactly once per buyer. Runs after the 200 is returned.
function sendAccessEmailOnce({ email, tier, fullName }) {
  if (!ghl.enabled()) return;
  db.query(
    `UPDATE authorized_purchasers SET access_email_sent_at = now()
      WHERE lower(email) = $1 AND access_email_sent_at IS NULL RETURNING id`,
    [email]
  )
    .then((claim) => {
      if (claim.rowCount === 0) return null;
      return ghl.onPurchased({ email, tier, fullName }).catch((err) => {
        console.error('[whop] access email failed:', err.message);
        return db.query('UPDATE authorized_purchasers SET access_email_sent_at = NULL WHERE lower(email) = $1', [email]);
      });
    })
    .catch((err) => console.error('[whop] access email claim failed:', err.message));
}

router.post('/webhooks/whop', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) return res.status(404).end();

  if (!Buffer.isBuffer(req.body) || !verifySignature(secret, req.headers, req.body)) {
    return res.status(401).json({ error: 'invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'invalid json' });
  }

  const { type, email, tier, monthly, fullName, ref } = extract(event);
  // The Whop company sells other products too; only GovProposalPro products grant or revoke access.
  if (!tier) return res.status(200).json({ ignored: true });
  if (!isValidEmail(email)) {
    console.warn(`[whop] ${type || 'unknown event'} had no usable email; ignored`);
    return res.status(200).json({ ignored: true });
  }

  try {
    if (GRANT_EVENTS.has(type)) {
      // billing records how access was bought. A one-time purchase always wins over a monthly plan,
      // so someone who bought outright never loses access when an old monthly plan ends.
      await db.query(
        `INSERT INTO authorized_purchasers (email, tier, source, whop_ref, billing)
         VALUES ($1, $2, 'webhook', $3, $4)
         ON CONFLICT ((lower(email))) DO UPDATE
           SET tier = COALESCE(EXCLUDED.tier, authorized_purchasers.tier),
               whop_ref = COALESCE(EXCLUDED.whop_ref, authorized_purchasers.whop_ref),
               billing = CASE WHEN authorized_purchasers.billing = 'one_time' THEN 'one_time' ELSE EXCLUDED.billing END,
               revoked_at = NULL`,
        [email, tier, ref, monthly ? 'monthly' : 'one_time']
      );
      sendAccessEmailOnce({ email, tier, fullName });
    } else if (REVOKE_EVENTS.has(type)) {
      await db.query('UPDATE authorized_purchasers SET revoked_at = now() WHERE lower(email) = $1', [email]);
    } else if (monthly && MEMBERSHIP_END_EVENTS.has(type)) {
      await db.query(
        `UPDATE authorized_purchasers SET revoked_at = now()
          WHERE lower(email) = $1 AND billing = 'monthly' AND revoked_at IS NULL`,
        [email]
      );
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[whop] db error:', err.message);
    return res.status(500).json({ error: 'temporary failure' }); // non-2xx makes Whop retry
  }
});

module.exports = router;
module.exports.verifySignature = verifySignature;
