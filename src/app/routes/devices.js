'use strict';

/**
 * iPhone app: saves and removes the member's push notification token (see src/services/apns.js).
 * The app calls POST after the member allows notifications, and DELETE when they sign out.
 */

const express = require('express');
const db = require('../../db');
const { requireAuth } = require('../session');
const { TOKEN_RE } = require('../../services/apns');

const router = express.Router();
const body = express.json({ limit: '1kb' });

router.post('/devices', requireAuth, body, async (req, res, next) => {
  try {
    const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
    if (!TOKEN_RE.test(token)) return res.status(400).json({ error: 'Invalid device token.' });
    // A phone belongs to whoever signed in on it last.
    await db.query(
      `INSERT INTO push_devices (user_id, token, platform) VALUES ($1, $2, 'ios')
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, last_seen_at = now()`,
      [req.user.id, token]
    );
    // Keep at most 10 phones per member.
    await db.query(
      `DELETE FROM push_devices WHERE user_id = $1 AND id NOT IN
         (SELECT id FROM push_devices WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 10)`,
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/devices', requireAuth, body, async (req, res, next) => {
  try {
    const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
    if (TOKEN_RE.test(token)) await db.query('DELETE FROM push_devices WHERE token = $1 AND user_id = $2', [token, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = { router };
