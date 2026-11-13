'use strict';

/**
 * Team login (Enterprise): the owner invites a VA or partner by email. The invitee sets a password
 * from the invite link (the member_invite flow in auth.js) and then works inside the owner's
 * account with owner-only settings locked (see seatBlocked in src/app/session.js).
 */

const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const { normalizeEmail, isValidEmail } = require('../../validation');
const { requireAuth, requireFeature } = require('../session');
const { sendMemberLink } = require('./auth');

const router = express.Router();
const MAX_SEATS = Math.max(1, Number.parseInt(process.env.TEAM_SEATS || '1', 10) || 1);

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `u${req.user.id}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many invites in a short time. Try again later.' },
});
const gate = [requireAuth, requireFeature('team_seats')];

const seatRow = (r) => ({ id: r.id, email: r.email, name: r.full_name || '', status: r.status, lastLoginAt: r.last_login_at, createdAt: r.created_at });

async function seats(ownerId) {
  const { rows } = await db.query(
    `SELECT id, email, full_name, status, last_login_at, created_at FROM "Users" WHERE team_owner_id = $1 ORDER BY created_at`, [ownerId]);
  return rows.map(seatRow);
}

router.get('/team', ...gate, async (req, res, next) => {
  try {
    res.json({ seats: await seats(req.user.id), max: MAX_SEATS });
  } catch (err) { next(err); }
});

router.post('/team', ...gate, limiter, express.json({ limit: '2kb' }), async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    const name = String((req.body && req.body.name) || '').trim().slice(0, 120);
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email.' });
    if (email === normalizeEmail(req.user.email)) return res.status(400).json({ error: 'That is your own email. Invite your VA or partner.' });
    const existing = await seats(req.user.id);
    if (existing.length >= MAX_SEATS) return res.status(400).json({ error: `Enterprise includes ${MAX_SEATS} team login${MAX_SEATS === 1 ? '' : 's'}. Remove one first.` });
    const taken = await db.query('SELECT 1 FROM "Users" WHERE lower(email) = $1', [email]);
    if (taken.rowCount) return res.status(400).json({ error: 'That email already has a GovProposalPro login. Use a different email for the team login.' });
    // A random password nobody knows until the invitee sets their own from the link.
    const placeholder = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 10);
    const { rows } = await db.query(
      `INSERT INTO "Users" (email, password_hash, status, full_name, team_owner_id, email_alerts)
       VALUES ($1, $2, 'invited', $3, $4, false) RETURNING id, email, full_name, status, last_login_at, created_at`,
      [email, placeholder, name || null, req.user.id]);
    const seat = rows[0];
    let link;
    try {
      link = await sendMemberLink({ id: seat.id }, email, 'member_invite');
    } catch (err) {
      console.error('[team] invite email failed:', err.message);
      link = { emailed: false };
    }
    res.status(201).json({ seat: seatRow(seat), emailed: Boolean(link.emailed), ...(link.emailed ? {} : { url: link.url }) });
  } catch (err) { next(err); }
});

router.post('/team/:id/resend', ...gate, limiter, async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT id, email, status FROM "Users" WHERE id = $1 AND team_owner_id = $2`, [Number.parseInt(req.params.id, 10) || 0, req.user.id]);
    const seat = rows[0];
    if (!seat) return res.status(404).json({ error: 'Not found' });
    if (seat.status !== 'invited') return res.status(400).json({ error: 'They have already set up their login.' });
    const link = await sendMemberLink({ id: seat.id }, seat.email, 'member_invite');
    res.json({ emailed: Boolean(link.emailed), ...(link.emailed ? {} : { url: link.url }) });
  } catch (err) { next(err); }
});

router.delete('/team/:id', ...gate, async (req, res, next) => {
  try {
    const { rowCount } = await db.query(`DELETE FROM "Users" WHERE id = $1 AND team_owner_id = $2`, [Number.parseInt(req.params.id, 10) || 0, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = { router };
