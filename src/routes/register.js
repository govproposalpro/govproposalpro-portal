'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { sendWelcomeEmail } = require('../services/email');
const { normalizeEmail, isValidEmail, passwordProblem } = require('../validation');

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

router.post('/register', registerLimiter, express.json({ limit: '4kb' }), async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const email = normalizeEmail(body.email);
  const { password, confirmPassword } = body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const problem = passwordProblem(password, confirmPassword);
  if (problem) {
    return res.status(400).json({ error: problem });
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
        });
      }
      tier = purchase.rows[0].tier;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const inserted = await db.query(
      `INSERT INTO "Users" (email, password_hash, tier)
       VALUES ($1, $2, $3)
       ON CONFLICT ((lower(email))) DO NOTHING
       RETURNING id`,
      [email, passwordHash, tier]
    );

    if (inserted.rowCount === 0) {
      return res.status(409).json({
        error: 'An account already exists for this email. Your access will arrive on Sunday, October 18th.',
      });
    }

    const userId = inserted.rows[0].id;
    res.status(200).json({ ok: true });

    // Fire after the response so a slow mail server never blocks the success screen.
    sendWelcomeEmail({ email, tier })
      .then(() => db.query('UPDATE "Users" SET welcome_email_sent_at = now() WHERE id = $1', [userId]))
      .catch((err) => console.error(`[email] welcome email failed for user ${userId}:`, err.message));
  } catch (err) {
    console.error('[register] failed:', err.message);
    return res.status(500).json({ error: 'We could not secure your account right now. Please try again shortly.' });
  }
});

module.exports = router;
