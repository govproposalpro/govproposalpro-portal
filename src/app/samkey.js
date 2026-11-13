'use strict';

/**
 * Each member's own SAM.gov API key. The SAM.gov tools (First Win SAM check, Vendor Scraper,
 * Sub-Safe Vetting, Bid Matchmaker, Autopilot) use the member's key first, so one platform key
 * with a small daily quota never runs out for everybody. SAM.gov public keys expire every 90
 * days: we store when the key expires, remind the member before it does (dashboard + email via
 * alerts.js), and mark the key rejected the moment SAM.gov refuses it.
 */

const db = require('../db');
const sam = require('./sam');
const secrets = require('./secrets');

const LIFETIME_DAYS = 90;
const WARN_DAYS = 14;

const isoDay = (d) => d.toISOString().slice(0, 10);
const defaultExpiry = () => isoDay(new Date(Date.now() + LIFETIME_DAYS * 86400000));

async function row(userId) {
  const { rows } = await db.query(
    `SELECT sam_key_enc, sam_key_set_at, to_char(sam_key_expires_on, 'YYYY-MM-DD') AS expires_on, sam_key_rejected_at
       FROM autopilot_settings WHERE user_id = $1`, [userId]);
  return rows[0] || null;
}

/** What the dashboard shows: state is none | ok | expiring | expired | rejected | broken. */
function describe(r) {
  if (!r || !r.sam_key_enc) return { state: 'none', set: false };
  const plain = secrets.decrypt(r.sam_key_enc);
  if (!plain) return { state: 'broken', set: true };
  const base = { set: true, last4: plain.slice(-4), addedOn: r.sam_key_set_at ? isoDay(new Date(r.sam_key_set_at)) : null, expiresOn: r.expires_on || null };
  if (r.sam_key_rejected_at) return { ...base, state: 'rejected', rejectedOn: isoDay(new Date(r.sam_key_rejected_at)) };
  if (r.expires_on) {
    // Whole days between today and the expiry date, the same way the reminder emails count them.
    const days = Math.round((Date.parse(`${r.expires_on}T00:00:00Z`) - Date.parse(`${isoDay(new Date())}T00:00:00Z`)) / 86400000);
    base.daysLeft = days;
    if (days < 0) return { ...base, state: 'expired' };
    if (days <= WARN_DAYS) return { ...base, state: 'expiring' };
  }
  return { ...base, state: 'ok' };
}

async function status(userId) {
  return describe(await row(userId));
}

/** The member's working key, or undefined (callers then fall back to the platform key). */
async function keyFor(userId) {
  const r = await row(userId);
  if (!r || !r.sam_key_enc || r.sam_key_rejected_at) return undefined;
  return secrets.decrypt(r.sam_key_enc) || undefined;
}

async function markRejected(userId) {
  await db.query('UPDATE autopilot_settings SET sam_key_rejected_at = now() WHERE user_id = $1 AND sam_key_rejected_at IS NULL', [userId]);
}

/** True when there is any key to call SAM.gov with for this member. */
async function available(userId) {
  return sam.enabled() || Boolean(await keyFor(userId));
}

/**
 * Runs fn(apiKey) with the member's key; if SAM.gov refuses it, marks it rejected (so the member
 * is reminded to replace it) and retries once with the platform key.
 */
async function withKey(userId, fn) {
  const key = await keyFor(userId);
  if (!key) return fn(undefined);
  try {
    return await fn(key);
  } catch (err) {
    if (!sam.isKeyRejected(err)) throw err;
    console.warn(`[samkey] SAM.gov refused the key of user ${userId}; marked for renewal.`);
    await markRejected(userId);
    if (!sam.enabled()) throw err;
    return fn(undefined);
  }
}

/** Saves a new key after checking it with SAM.gov. Throws an Error with a member-facing message. */
async function save(userId, rawKey, expiresOn) {
  const key = String(rawKey || '').trim();
  if (key.length < 20 || key.length > 200 || /\s/.test(key)) throw new Error('That does not look like a SAM.gov API key. Copy it again from SAM.gov.');
  let expires = defaultExpiry();
  if (expiresOn) {
    const t = Date.parse(`${expiresOn}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiresOn)) || Number.isNaN(t) || t < Date.now() - 86400000 || t > Date.now() + 400 * 86400000) {
      throw new Error('Enter the expiration date SAM.gov shows for the key.');
    }
    expires = expiresOn;
  }
  try {
    await sam.checkKey(key);
  } catch (err) {
    if (sam.isKeyRejected(err)) throw new Error('SAM.gov did not accept that key. Make sure you copied the whole key and that it has not expired.');
    // A busy SAM.gov (or a used-up daily quota) is not the member's fault: save the key anyway.
    console.warn('[samkey] could not verify a key with SAM.gov:', err.message);
  }
  await db.query(
    `INSERT INTO autopilot_settings (user_id, sam_key_enc, sam_key_set_at, sam_key_expires_on, sam_key_rejected_at)
     VALUES ($1, $2, now(), $3, NULL)
     ON CONFLICT (user_id) DO UPDATE SET sam_key_enc = $2, sam_key_set_at = now(), sam_key_expires_on = $3,
       sam_key_rejected_at = NULL, updated_at = now()`,
    [userId, secrets.encrypt(key), expires]
  );
  return status(userId);
}

async function remove(userId) {
  await db.query(
    `UPDATE autopilot_settings SET sam_key_enc = NULL, sam_key_set_at = NULL, sam_key_expires_on = NULL, sam_key_rejected_at = NULL,
            updated_at = now() WHERE user_id = $1`, [userId]);
}

module.exports = { status, describe, keyFor, available, withKey, markRejected, save, remove, LIFETIME_DAYS, WARN_DAYS };
