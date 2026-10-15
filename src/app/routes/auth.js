'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const { normalizeEmail, isValidEmail } = require('../../validation');
const { createSession, destroySession, requireAuth } = require('../session');
const { TIERS, normalizeTier, featuresFor } = require('../tiers');
const { proposalUsage } = require('../quota');
const { publicProfile } = require('../profile');
const { passwordProblem } = require('../../validation');
const tokens = require('../../tokens');
const mailer = require('../../services/mailer');
const { buildLinkEmail } = require('../../services/email');
const { sha256 } = require('../session');

const BCRYPT_ROUNDS = Math.max(10, Number.parseInt(process.env.BCRYPT_ROUNDS || '12', 10));
const currentTokenHash = (req) => {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)(?:__Host-)?gpp_session=([^;]+)/);
  return m ? sha256(decodeURIComponent(m[1])) : '';
};

const router = express.Router();

const REQUIRE_PURCHASE = process.env.REQUIRE_PURCHASE !== 'false';
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;
// Accounts listed here can sign in before launch to test (comma-separated emails).
const EARLY_ACCESS = new Set((process.env.APP_EARLY_ACCESS_EMAILS || '').split(',').map(normalizeEmail).filter(Boolean));
// Compared against so an unknown email costs the same bcrypt time as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', 12);

function launchAt() {
  const t = Date.parse(process.env.APP_LAUNCH_AT || '');
  return Number.isNaN(t) ? null : t;
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
});

const INVALID = 'That email and password do not match our records.';

router.post('/auth/login', loginLimiter, express.json({ limit: '4kb' }), async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    const password = req.body && req.body.password;
    if (!isValidEmail(email) || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Enter your email and password.' });
    }

    const { rows } = await db.query(
      `SELECT u.id, u.password_hash, u.locked_until, u.status, ap.id AS purchase_id, ap.revoked_at
         FROM "Users" u
         LEFT JOIN authorized_purchasers ap ON lower(ap.email) = lower(u.email)
        WHERE lower(u.email) = $1`,
      [email]
    );
    const user = rows[0];
    const ok = await bcrypt.compare(password.slice(0, 200), user ? user.password_hash : DUMMY_HASH);

    if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.` });
    }
    if (!user || !ok) {
      if (user) {
        await db.query(
          `UPDATE "Users"
              SET failed_logins = failed_logins + 1,
                  locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
            WHERE id = $1`,
          [user.id, MAX_FAILED, LOCK_MINUTES]
        );
      }
      return res.status(401).json({ error: INVALID });
    }
    if (user.status === 'disabled') {
      return res.status(403).json({ error: 'This account has been disabled. Contact support.' });
    }
    if (REQUIRE_PURCHASE && (!user.purchase_id || user.revoked_at)) {
      return res.status(403).json({ error: 'Your GovProposalPro membership is not active. Contact support if this is a mistake.' });
    }
    const opensAt = launchAt();
    if (opensAt && Date.now() < opensAt && !EARLY_ACCESS.has(email)) {
      return res.status(403).json({
        error: `Your account is ready. The command center opens ${new Date(opensAt).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' })}.`,
        opensAt: new Date(opensAt).toISOString(),
      });
    }

    await db.query(
      `UPDATE "Users" SET failed_logins = 0, locked_until = NULL, last_login_at = now(),
              status = CASE WHEN status = 'pending_launch' THEN 'active' ELSE status END
        WHERE id = $1`,
      [user.id]
    );
    await createSession(res, req, user.id);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.post('/auth/logout', async (req, res, next) => {
  try {
    await destroySession(req, res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const tier = normalizeTier(req.user.tier);
    res.json({
      user: publicProfile(req.user),
      tier: { key: tier, label: TIERS[tier].label },
      usage: { proposals: await proposalUsage(req.user.id, tier) },
      features: featuresFor(tier),
    });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------ passwords

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a few minutes and try again.' },
});

// Reset links carry 256-bit tokens, so this only stops hammering; it is looser than forgot.
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a few minutes and try again.' },
});

