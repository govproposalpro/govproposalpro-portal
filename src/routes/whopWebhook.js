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
const { SUBSCRIPTION_TIERS } = require('../plans');
const whop = require('../services/whop');

const router = express.Router();
const TOLERANCE_SECONDS = 5 * 60;

const GRANT_EVENTS = new Set(['membership.went_valid', 'membership.activated', 'payment.succeeded']);
// A one-time edition keeps access when its maintenance membership is cancelled or lapses (owner's
// call, 2026-10-24); only a refund removes it.
const REVOKE_EVENTS = new Set(['payment.refunded']);
// Monthly edition plans are the product itself, so access ends when that membership ends.
const MEMBERSHIP_END_EVENTS = new Set(['membership.went_invalid', 'membership.deactivated', 'membership.expired']);
// A card was declined (first payment or a renewal). Whop retries on its own; we tell the member.
const PAYMENT_FAILED_EVENTS = new Set(['payment.failed']);

const listFromEnv = (name) => new Set((process.env[name] || '').split(',').map((s) => s.trim()).filter(Boolean));
const ENTERPRISE_PRODUCTS = listFromEnv('WHOP_ENTERPRISE_PRODUCT_IDS');
const CORE_PRODUCTS = listFromEnv('WHOP_CORE_PRODUCT_IDS');
// Subscription plans (monthly or yearly) are matched by plan id; see src/plans.js.
const MONTHLY_PLANS = SUBSCRIPTION_TIERS;

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
  const membershipId = [data.membership?.id, data.membership_id, data.id].find((v) => /^mem_/.test(String(v || ''))) || null;
  const recoveryUrl = typeof data.recovery_url === 'string' ? data.recovery_url.slice(0, 500) : '';
  const failure = typeof data.failure_message === 'string' ? data.failure_message.slice(0, 160) : '';
  return { type, email, tier, monthly, fullName, ref: ref ? String(ref).slice(0, 128) : null, membershipId, recoveryUrl, failure };
}

// Whop sends several grant events per purchase; the access_email_sent_at claim makes the
// "set up your access" email go out exactly once per buyer. Runs after the 200 is returned.
function sendAccessEmailOnce({ email, tier, fullName, monthly }) {
  if (!ghl.enabled()) return;
  db.query(
    `UPDATE authorized_purchasers SET access_email_sent_at = now()
      WHERE lower(email) = $1 AND access_email_sent_at IS NULL RETURNING id`,
    [email]
  )
    .then((claim) => {
      if (claim.rowCount === 0) return null;
      return ghl.onPurchased({ email, tier, fullName, monthly }).catch((err) => {
        console.error('[whop] access email failed:', err.message);
        return db.query('UPDATE authorized_purchasers SET access_email_sent_at = NULL WHERE lower(email) = $1', [email]);
      });
    })
    .catch((err) => console.error('[whop] access email claim failed:', err.message));
}

/**
 * A Core subscriber bought Enterprise: stop the Core plan renewing (they keep it to the end of the
 * month they paid for, then Enterprise carries on), and flag the contact in GoHighLevel. Falls back
 * to a GHL task for the team when there is no Whop API key or the cancel call fails.
 */
