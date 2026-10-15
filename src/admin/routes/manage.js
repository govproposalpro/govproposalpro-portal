'use strict';

/**
 * What the team and VAs do from the admin dashboard: look up members, edit their profile and
 * tier, send password resets, lock and unlock, and grant or revoke access. Owners also manage
 * admin accounts and read the audit log. Every change is written to admin_audit.
 */

const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../../db');
const tokens = require('../../tokens');
const mailer = require('../../services/mailer');
const { buildLinkEmail } = require('../../services/email');
const { normalizeEmail, isValidEmail } = require('../../validation');
const { publicProfile, parseProfileUpdate } = require('../../app/profile');
const { proposalUsage } = require('../../app/quota');
const { sendMemberLink } = require('../../app/routes/auth');
const { requireAdmin, requireOwner, audit } = require('../session');

const router = express.Router();
const TIERS = ['core', 'enterprise'];

router.use('/admin', (req, res, next) => (req.path.startsWith('/auth/') || req.path === '/me' ? next() : requireAdmin()(req, res, next)));

const toId = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max) : '');
const unusableHash = () => bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

// ---------------------------------------------------------------- overview

router.get('/admin/stats', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT (SELECT count(*) FROM "Users")::int AS members,
             (SELECT count(*) FROM "Users" WHERE last_login_at > now() - interval '7 days')::int AS active7,
             (SELECT count(*) FROM "Users" WHERE onboarded_at IS NOT NULL)::int AS onboarded,
             (SELECT count(*) FROM authorized_purchasers WHERE revoked_at IS NULL)::int AS access_active,
             (SELECT count(*) FROM authorized_purchasers ap WHERE revoked_at IS NULL
                 AND NOT EXISTS (SELECT 1 FROM "Users" u WHERE lower(u.email) = lower(ap.email)))::int AS access_unclaimed,
             (SELECT count(*) FROM proposals WHERE created_at > date_trunc('month', now()) AND status <> 'failed')::int AS proposals_month,
             (SELECT count(*) FROM "Users" WHERE locked_until > now())::int AS locked`);
    res.json({ stats: rows[0] });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- members

const MEMBER_LIST = `
  SELECT u.id, u.email, u.full_name AS "fullName", u.business_name AS "businessName", u.phone,
         COALESCE(ap.tier, u.tier) AS tier, u.status,
         CASE WHEN ap.id IS NULL THEN 'none' WHEN ap.revoked_at IS NOT NULL THEN 'revoked' ELSE 'active' END AS access,
         u.last_login_at AS "lastLoginAt", u.created_at AS "createdAt",
         (u.locked_until > now()) AS locked, (u.onboarded_at IS NOT NULL) AS onboarded
    FROM "Users" u LEFT JOIN authorized_purchasers ap ON lower(ap.email) = lower(u.email)`;

router.get('/admin/members', async (req, res, next) => {
  try {
    const q = clean(req.query.q, 100);
    const page = Math.max(0, Number.parseInt(req.query.page, 10) || 0);
    const params = [];
    let where = '';
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      where = `WHERE u.email ILIKE $1 OR u.full_name ILIKE $1 OR u.business_name ILIKE $1 OR u.phone ILIKE $1`;
    }
    params.push(50, page * 50);
    const { rows } = await db.query(
      `${MEMBER_LIST} ${where} ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ members: rows, page, more: rows.length === 50 });
  } catch (err) { next(err); }
});

async function loadMember(id) {
  const { rows } = await db.query(
    `SELECT u.*, COALESCE(ap.tier, u.tier) AS effective_tier, ap.id AS purchase_id, ap.revoked_at, ap.source AS purchase_source
       FROM "Users" u LEFT JOIN authorized_purchasers ap ON lower(ap.email) = lower(u.email) WHERE u.id = $1`, [id]);
  return rows[0] || null;
}

