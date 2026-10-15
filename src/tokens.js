'use strict';

/**
 * One-time links (password reset, invite, admin setup). The raw token only ever exists in the
 * link; the database keeps its SHA-256. Issuing a new link for the same account and purpose
 * cancels the previous one.
 */

const crypto = require('crypto');
const db = require('./db');

const TTL_MINUTES = { member_reset: 60, member_invite: 7 * 24 * 60, admin_setup: 72 * 60 };
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

function baseUrl() {
  return (process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || 'https://access.govproposalpro.com').replace(/\/$/, '');
}

async function issue(kind, subjectId, createdBy = null) {
  if (!TTL_MINUTES[kind]) throw new Error(`Unknown token kind ${kind}`);
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(`UPDATE password_tokens SET used_at = now() WHERE kind = $1 AND subject_id = $2 AND used_at IS NULL`, [kind, subjectId]);
  await db.query(
    `INSERT INTO password_tokens (token_hash, kind, subject_id, expires_at, created_by)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4), $5)`,
    [sha256(token), kind, subjectId, TTL_MINUTES[kind], createdBy]
  );
  const path = kind === 'admin_setup' ? '/admin/setup' : '/app/reset';
  return { token, url: `${baseUrl()}${path}#${token}`, expiresMinutes: TTL_MINUTES[kind] };
}

/** Returns the token row if it is valid for one of the kinds, without using it up. */
async function peek(token, kinds) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const { rows } = await db.query(
    `SELECT kind, subject_id FROM password_tokens
      WHERE token_hash = $1 AND kind = ANY($2) AND used_at IS NULL AND expires_at > now()`,
    [sha256(token), kinds]
  );
  return rows[0] || null;
}

/** Marks the token used; returns the row only for the caller that won the race. */
async function consume(token, kinds, client = db) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const { rows } = await client.query(
    `UPDATE password_tokens SET used_at = now()
      WHERE token_hash = $1 AND kind = ANY($2) AND used_at IS NULL AND expires_at > now()
      RETURNING kind, subject_id`,
    [sha256(token), kinds]
  );
  return rows[0] || null;
}

const expiresLabel = (minutes) => (minutes >= 1440 ? `${Math.round(minutes / 1440)} days` : minutes >= 120 ? `${Math.round(minutes / 60)} hours` : `${minutes} minutes`);

module.exports = { issue, peek, consume, expiresLabel, baseUrl };