function cancelOldCore({ email, coreMembership, newMembership }) {
  const attempt = whop.enabled() && coreMembership && coreMembership !== newMembership
    ? whop.cancelAtPeriodEnd(coreMembership, 'Upgraded to Enterprise').then(() => true, (err) => {
      console.error('[whop] auto-cancel of Core failed:', err.message);
      return false;
    })
    : Promise.resolve(false);
  attempt.then((coreCancelled) => {
    if (coreCancelled) console.log(`[whop] Core membership ${coreMembership} set to cancel at period end after upgrade`);
    if (ghl.enabled()) return ghl.onUpgraded({ email, coreCancelled });
    return null;
  }).catch((err) => console.error('[whop] upgrade flag failed:', err.message));
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

  const { type, email, tier, monthly, fullName, ref, membershipId, recoveryUrl, failure } = extract(event);
  // The Whop company sells other products too; only GovProposalPro products grant or revoke access.
  if (!tier) return res.status(200).json({ ignored: true });
  if (!isValidEmail(email)) {
    console.warn(`[whop] ${type || 'unknown event'} had no usable email; ignored`);
    return res.status(200).json({ ignored: true });
  }

  try {
    if (GRANT_EVENTS.has(type)) {
      // A Core subscriber buying Enterprise is an upgrade: the team cancels the old Core plan.
      const before = monthly && tier === 'enterprise'
        ? (await db.query('SELECT tier, billing, revoked_at, whop_ref, core_membership_id FROM authorized_purchasers WHERE lower(email) = $1', [email])).rows[0]
        : null;
      const upgraded = Boolean(before && !before.revoked_at && before.tier === 'core' && before.billing === 'monthly');
      // billing records how access was bought. A one-time purchase always wins over a monthly plan,
      // so someone who bought outright never loses access when an old monthly plan ends. An active
      // Enterprise member is never moved down by a Core payment (someone who upgraded and is still
      // on the old Core plan); one_time_tier remembers the edition owned outright.
      await db.query(
        `INSERT INTO authorized_purchasers (email, tier, source, whop_ref, billing, one_time_tier)
         VALUES ($1, $2::varchar, 'webhook', $3, $4::varchar, CASE WHEN $4::varchar = 'one_time' THEN $2::varchar END)
         ON CONFLICT ((lower(email))) DO UPDATE
           SET tier = CASE WHEN authorized_purchasers.revoked_at IS NULL AND authorized_purchasers.tier = 'enterprise'
                            THEN 'enterprise' ELSE COALESCE(EXCLUDED.tier, authorized_purchasers.tier) END,
               whop_ref = COALESCE(EXCLUDED.whop_ref, authorized_purchasers.whop_ref),
               billing = CASE WHEN authorized_purchasers.billing = 'one_time' THEN 'one_time' ELSE EXCLUDED.billing END,
               one_time_tier = CASE WHEN EXCLUDED.billing = 'one_time'
                                    THEN CASE WHEN authorized_purchasers.one_time_tier = 'enterprise' THEN 'enterprise' ELSE EXCLUDED.tier END
                                    ELSE authorized_purchasers.one_time_tier END,
               revoked_at = NULL`,
        [email, tier, ref, monthly ? 'monthly' : 'one_time']
      );
      // Remember the Core monthly membership so an upgrade can stop it renewing later.
      if (monthly && tier === 'core' && membershipId) {
        await db.query('UPDATE authorized_purchasers SET core_membership_id = $2 WHERE lower(email) = $1', [email, membershipId]);
      }
      sendAccessEmailOnce({ email, tier, fullName, monthly });
      if (upgraded) {
        const coreMembership = before.core_membership_id || (/^mem_/.test(before.whop_ref || '') ? before.whop_ref : null);
        cancelOldCore({ email, coreMembership, newMembership: membershipId });
      }
    } else if (PAYMENT_FAILED_EVENTS.has(type)) {
      if (ghl.enabled()) ghl.onPaymentFailed({ email, recoveryUrl, reason: failure }).catch((err) => console.error('[whop] payment-failed notice failed:', err.message));
    } else if (REVOKE_EVENTS.has(type)) {
      await db.query('UPDATE authorized_purchasers SET revoked_at = now() WHERE lower(email) = $1', [email]);
    } else if (monthly && MEMBERSHIP_END_EVENTS.has(type)) {
      // Only the plan that set the current tier ends access: a member who upgraded from Core to
      // Enterprise and then cancels the old Core plan keeps Enterprise. Someone who also owns an
      // edition outright drops back to that edition instead of losing access.
      await db.query(
        `UPDATE authorized_purchasers
            SET tier = CASE WHEN billing = 'one_time' THEN COALESCE(one_time_tier, tier) ELSE tier END,
                revoked_at = CASE WHEN billing = 'one_time' THEN revoked_at ELSE now() END
          WHERE lower(email) = $1 AND revoked_at IS NULL AND (tier IS NULL OR tier = $2::varchar)`,
        [email, tier]
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
