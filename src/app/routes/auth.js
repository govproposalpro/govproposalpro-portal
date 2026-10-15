'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const { normalizeEmail, isValidEmail } = require('../../validation');
const { createSession, destroySession, requireAuth } = require('../session');
const { TIERS, normalizeTier, featuresFor } = require('../tiers');
const { proposalUsage } = require('../quota');

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
      `SELECT u.id, u.password_hash, u.locked_until, ap.id AS purchase_id, ap.revoked_at
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
    const u = req.user;
    const tier = normalizeTier(u.tier);
    res.json({
      user: {
        email: u.email,
        fullName: u.full_name,
        businessName: u.business_name,
        naics: u.naics,
        capabilities: u.capabilities,
        certifications: u.certifications ? u.certifications.split(',').filter(Boolean) : [],
        samStatus: u.sam_status,
        experienceLevel: u.experience_level,
      },
      tier: { key: tier, label: TIERS[tier].label },
      usage: { proposals: await proposalUsage(u.id, tier) },
      features: featuresFor(tier),
    });
  } catch (err) {
    next(err);
  }
});

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max) : null);

// Business profile feeds every AI feature, so members can keep it current.
router.patch('/me/profile', requireAuth, express.json({ limit: '8kb' }), async (req, res, next) => {
  try {
    const b = req.body || {};
    await db.query(
      `UPDATE "Users" SET
          full_name     = COALESCE($2, full_name),
          business_name = COALESCE($3, business_name),
          naics         = COALESCE($4, naics),
          capabilities  = COALESCE($5, capabilities)
        WHERE id = $1`,
      [req.user.id, clean(b.fullName, 120), clean(b.businessName, 160), clean(b.naics, 200), clean(b.capabilities, 600)]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
