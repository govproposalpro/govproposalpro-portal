'use strict';

/**
 * Cookie sessions for the dashboard. The browser holds a random 256-bit token in an HttpOnly,
 * SameSite=Strict cookie; the database holds only its SHA-256. Every request re-reads the user
 * and their Whop purchase, so a refund or cancellation cuts access on the next click.
 */

const crypto = require('crypto');
const db = require('../db');
const { normalizeTier, hasFeature } = require('./tiers');

const SECURE = process.env.NODE_ENV === 'production';
// __Host- cookies must be Secure, path=/ and host-only: they cannot be set or overwritten by a subdomain.
const COOKIE = SECURE ? '__Host-gpp_session' : 'gpp_session';
const SESSION_DAYS = 7;
const IDLE_HOURS = 24;
const REQUIRE_PURCHASE = process.env.REQUIRE_PURCHASE !== 'false';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function cookieHeader(value, maxAgeSeconds) {
  return [
    `${COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    SECURE ? 'Secure' : null,
    `Max-Age=${maxAgeSeconds}`,
  ].filter(Boolean).join('; ');
}

async function createSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent)
     VALUES ($1, $2, now() + make_interval(days => $3), $4, $5)`,
    [sha256(token), userId, SESSION_DAYS, String(req.ip || '').slice(0, 64), String(req.get('user-agent') || '').slice(0, 256)]
  );
  res.setHeader('Set-Cookie', cookieHeader(token, SESSION_DAYS * 86400));
}

async function destroySession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  res.setHeader('Set-Cookie', cookieHeader('', 0));
}

/**
 * Loads the signed-in user onto req.user, or answers 401. The purchase join is the zero-trust
 * part: tier comes from the live Whop record when there is one, and a revoked purchase signs
 * the user out everywhere.
 */
async function requireAuth(req, res, next) {
  try {
    const token = readCookie(req, COOKIE);
    if (!token) return res.status(401).json({ error: 'Please sign in.' });

    const { rows } = await db.query(
      `UPDATE sessions s SET last_seen_at = now()
         FROM "Users" u
         LEFT JOIN authorized_purchasers ap ON lower(ap.email) = lower(u.email)
        WHERE s.token_hash = $1 AND s.user_id = u.id
          AND s.expires_at > now()
          AND s.last_seen_at > now() - make_interval(hours => $2)
        RETURNING u.id, u.email, u.full_name, u.business_name, u.naics, u.capabilities, u.certifications,
                  u.experience_level, u.sam_status, u.primary_goal,
                  u.uei, u.cage_code, u.sam_expires_on, u.website, u.address, u.year_founded, u.employees,
                  u.service_area, u.differentiators, u.key_personnel, u.past_performance, u.onboarded_at,
                  u.sam_checklist, u.email_alerts, u.entity_structure, u.primary_markets, u.contact_title, u.phone, u.status, u.ghl_contact_id,
                  COALESCE(ap.tier, u.tier) AS tier, ap.id AS purchase_id, ap.revoked_at`,
      [sha256(token), IDLE_HOURS]
    );
    const user = rows[0];
    if (!user) {
      res.setHeader('Set-Cookie', cookieHeader('', 0));
      return res.status(401).json({ error: 'Your session has ended. Please sign in again.' });
    }
    if (user.status === 'disabled') {
      await db.query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
      res.setHeader('Set-Cookie', cookieHeader('', 0));
      return res.status(403).json({ error: 'This account has been disabled. Contact support.' });
    }
    if (REQUIRE_PURCHASE && (!user.purchase_id || user.revoked_at)) {
      await db.query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
      res.setHeader('Set-Cookie', cookieHeader('', 0));
      return res.status(403).json({ error: 'Your GovProposalPro membership is no longer active.' });
    }
    user.tier = normalizeTier(user.tier);
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireFeature(key) {
  return (req, res, next) =>
    hasFeature(req.user.tier, key)
      ? next()
      : res.status(403).json({ error: 'This feature is part of the Enterprise Edition.', upgrade: true });
}

/**
 * CSRF defence in depth on top of SameSite=Strict: state-changing requests must come from our
 * own origin. Browsers always send Origin on cross-site POST/PATCH/DELETE.
 */
function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  let host;
  try { host = new URL(origin).host; } catch { host = null; }
  if (host && host === req.get('host')) return next();
  return res.status(403).json({ error: 'Cross-site request blocked.' });
}

module.exports = { createSession, destroySession, requireAuth, requireFeature, sameOrigin, sha256 };
