'use strict';

/**
 * Beginner growth tools: First Win Path (checklist from LLC to first award, every member) and
 * Recompete Radar (contracts ending in 3 to 18 months; Core sees a preview, Enterprise the full
 * list). Both run on free government data (SAM.gov Entity API, USAspending.gov). No AI calls.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const sam = require('../sam');
const { requireAuth, requireFeature } = require('../session');
const { hasFeature } = require('../tiers');
const { pathFor, KEYS } = require('../firstwin');
const recompete = require('../recompete');
const samkey = require('../samkey');

const router = express.Router();
const CORE_PREVIEW = 3;
const SAM_RECHECK_HOURS = 24;

const perUser = (limit) => rateLimit({
  windowMs: 60 * 1000,
  limit,
  keyGenerator: (req) => `u${req.user.id}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Slow down a little. Try again in a minute.' },
});

/** The member row plus the First Win columns (kept off the session query on purpose). */
async function withFirstWin(user) {
  const { rows } = await db.query('SELECT first_win, sam_checked FROM "Users" WHERE id = $1', [user.id]);
  return { ...user, ...(rows[0] || {}) };
}

// ---------------------------------------------------------------- First Win Path

router.get('/first-win', requireAuth, requireFeature('first_win'), async (req, res, next) => {
  try {
    res.json(await pathFor(await withFirstWin(req.user)));
  } catch (err) { next(err); }
});

router.patch('/me/first-win', requireAuth, requireFeature('first_win'), express.json({ limit: '2kb' }), async (req, res, next) => {
  try {
    const { step, done } = req.body || {};
    if (!KEYS.includes(step) || typeof done !== 'boolean') return res.status(400).json({ error: 'Unknown step.' });
    await db.query(
      `UPDATE "Users" SET first_win = CASE WHEN $3 THEN first_win || jsonb_build_object($2::text, to_char(now(), 'YYYY-MM-DD'))
                                           ELSE first_win - $2::text END
        WHERE id = $1`,
      [req.user.id, step, done]
    );
    res.json(await pathFor(await withFirstWin(req.user)));
  } catch (err) { next(err); }
});

/**
 * Checks the member's own UEI in SAM.gov. One live call per member per day at most (the platform
 * key has a small daily quota); fills in a missing CAGE code and expiration date on the profile.
 */
router.post('/first-win/sam-check', requireAuth, requireFeature('first_win'), perUser(3), async (req, res, next) => {
  try {
    const user = await withFirstWin(req.user);
    if (!user.uei) return res.status(400).json({ error: 'Add your 12-character UEI to your profile first.' });
    const last = user.sam_checked;
    const fresh = last && last.uei === user.uei && Date.now() - Date.parse(last.checkedAt) < SAM_RECHECK_HOURS * 3600_000;
    if (!fresh) {
      if (!(await samkey.available(user.id))) return res.status(503).json({ error: 'Add your SAM.gov API key in your profile to run this check.' });
      let result;
      try {
        result = await samkey.withKey(user.id, (key) => sam.registration(user.uei, key));
      } catch (err) {
        console.error('[first-win] SAM.gov check failed:', err.message);
        return res.status(502).json({ error: err.userMessage || 'SAM.gov did not respond. Please try again later.' });
      }
      const checked = { ...result, uei: user.uei };
      const expires = /^\d{4}-\d{2}-\d{2}$/.test(result.expires || '') ? result.expires : null;
      const cage = /^[A-Z0-9]{5}$/.test(result.cage || '') ? result.cage : null;
      await db.query(
        `UPDATE "Users" SET sam_checked = $2,
                cage_code = COALESCE(cage_code, $3),
                sam_expires_on = CASE WHEN $4::date IS NOT NULL THEN $4::date ELSE sam_expires_on END,
                sam_status = CASE WHEN $5 THEN 'active' ELSE sam_status END
          WHERE id = $1`,
        [user.id, checked, cage, expires, result.active]
      );
      user.sam_checked = checked;
    }
    res.json(await pathFor(user));
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- The member's own SAM.gov API key

router.get('/me/sam-key', requireAuth, async (req, res, next) => {
  try {
    res.json({ samKey: await samkey.status(req.user.id) });
  } catch (err) { next(err); }
});

router.put('/me/sam-key', requireAuth, perUser(5), express.json({ limit: '2kb' }), async (req, res, next) => {
  try {
    const b = req.body || {};
    let status;
    try {
      status = await samkey.save(req.user.id, b.key, b.expiresOn || null);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json({ samKey: status });
  } catch (err) { next(err); }
});

router.delete('/me/sam-key', requireAuth, async (req, res, next) => {
  try {
    await samkey.remove(req.user.id);
    res.json({ samKey: await samkey.status(req.user.id) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- Recompete Radar

router.get('/recompete', requireAuth, requireFeature('recompete_radar'), perUser(10), async (req, res, next) => {
  try {
    const full = hasFeature(req.user.tier, 'recompete_full');
    const fromQuery = recompete.naicsCodes(req.query.naics, 3);
    const codes = fromQuery.length ? fromQuery : recompete.naicsCodes(req.user.naics, 3);
    const stateParam = typeof req.query.state === 'string' ? req.query.state : undefined;
    const state = stateParam === undefined ? recompete.stateFromAddress(req.user.address) : recompete.stateCode(stateParam);
    const profileCodes = recompete.naicsCodes(req.user.naics, 6);
    if (!codes.length) return res.json({ needsNaics: true, codes: [], profileCodes, state, awards: [], total: 0, full });

    let data;
    try {
      data = await recompete.radar({ codes, state });
    } catch (err) {
      console.error('[recompete] failed:', err.message);
      return res.status(502).json({ error: 'USAspending.gov did not respond. Please try again in a few minutes.' });
    }
    if (data.failed.length === codes.length) return res.status(502).json({ error: 'USAspending.gov did not respond. Please try again in a few minutes.' });

    // Which of these the member already tracks in the Bid CRM (matched on the award id).
    const tracked = await db.query(
      `SELECT solicitation_number FROM bids WHERE user_id = $1 AND solicitation_number = ANY($2::text[])`,
      [req.user.id, data.awards.map((a) => a.id)]
    );
    const trackedIds = new Set(tracked.rows.map((r) => r.solicitation_number));
    const awards = data.awards.map((a) => ({ ...a, tracked: trackedIds.has(a.id) }));
    const totalValue = awards.reduce((s, a) => s + a.value, 0);
    res.json({
      codes, profileCodes, state: data.state, from: data.from, to: data.to, minValue: data.minValue,
      partial: data.partial, failed: data.failed, full,
      total: awards.length, totalValue,
      awards: full ? awards.slice(0, 500) : awards.slice(0, CORE_PREVIEW),
      hidden: full ? 0 : Math.max(0, awards.length - CORE_PREVIEW),
    });
  } catch (err) { next(err); }
});

module.exports = { router };
