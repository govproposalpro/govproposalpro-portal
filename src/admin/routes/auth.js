'use strict';

// Admin sign-in: password, then authenticator code (enrolled on first sign-in). Plus setup links.

const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const db = require('../../db');
const tokens = require('../../tokens');
const totp = require('../totp');
const { normalizeEmail, isValidEmail, passwordProblem } = require('../../validation');
const { createAdminSession, destroyAdminSession, markMfaPassed, requireAdmin, audit } = require('../session');

const router = express.Router();
const BCRYPT_ROUNDS = 12;
const MAX_FAILED = 5;
const LOCK_MINUTES = 30;
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', 12);

const limiter = (limit) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

async function recordFailure(adminId) {
  await db.query(
    `UPDATE admins SET failed_logins = failed_logins + 1,
            locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
      WHERE id = $1`,
    [adminId, MAX_FAILED, LOCK_MINUTES]
  );
}

router.post('/admin/auth/login', limiter(15), express.json({ limit: '4kb' }), async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    const password = req.body && req.body.password;
    if (!isValidEmail(email) || typeof password !== 'string' || !password) return res.status(400).json({ error: 'Enter your email and password.' });
    const { rows } = await db.query(
      'SELECT id, password_hash, locked_until, disabled_at, totp_enabled FROM admins WHERE lower(email) = $1', [email]);
    const admin = rows[0];
    const ok = await bcrypt.compare(password.slice(0, 200), (admin && admin.password_hash) || DUMMY_HASH);
    if (admin && admin.locked_until && new Date(admin.locked_until) > new Date()) {
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes or ask an owner to unlock you.` });
    }
    if (!admin || !admin.password_hash || !ok || admin.disabled_at) {
      if (admin) await recordFailure(admin.id);
      return res.status(401).json({ error: 'That email and password do not match an admin account.' });
    }
    await createAdminSession(req, res, admin.id);
    req.admin = { id: admin.id };
    await audit(req, 'admin.password_ok');
    res.json({ next: admin.totp_enabled ? 'verify' : 'enroll' });
  } catch (err) {
    next(err);
  }
});

// Starts (or restarts) authenticator enrollment for an admin who has not finished it.
router.post('/admin/auth/mfa/enroll/start', requireAdmin({ mfa: false }), async (req, res, next) => {
  try {
    if (req.admin.totp_enabled) return res.status(400).json({ error: 'Your authenticator is already set up.' });
    const secret = totp.generateSecret();
    await db.query('UPDATE admins SET totp_secret = $2 WHERE id = $1', [req.admin.id, secret]);
    const url = totp.otpauthUrl(secret, req.admin.email);
    res.json({ secret, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/auth/mfa/enroll', requireAdmin({ mfa: false }), limiter(20), express.json({ limit: '1kb' }), async (req, res, next) => {
  try {
    if (req.admin.totp_enabled || !req.admin.totp_secret) return res.status(400).json({ error: 'Start enrollment first.' });
    const step = totp.verify(req.admin.totp_secret, req.body && req.body.code);
    if (step === null) return res.status(400).json({ error: 'That code did not match. Check the time on your phone and try the newest code.' });
    await db.query('UPDATE admins SET totp_enabled = true, totp_last_step = $2, failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [req.admin.id, step]);
    await markMfaPassed(req);
    await audit(req, 'admin.mfa_enrolled');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/auth/mfa/verify', requireAdmin({ mfa: false }), limiter(20), express.json({ limit: '1kb' }), async (req, res, next) => {
  try {
    if (!req.admin.totp_enabled) return res.status(400).json({ error: 'Set up your authenticator first.' });
    const step = totp.verify(req.admin.totp_secret, req.body && req.body.code, req.admin.totp_last_step);
    if (step === null) {
      await recordFailure(req.admin.id);
      await audit(req, 'admin.mfa_failed');
      return res.status(400).json({ error: 'That code did not match. Try the newest code in your authenticator app.' });
    }
    await db.query('UPDATE admins SET totp_last_step = $2, failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [req.admin.id, step]);
    await markMfaPassed(req);
    await audit(req, 'admin.login');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/auth/logout', async (req, res, next) => {
  try {
    await destroyAdminSession(req, res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/admin/me', requireAdmin({ mfa: false }), (req, res) => {
  const a = req.admin;
  res.json({
    admin: { id: a.id, email: a.email, fullName: a.full_name, role: a.role },
    mfa: { enrolled: a.totp_enabled, passed: a.mfa_passed },
  });
});

router.post('/admin/me/password', requireAdmin(), limiter(10), express.json({ limit: '4kb' }), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await db.query('SELECT password_hash FROM admins WHERE id = $1', [req.admin.id]);
    if (typeof b.currentPassword !== 'string' || !(await bcrypt.compare(b.currentPassword.slice(0, 200), rows[0].password_hash))) {
      return res.status(400).json({ error: 'Your current password is not correct.' });
    }
    const problem = passwordProblem(b.password, b.confirmPassword);
    if (problem) return res.status(400).json({ error: problem });
    await db.query('UPDATE admins SET password_hash = $2 WHERE id = $1', [req.admin.id, await bcrypt.hash(b.password, BCRYPT_ROUNDS)]);
    await audit(req, 'admin.password_changed');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- setup links (new admins, admin resets)

router.post('/admin/auth/setup/check', limiter(20), express.json({ limit: '1kb' }), async (req, res, next) => {
  try {
    const t = await tokens.peek(req.body && req.body.token, ['admin_setup']);
    if (!t) return res.status(400).json({ error: 'This setup link has expired or was already used. Ask an owner for a new one.' });
    const { rows } = await db.query('SELECT email, full_name FROM admins WHERE id = $1 AND disabled_at IS NULL', [t.subject_id]);
    if (!rows[0]) return res.status(400).json({ error: 'This setup link is no longer valid.' });
    res.json({ email: rows[0].email, fullName: rows[0].full_name });
  } catch (err) {
    next(err);
  }
});

// Sets a new password. Resets MFA too, so a lost phone is recovered with the same link.
router.post('/admin/auth/setup', limiter(10), express.json({ limit: '4kb' }), async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const b = req.body || {};
    const problem = passwordProblem(b.password, b.confirmPassword);
    if (problem) return res.status(400).json({ error: problem });
    const hash = await bcrypt.hash(b.password, BCRYPT_ROUNDS);
    await client.query('BEGIN');
    const t = await tokens.consume(b.token, ['admin_setup'], client);
    if (!t) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This setup link has expired or was already used. Ask an owner for a new one.' });
    }
    await client.query(
      `UPDATE admins SET password_hash = $2, totp_enabled = false, totp_secret = NULL, totp_last_step = NULL,
              failed_logins = 0, locked_until = NULL WHERE id = $1`, [t.subject_id, hash]);
    await client.query('DELETE FROM admin_sessions WHERE admin_id = $1', [t.subject_id]);
    await client.query(`INSERT INTO admin_audit (admin_id, action, ip) VALUES ($1, 'admin.setup_completed', $2)`, [t.subject_id, String(req.ip || '').slice(0, 64)]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
