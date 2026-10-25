'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { sendWelcomeEmail } = require('../services/email');
const ghl = require('../services/ghl');
const { normalizeEmail, isValidEmail, passwordProblem, parseProfile } = require('../validation');

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

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const inserted = await db.query(
      `INSERT INTO "Users" (email, password_hash, tier, full_name, phone, business_name, experience_level,
                            sam_status, annual_revenue, primary_goal, certifications, naics, capabilities)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT ((lower(email))) DO NOTHING
       RETURNING id`,
      [email, passwordHash, tier, profile.fullName, profile.phone, profile.businessName, profile.experienceLevel,
        profile.samStatus, profile.annualRevenue, profile.primaryGoal, profile.certifications.join(','),
        profile.naics || null, profile.capabilities || null]
    );

    if (inserted.rowCount === 0) {
      return res.status(409).json({
        error: 'An account already exists for this email. Sign in at govproposalpro.com/app/login.',
        field: 'email',
      });
    }

    const userId = inserted.rows[0].id;
    res.status(200).json({ ok: true });

    // Fire after the response so a slow CRM or mail server never blocks the success screen.
    // With GHL configured, GHL handles contact, sales task and welcome email; otherwise fall back to email only.
    const followUp = ghl.enabled()
      ? ghl.onRegistered({ email, tier, profile }).then(({ contactId }) =>
          db.query('UPDATE "Users" SET welcome_email_sent_at = now(), ghl_contact_id = $2 WHERE id = $1', [userId, contactId]))
      : sendWelcomeEmail({ email, tier })
          .then(() => db.query('UPDATE "Users" SET welcome_email_sent_at = now() WHERE id = $1', [userId]));
    followUp.catch((err) => console.error(`[signup] follow-up failed for user ${userId}:`, err.message));
  } catch (err) {
    console.error('[register] failed:', err.message);
    return res.status(500).json({ error: 'We could not secure your account right now. Please try again shortly.' });
  }
});

module.exports = router;
