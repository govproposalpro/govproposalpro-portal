'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { sendWelcomeEmail } = require('../services/email');
const ghl = require('../services/ghl');
const { normalizeEmail, isValidEmail, passwordProblem, parseProfile } = require('../validation');
const { checkAccessKey } = require('../app/secrets');
const tokens = require('../tokens');
const { sendMemberLink } = require('../app/routes/auth');

const router = express.Router();

const BCRYPT_ROUNDS = Math.max(10, Number.parseInt(process.env.BCRYPT_ROUNDS || '12', 10));
const REQUIRE_PURCHASE = process.env.REQUIRE_PURCHASE !== 'false';

// 10 attempts per IP per 15 minutes: room for typos, useless for brute force or spam.
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

router.post('/register', registerLimiter, express.json({ limit: '8kb' }), async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const email = normalizeEmail(body.email);
  const { password, confirmPassword } = body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.', field: 'email' });
  }
  const problem = passwordProblem(password, confirmPassword);
  if (problem) {
    return res.status(400).json({ error: problem, field: 'email' });
  }
  const { profile, error: profileError } = parseProfile(body.profile);
  if (profileError) {
    return res.status(400).json({ error: profileError });
  }

  try {
    let tier = null;
    if (REQUIRE_PURCHASE) {
      const purchase = await db.query(
        `SELECT tier FROM authorized_purchasers
          WHERE lower(email) = $1 AND revoked_at IS NULL
          LIMIT 1`,
        [email]
      );
      if (purchase.rowCount === 0) {
        return res.status(403).json({
          error: 'We could not find a GovProposalPro purchase for this email. Use the email you checked out with on Whop, or contact support.',
          field: 'email',
        });
      }
      tier = purchase.rows[0].tier;
    }

    // A signup link from the purchase email proves the buyer owns this address. Without it, anyone
    // who knew a buyer's email could claim their paid access, so the account stays locked
    // ("unverified") until the confirmation link we email is clicked.
    const proven = checkAccessKey(email, body.k);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // An unconfirmed account can be signed up for again (the real owner replaces a squatter's
    // password and profile); a confirmed one cannot.
    const inserted = await db.query(
      `INSERT INTO "Users" (email, password_hash, tier, full_name, phone, business_name, experience_level,
                            sam_status, annual_revenue, primary_goal, certifications, naics, capabilities, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT ((lower(email))) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, tier = EXCLUDED.tier, full_name = EXCLUDED.full_name,
             phone = EXCLUDED.phone, business_name = EXCLUDED.business_name, experience_level = EXCLUDED.experience_level,
             sam_status = EXCLUDED.sam_status, annual_revenue = EXCLUDED.annual_revenue, primary_goal = EXCLUDED.primary_goal,
             certifications = EXCLUDED.certifications, naics = EXCLUDED.naics, capabilities = EXCLUDED.capabilities,
             status = EXCLUDED.status, failed_logins = 0, locked_until = NULL
         WHERE "Users".status = 'unverified'
       RETURNING id`,
      [email, passwordHash, tier, profile.fullName, profile.phone, profile.businessName, profile.experienceLevel,
        profile.samStatus, profile.annualRevenue, profile.primaryGoal, profile.certifications.join(','),
        profile.naics || null, profile.capabilities || null, proven ? 'pending_launch' : 'unverified']
    );

    if (inserted.rowCount === 0) {
      return res.status(409).json({
        error: 'An account already exists for this email. Sign in at govproposalpro.com/app/login.',
        field: 'email',
      });
    }

    const userId = inserted.rows[0].id;
    if (!proven) {
      res.status(200).json({ ok: true, verify: true });
      sendMemberLink({ id: userId }, email, 'member_verify')
        .then((r) => { if (!r.emailed) console.warn(`[signup] email is not configured; member ${userId} cannot confirm their address`); })
        .catch((err) => console.error(`[signup] confirmation email failed for user ${userId}:`, err.message));
      return;
    }
    res.status(200).json({ ok: true });
    afterSignup(userId, email, tier, profile);
  } catch (err) {
    console.error('[register] failed:', err.message);
    return res.status(500).json({ error: 'We could not secure your account right now. Please try again shortly.' });
  }
});

/**
 * CRM contact, sales task and welcome email. Fired after the response so a slow CRM or mail server
 * never blocks the success screen. With GHL configured, GHL handles all three; otherwise email only.
 */
function afterSignup(userId, email, tier, profile) {
  const followUp = ghl.enabled()
    ? ghl.onRegistered({ email, tier, profile }).then(({ contactId }) =>
        db.query('UPDATE "Users" SET welcome_email_sent_at = now(), ghl_contact_id = $2 WHERE id = $1', [userId, contactId]))
    : sendWelcomeEmail({ email, tier })
        .then(() => db.query('UPDATE "Users" SET welcome_email_sent_at = now() WHERE id = $1', [userId]));
  followUp.catch((err) => console.error(`[signup] follow-up failed for user ${userId}:`, err.message));
}

// The link in the confirmation email: unlocks the account, then the member signs in.
// Confirmation links carry 256-bit tokens, so this only stops hammering.
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

router.post('/register/verify', verifyLimiter, express.json({ limit: '2kb' }), async (req, res, next) => {
  try {
    const t = await tokens.consume(req.body && req.body.token, ['member_verify']);
    if (!t) return res.status(400).json({ error: 'This confirmation link has expired or was already used. Sign up again with the same email to get a new one.' });
    const { rows } = await db.query(
      `UPDATE "Users" SET status = 'pending_launch' WHERE id = $1 AND status = 'unverified'
       RETURNING email, tier, full_name, phone, business_name, experience_level, sam_status, annual_revenue,
                 primary_goal, certifications, naics, capabilities, welcome_email_sent_at`,
      [t.subject_id]
    );
    const u = rows[0];
    res.json({ ok: true, email: u ? u.email : undefined });
    if (u && !u.welcome_email_sent_at) {
      afterSignup(t.subject_id, u.email, u.tier, {
        fullName: u.full_name || '', phone: u.phone || '', businessName: u.business_name || '',
        experienceLevel: u.experience_level, samStatus: u.sam_status, annualRevenue: u.annual_revenue,
        primaryGoal: u.primary_goal, certifications: (u.certifications || '').split(',').filter(Boolean),
        naics: u.naics || '', capabilities: u.capabilities || '',
      });
    }
  } catch (err) { next(err); }
});

module.exports = router;