/** Always answers the same way, so it can't be used to find out which emails have accounts. */
router.post('/auth/forgot', forgotLimiter, express.json({ limit: '2kb' }), async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    res.json({ ok: true, message: 'If that email has an account, a reset link is on its way. Check your inbox and spam folder.' });
    if (!isValidEmail(email)) return;
    const { rows } = await db.query(
      `SELECT id, ghl_contact_id, status FROM "Users" WHERE lower(email) = $1`, [email]);
    const user = rows[0];
    if (!user || user.status === 'disabled') return;
    sendMemberLink(user, email, 'member_reset')
      .then((r) => { if (!r.emailed) console.warn(`[forgot] email is not configured; member ${user.id} needs a reset link from the admin dashboard`); })
      .catch((err) => console.error('[forgot] email failed:', err.message));
  } catch (err) {
    next(err);
  }
});

// Lets the reset page show who the link is for before asking for a new password.
router.post('/auth/reset/check', resetLimiter, express.json({ limit: '2kb' }), async (req, res, next) => {
  try {
    const t = await tokens.peek(req.body && req.body.token, ['member_reset', 'member_invite']);
    if (!t) return res.status(400).json({ error: 'This link has expired or was already used. Request a new one.' });
    const { rows } = await db.query('SELECT email FROM "Users" WHERE id = $1', [t.subject_id]);
    if (!rows[0]) return res.status(400).json({ error: 'This link is no longer valid.' });
    res.json({ email: rows[0].email, invite: t.kind === 'member_invite' });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/reset', resetLimiter, express.json({ limit: '4kb' }), async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const b = req.body || {};
    const problem = passwordProblem(b.password, b.confirmPassword);
    if (problem) return res.status(400).json({ error: problem });
    const hash = await bcrypt.hash(b.password, BCRYPT_ROUNDS);
    await client.query('BEGIN');
    const t = await tokens.consume(b.token, ['member_reset', 'member_invite'], client);
    if (!t) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This link has expired or was already used. Request a new one.' });
    }
    await client.query(
      `UPDATE "Users" SET password_hash = $2, failed_logins = 0, locked_until = NULL,
              status = CASE WHEN status IN ('invited', 'pending_launch') THEN 'active' ELSE status END
        WHERE id = $1`,
      [t.subject_id, hash]
    );
    await client.query('DELETE FROM sessions WHERE user_id = $1', [t.subject_id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

router.post('/me/password', requireAuth, loginLimiter, express.json({ limit: '4kb' }), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await db.query('SELECT password_hash FROM "Users" WHERE id = $1', [req.user.id]);
    if (typeof b.currentPassword !== 'string' || !(await bcrypt.compare(b.currentPassword.slice(0, 200), rows[0].password_hash))) {
      return res.status(400).json({ error: 'Your current password is not correct.' });
    }
    const problem = passwordProblem(b.password, b.confirmPassword);
    if (problem) return res.status(400).json({ error: problem });
    await db.query('UPDATE "Users" SET password_hash = $2 WHERE id = $1', [req.user.id, await bcrypt.hash(b.password, BCRYPT_ROUNDS)]);
    // Sign out every other device; keep this one.
    await db.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [req.user.id, currentTokenHash(req)]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Emails a reset or invite link to a member. Returns the link (for admins who want to copy it). */
async function sendMemberLink(user, email, kind, createdBy = null) {
  const link = await tokens.issue(kind, user.id, createdBy);
  const invite = kind === 'member_invite';
  const msg = buildLinkEmail({
    eyebrow: invite ? 'Your access is ready' : 'Password reset',
    heading: invite ? 'Set up your GovProposalPro login' : 'Reset your GovProposalPro password',
    intro: invite
      ? 'Your GovProposalPro Command Center is ready. Create your password to sign in, then add your business details so every proposal is written for your company.'
      : 'We received a request to reset the password for your GovProposalPro account. Choose a new password with the button below.',
    href: link.url,
    cta: invite ? 'Create my password' : 'Reset my password',
    expires: tokens.expiresLabel(link.expiresMinutes),
  });
  let emailed = false;
  if (mailer.canSend()) {
    await mailer.send({ to: email, contactId: user.ghl_contact_id || undefined, ...msg });
    emailed = true;
  }
  return { ...link, emailed };
}

module.exports = router;
module.exports.sendMemberLink = sendMemberLink;
