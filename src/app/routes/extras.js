'use strict';

/**
 * Capability Statement Generator, SAM.gov Registration Checklist, Sub-Safe SAM.gov Vetting and
 * the deadline alert feed. (The Limits on Subcontracting checker is pure math in the browser.)
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const ai = require('../ai');
const sam = require('../sam');
const { requireAuth, requireFeature } = require('../session');
const { aiProfile } = require('../profile');
const { documentContext } = require('./profile');
const { upcomingAlerts } = require('../alerts');

const router = express.Router();
const STATEMENTS_PER_DAY = 10;

const perUser = (limit) => rateLimit({
  windowMs: 60 * 1000,
  limit,
  keyGenerator: (req) => `u${req.user.id}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Slow down a little. Try again in a minute.' },
});
const toId = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

// ---------------------------------------------------------------- Capability Statement Generator

router.post('/capability-statements', requireAuth, requireFeature('capability_statement'), perUser(4), async (req, res, next) => {
  try {
    if (!ai.enabled()) return res.status(503).json({ error: 'AI features are being switched on. Please try again shortly.' });
    const today = await db.query(
      `SELECT count(*)::int AS n FROM capability_statements WHERE user_id = $1 AND created_at > now() - interval '1 day'`,
      [req.user.id]
    );
    if (today.rows[0].n >= STATEMENTS_PER_DAY) return res.status(429).json({ error: `You can generate ${STATEMENTS_PER_DAY} capability statements a day. Try again tomorrow.` });
    const { rows } = await db.query('INSERT INTO capability_statements (user_id) VALUES ($1) RETURNING id', [req.user.id]);
    const id = rows[0].id;
    res.status(202).json({ id, status: 'working' });

    const profile = aiProfile(req.user);
    documentContext(req.user.id)
      .then((documents) => ai.writeCapabilityStatement({ profile, documents }))
      .then((md) => db.query(`UPDATE capability_statements SET status = 'ready', content_md = $2, completed_at = now() WHERE id = $1`, [id, md]))
      .catch((err) => {
        console.error(`[capability] ${id} failed:`, err.message);
        const msg = err instanceof ai.AiError ? err.message : 'Something went wrong on our side. Please try again.';
        return db.query(`UPDATE capability_statements SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`, [id, msg]);
      })
      .catch((err) => console.error(`[capability] ${id} could not record result:`, err.message));
  } catch (err) {
    next(err);
  }
});

router.get('/capability-statements', requireAuth, requireFeature('capability_statement'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, status, error, created_at AS "createdAt" FROM capability_statements
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`, [req.user.id]);
    res.json({ statements: rows });
  } catch (err) { next(err); }
});

router.get('/capability-statements/:id', requireAuth, requireFeature('capability_statement'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, status, error, content_md AS "contentMd", created_at AS "createdAt"
         FROM capability_statements WHERE id = $1 AND user_id = $2`, [toId(req.params.id), req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ statement: rows[0] });
  } catch (err) { next(err); }
});

router.patch('/capability-statements/:id', requireAuth, requireFeature('capability_statement'), express.json({ limit: '256kb' }), async (req, res, next) => {
  try {
    const md = req.body && req.body.contentMd;
    if (typeof md !== 'string' || md.length > 100_000) return res.status(400).json({ error: 'Invalid text.' });
    const { rowCount } = await db.query(
      `UPDATE capability_statements SET content_md = $3 WHERE id = $1 AND user_id = $2 AND status = 'ready'`,
      [toId(req.params.id), req.user.id, md]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- SAM.gov Registration Checklist

// Keys match the steps the dashboard shows; progress is stored per member.
const SAM_STEPS = ['login_gov', 'uei', 'docs', 'entity_core', 'assertions', 'reps_certs', 'pocs', 'submit', 'cage', 'active', 'dsbs', 'certs_sba', 'renewal'];

router.patch('/me/sam-checklist', requireAuth, requireFeature('sam_checklist'), express.json({ limit: '2kb' }), async (req, res, next) => {
  try {
    const { step, done } = req.body || {};
    if (!SAM_STEPS.includes(step) || typeof done !== 'boolean') return res.status(400).json({ error: 'Unknown step.' });
    await db.query(
      `UPDATE "Users" SET sam_checklist = CASE WHEN $3 THEN sam_checklist || jsonb_build_object($2::text, to_char(now(), 'YYYY-MM-DD'))
                                               ELSE sam_checklist - $2::text END
        WHERE id = $1`,
      [req.user.id, step, done]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- Sub-Safe SAM.gov Vetting

router.get('/vetting', requireAuth, requireFeature('sub_vetting'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, query, verdict, result, created_at AS "createdAt" FROM sub_vettings
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.user.id]);
    res.json({ vettings: rows, configured: sam.enabled() });
  } catch (err) { next(err); }
});

router.post('/vetting', requireAuth, requireFeature('sub_vetting'), perUser(5), express.json({ limit: '2kb' }), async (req, res, next) => {
  try {
    if (!sam.enabled()) return res.status(503).json({ error: 'SAM.gov vetting is being switched on. Please try again shortly.' });
    const q = typeof req.body?.query === 'string' ? req.body.query.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 200) : '';
    if (q.length < 3) return res.status(400).json({ error: "Enter the subcontractor's legal business name or 12-character UEI." });
    // SAM.gov public keys have a small daily quota, so a recent identical lookup is reused.
    const cached = await db.query(
      `SELECT result FROM sub_vettings WHERE lower(query) = lower($1) AND created_at > now() - interval '12 hours'
        ORDER BY created_at DESC LIMIT 1`, [q]);
    let result = cached.rows[0] && cached.rows[0].result;
    if (!result) try {
      result = await sam.vet(q);
    } catch (err) {
      console.error('[vetting] SAM.gov call failed:', err.message);
      return res.status(502).json({ error: err.userMessage || 'SAM.gov did not respond. Please try again in a few minutes.' });
    }
    const { rows } = await db.query(
      `INSERT INTO sub_vettings (user_id, query, verdict, result) VALUES ($1, $2, $3, $4)
       RETURNING id, query, verdict, result, created_at AS "createdAt"`,
      [req.user.id, q, result.verdict, result]
    );
    res.status(201).json({ vetting: rows[0] });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- Deadline alerts (dashboard feed)

router.get('/alerts', requireAuth, async (req, res, next) => {
  try {
    res.json({ alerts: await upcomingAlerts(req.user.id, 21) });
  } catch (err) { next(err); }
});

module.exports = { router, SAM_STEPS };
