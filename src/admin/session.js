'use strict';

/**
 * Admin sessions. Separate cookie, table and accounts from members. A session starts after the
 * password and only unlocks the dashboard once the authenticator code is verified (mfa_passed).
 * Shorter lifetimes than members: 12 hours absolute, 2 hours idle.
 */

const crypto = require('crypto');
const db = require('../db');

const SECURE = process.env.NODE_ENV === 'production';
const COOKIE = SECURE ? '__Host-gpp_admin' : 'gpp_admin';
const SESSION_HOURS = 12;
const IDLE_MINUTES = 120;

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

function readCookie(req) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

const cookieHeader = (value, maxAge) =>
  [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', SECURE ? 'Secure' : null, `Max-Age=${maxAge}`].filter(Boolean).join('; ');

async function createAdminSession(req, res, adminId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO admin_sessions (token_hash, admin_id, expires_at, ip, user_agent)
     VALUES ($1, $2, now() + make_interval(hours => $3), $4, $5)`,
    [sha256(token), adminId, SESSION_HOURS, String(req.ip || '').slice(0, 64), String(req.get('user-agent') || '').slice(0, 256)]
  );
  res.setHeader('Set-Cookie', cookieHeader(token, SESSION_HOURS * 3600));
}

async function destroyAdminSession(req, res) {
  const token = readCookie(req);
  if (token) await db.query('DELETE FROM admin_sessions WHERE token_hash = $1', [sha256(token)]);
  res.setHeader('Set-Cookie', cookieHeader('', 0));
}

async function markMfaPassed(req) {
  await db.query('UPDATE admin_sessions SET mfa_passed = true WHERE token_hash = $1', [sha256(readCookie(req) || '')]);
}

/** Loads req.admin. With { mfa: false } a password-only session is enough (for the MFA steps themselves). */
function requireAdmin({ mfa = true } = {}) {
  return async (req, res, next) => {
    try {
      const token = readCookie(req);
      if (!token) return res.status(401).json({ error: 'Please sign in.' });
      const { rows } = await db.query(
        `UPDATE admin_sessions s SET last_seen_at = now()
           FROM admins a
          WHERE s.token_hash = $1 AND s.admin_id = a.id AND a.disabled_at IS NULL
            AND s.expires_at > now() AND s.last_seen_at > now() - make_interval(mins => $2)
          RETURNING a.id, a.email, a.full_name, a.role, a.totp_enabled, a.totp_secret, a.totp_last_step, s.mfa_passed`,
        [sha256(token), IDLE_MINUTES]
      );
      const admin = rows[0];
      if (!admin) {
        res.setHeader('Set-Cookie', cookieHeader('', 0));
        return res.status(401).json({ error: 'Your session has ended. Please sign in again.' });
      }
      if (mfa && !admin.mfa_passed) return res.status(401).json({ error: 'Enter your authenticator code.', mfaRequired: true });
      req.admin = admin;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function requireOwner(req, res, next) {
  return req.admin && req.admin.role === 'owner' ? next() : res.status(403).json({ error: 'Only owners can do this.' });
}

/** Records an admin action. Never throws: a logging hiccup must not block the action itself. */
async function audit(req, action, target = null, detail = null) {
  try {
    await db.query(
      'INSERT INTO admin_audit (admin_id, action, target, detail, ip) VALUES ($1, $2, $3, $4, $5)',
      [req.admin ? req.admin.id : null, action, target ? String(target).slice(0, 254) : null, detail, String(req.ip || '').slice(0, 64)]
    );
  } catch (err) {
    console.error('[audit] write failed:', err.message);
  }
}

module.exports = { createAdminSession, destroyAdminSession, markMfaPassed, requireAdmin, requireOwner, audit, sha256 };