router.get('/admin/members/:id', async (req, res, next) => {
  try {
    const u = await loadMember(toId(req.params.id));
    if (!u) return res.status(404).json({ error: 'Member not found.' });
    const counts = await db.query(
      `SELECT (SELECT count(*) FROM bids WHERE user_id = $1)::int AS bids,
              (SELECT count(*) FROM proposals WHERE user_id = $1 AND status = 'ready')::int AS proposals,
              (SELECT count(*) FROM company_documents WHERE user_id = $1)::int AS documents,
              (SELECT count(*) FROM sessions WHERE user_id = $1 AND expires_at > now())::int AS sessions`, [u.id]);
    await audit(req, 'member.viewed', u.email);
    res.json({
      member: {
        id: u.id,
        ...publicProfile(u),
        tier: u.effective_tier || 'core',
        status: u.status,
        access: !u.purchase_id ? 'none' : u.revoked_at ? 'revoked' : 'active',
        accessSource: u.purchase_source,
        locked: Boolean(u.locked_until && new Date(u.locked_until) > new Date()),
        failedLogins: u.failed_logins,
        lastLoginAt: u.last_login_at,
        createdAt: u.created_at,
        annualRevenue: u.annual_revenue,
        primaryGoal: u.primary_goal,
      },
      counts: counts.rows[0],
      usage: await proposalUsage(u.id, u.effective_tier),
    });
  } catch (err) { next(err); }
});

router.patch('/admin/members/:id', express.json({ limit: '128kb' }), async (req, res, next) => {
  try {
    const u = await loadMember(toId(req.params.id));
    if (!u) return res.status(404).json({ error: 'Member not found.' });
    const b = req.body || {};
    let parsed;
    try {
      parsed = parseProfileUpdate(b);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const changes = Object.keys(b).filter((k) => b[k] !== undefined);
    if (b.tier !== undefined && !TIERS.includes(b.tier)) return res.status(400).json({ error: 'Tier must be Core or Enterprise.' });
    if (b.status !== undefined && !['active', 'disabled'].includes(b.status)) return res.status(400).json({ error: 'Invalid status.' });

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      if (parsed.sets.length) await client.query(`UPDATE "Users" SET ${parsed.sets.join(', ')} WHERE id = $1`, [u.id, ...parsed.values]);
      if (b.tier) {
        await client.query('UPDATE "Users" SET tier = $2 WHERE id = $1', [u.id, b.tier]);
        await client.query('UPDATE authorized_purchasers SET tier = $2 WHERE lower(email) = lower($1)', [u.email, b.tier]);
      }
      if (b.status) {
        await client.query('UPDATE "Users" SET status = $2 WHERE id = $1', [u.id, b.status]);
        if (b.status === 'disabled') await client.query('DELETE FROM sessions WHERE user_id = $1', [u.id]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    await audit(req, 'member.updated', u.email, { fields: changes });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Emails the member a reset link (when email is set up) and always returns it so a VA can share it.
router.post('/admin/members/:id/reset-link', async (req, res, next) => {
  try {
    const u = await loadMember(toId(req.params.id));
    if (!u) return res.status(404).json({ error: 'Member not found.' });
    const kind = u.status === 'invited' ? 'member_invite' : 'member_reset';
    let link;
    try {
      link = await sendMemberLink(u, u.email, kind, req.admin.id);
    } catch (err) {
      console.error('[admin] reset email failed:', err.message);
      link = { ...(await tokens.issue(kind, u.id, req.admin.id)), emailed: false };
    }
    await audit(req, 'member.reset_link', u.email, { emailed: link.emailed });
    res.json({ url: link.url, emailed: link.emailed, expires: tokens.expiresLabel(link.expiresMinutes) });
  } catch (err) { next(err); }
});

router.post('/admin/members/:id/unlock', async (req, res, next) => {
  try {
    const { rows } = await db.query('UPDATE "Users" SET failed_logins = 0, locked_until = NULL WHERE id = $1 RETURNING email', [toId(req.params.id)]);
    if (!rows[0]) return res.status(404).json({ error: 'Member not found.' });
    await audit(req, 'member.unlocked', rows[0].email);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/admin/members/:id/sign-out', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT email FROM "Users" WHERE id = $1', [toId(req.params.id)]);
    if (!rows[0]) return res.status(404).json({ error: 'Member not found.' });
    const del = await db.query('DELETE FROM sessions WHERE user_id = $1', [toId(req.params.id)]);
    await audit(req, 'member.signed_out', rows[0].email, { sessions: del.rowCount });
    res.json({ ok: true, sessions: del.rowCount });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- access (who may have an account)

router.get('/admin/access', async (req, res, next) => {
  try {
    const q = clean(req.query.q, 100);
    const params = [];
    let where = '';
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      where = 'WHERE ap.email ILIKE $1';
    }
    const { rows } = await db.query(
      `SELECT ap.id, ap.email, ap.tier, ap.source, ap.whop_ref AS "whopRef", ap.revoked_at AS "revokedAt",
              ap.created_at AS "createdAt", u.id AS "memberId", u.status AS "memberStatus"
         FROM authorized_purchasers ap LEFT JOIN "Users" u ON lower(u.email) = lower(ap.email)
         ${where} ORDER BY ap.created_at DESC LIMIT 200`, params);
    res.json({ access: rows });
  } catch (err) { next(err); }
});

/**
 * Generate access: allow an email in (Core or Enterprise) and, when no account exists yet,
 * create one and send the member an invite link to set their password.
 */
router.post('/admin/access', express.json({ limit: '4kb' }), async (req, res, next) => {
  try {
    const b = req.body || {};
    const email = normalizeEmail(b.email);
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!TIERS.includes(b.tier)) return res.status(400).json({ error: 'Choose Core or Enterprise.' });
    const fullName = clean(b.fullName, 120) || null;

    await db.query(
      `INSERT INTO authorized_purchasers (email, tier, source) VALUES ($1, $2, 'manual')
       ON CONFLICT ((lower(email))) DO UPDATE SET tier = EXCLUDED.tier, revoked_at = NULL`,
      [email, b.tier]
    );
    let member = (await db.query('SELECT id, status, ghl_contact_id FROM "Users" WHERE lower(email) = $1', [email])).rows[0];
    let created = false;
    if (!member) {
      member = (await db.query(
        `INSERT INTO "Users" (email, password_hash, tier, status, full_name) VALUES ($1, $2, $3, 'invited', $4)
         ON CONFLICT ((lower(email))) DO NOTHING RETURNING id, status, ghl_contact_id`,
        [email, await unusableHash(), b.tier, fullName]
      )).rows[0];
      created = Boolean(member);
      if (!member) member = (await db.query('SELECT id, status, ghl_contact_id FROM "Users" WHERE lower(email) = $1', [email])).rows[0];
    } else {
      await db.query('UPDATE "Users" SET tier = $2 WHERE id = $1', [member.id, b.tier]);
    }

    let invite = null;
    if (member.status === 'invited') {
      try {
        invite = await sendMemberLink(member, email, 'member_invite', req.admin.id);
      } catch (err) {
        console.error('[admin] invite email failed:', err.message);
        invite = { ...(await tokens.issue('member_invite', member.id, req.admin.id)), emailed: false };
      }
    }
    await audit(req, 'access.granted', email, { tier: b.tier, accountCreated: created, invited: Boolean(invite) });
    res.status(201).json({
      ok: true,
      memberId: member.id,
      accountCreated: created,
      invite: invite && { url: invite.url, emailed: invite.emailed, expires: tokens.expiresLabel(invite.expiresMinutes) },
    });
  } catch (err) { next(err); }
});

router.patch('/admin/access/:id', express.json({ limit: '2kb' }), async (req, res, next) => {
  try {
    const b = req.body || {};
    const id = toId(req.params.id);
    const sets = [];
    const params = [id];
    if (b.tier !== undefined) {
      if (!TIERS.includes(b.tier)) return res.status(400).json({ error: 'Choose Core or Enterprise.' });
      params.push(b.tier);
      sets.push(`tier = $${params.length}`);
    }
    if (b.revoked !== undefined) sets.push(b.revoked ? 'revoked_at = now()' : 'revoked_at = NULL');
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
    const { rows } = await db.query(`UPDATE authorized_purchasers SET ${sets.join(', ')} WHERE id = $1 RETURNING email, tier`, params);
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    if (b.tier) await db.query('UPDATE "Users" SET tier = $2 WHERE lower(email) = lower($1)', [rows[0].email, b.tier]);
    if (b.revoked) {
      await db.query('DELETE FROM sessions WHERE user_id IN (SELECT id FROM "Users" WHERE lower(email) = lower($1))', [rows[0].email]);
    }
    await audit(req, b.revoked === true ? 'access.revoked' : b.revoked === false ? 'access.restored' : 'access.tier_changed', rows[0].email, { tier: rows[0].tier });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- admin accounts (owners only)

async function sendAdminSetup(admin, createdBy) {
  const link = await tokens.issue('admin_setup', admin.id, createdBy);
  let emailed = false;
  if (mailer.canSend()) {
    try {
      await mailer.send({
        to: admin.email,
        tags: ['gpp-staff'],
        ...buildLinkEmail({
          eyebrow: 'Team access',
          heading: 'Set up your GovProposalPro admin login',
          intro: 'You have been given access to the GovProposalPro admin dashboard. Create your password, then scan the QR code with an authenticator app (Google Authenticator, Authy or 1Password) to finish setting up two-step sign-in.',
          href: link.url,
          cta: 'Set up my admin login',
          expires: tokens.expiresLabel(link.expiresMinutes),
        }),
      });
      emailed = true;
    } catch (err) {
      console.error('[admin] setup email failed:', err.message);
    }
  }
  return { url: link.url, emailed, expires: tokens.expiresLabel(link.expiresMinutes) };
}

router.get('/admin/admins', requireOwner, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, email, full_name AS "fullName", role, (password_hash IS NOT NULL) AS "passwordSet", totp_enabled AS "mfaEnabled",
              disabled_at AS "disabledAt", last_login_at AS "lastLoginAt", (locked_until > now()) AS locked, created_at AS "createdAt"
         FROM admins ORDER BY role DESC, created_at`);
    res.json({ admins: rows });
  } catch (err) { next(err); }
});

router.post('/admin/admins', requireOwner, express.json({ limit: '2kb' }), async (req, res, next) => {
  try {
    const b = req.body || {};
    const email = normalizeEmail(b.email);
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const role = b.role === 'owner' ? 'owner' : 'va';
    const { rows } = await db.query(
      `INSERT INTO admins (email, full_name, role, created_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT ((lower(email))) DO NOTHING RETURNING id, email`,
      [email, clean(b.fullName, 120) || null, role, req.admin.id]);
    if (!rows[0]) return res.status(409).json({ error: 'An admin with that email already exists.' });
    const setup = await sendAdminSetup(rows[0], req.admin.id);
    await audit(req, 'admin.created', email, { role, emailed: setup.emailed });
    res.status(201).json({ id: rows[0].id, setup });
  } catch (err) { next(err); }
});

router.patch('/admin/admins/:id', requireOwner, express.json({ limit: '2kb' }), async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const b = req.body || {};
    if (id === req.admin.id && (b.disabled === true || b.role === 'va')) return res.status(400).json({ error: "You can't disable or demote yourself." });
    const sets = [];
    const params = [id];
    if (b.fullName !== undefined) { params.push(clean(b.fullName, 120) || null); sets.push(`full_name = $${params.length}`); }
    if (b.email !== undefined) {
      const email = normalizeEmail(b.email);
      if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
      params.push(email); sets.push(`email = $${params.length}`);
    }
    if (b.role !== undefined) { params.push(b.role === 'owner' ? 'owner' : 'va'); sets.push(`role = $${params.length}`); }
    if (b.disabled !== undefined) sets.push(b.disabled ? 'disabled_at = now()' : 'disabled_at = NULL');
    if (b.unlock) sets.push('failed_logins = 0, locked_until = NULL');
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
    let rows;
    try {
      ({ rows } = await db.query(`UPDATE admins SET ${sets.join(', ')} WHERE id = $1 RETURNING email`, params));
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Another admin already uses that email.' });
      throw err;
    }
    if (!rows[0]) return res.status(404).json({ error: 'Admin not found.' });
    if (b.disabled) await db.query('DELETE FROM admin_sessions WHERE admin_id = $1', [id]);
    await audit(req, 'admin.updated', rows[0].email, { fields: Object.keys(b) });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// New setup link: used for first-time setup, a forgotten password or a lost authenticator.
router.post('/admin/admins/:id/setup-link', requireOwner, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT id, email FROM admins WHERE id = $1', [toId(req.params.id)]);
    if (!rows[0]) return res.status(404).json({ error: 'Admin not found.' });
    const setup = await sendAdminSetup(rows[0], req.admin.id);
    await audit(req, 'admin.setup_link', rows[0].email, { emailed: setup.emailed });
    res.json(setup);
  } catch (err) { next(err); }
});

router.get('/admin/audit', requireOwner, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT l.id, l.action, l.target, l.detail, l.ip, l.created_at AS "createdAt", a.email AS "adminEmail"
         FROM admin_audit l LEFT JOIN admins a ON a.id = l.admin_id
        ORDER BY l.created_at DESC LIMIT 300`);
    res.json({ entries: rows });
  } catch (err) { next(err); }
});

module.exports = router;
