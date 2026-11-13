'use strict';

/**
 * Bid tools for every member: Competition X-Ray (who won this work before and against how many
 * bidders), Sources-Sought Responder (the notice feed; drafts run as AI jobs in aijobs.js),
 * Submission Preflight (rules-only final check of a proposal) and the private calendar feed plus
 * SMS reminders on the Deadline Alerts page.
 */

const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const sam = require('../sam');
const samkey = require('../samkey');
const intel = require('../intel');
const secrets = require('../secrets');
const { requireAuth, requireFeature } = require('../session');
const { xray } = require('../xray');
const preflight = require('../preflight');
const { feedFor } = require('../calendar');
const { baseUrl } = require('../../tokens');
const ghl = require('../../services/ghl');

const router = express.Router();

const perUser = (limit, windowMs = 60 * 1000, message = 'Slow down a little. Try again in a minute.') => rateLimit({
  windowMs,
  limit,
  keyGenerator: (req) => `u${req.user.id}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: message },
});
const toId = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

// ---------------------------------------------------------------- Competition X-Ray

router.get('/xray', requireAuth, requireFeature('competition_xray'), perUser(10), async (req, res, next) => {
  try {
    const q = req.query;
    let seed = {};
    const bidId = toId(q.bid);
    if (bidId) {
      const { rows } = await db.query('SELECT title, agency, naics, place_of_performance FROM bids WHERE id = $1 AND user_id = $2', [bidId, req.user.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      const st = (String(rows[0].place_of_performance || '').toUpperCase().match(/\b([A-Z]{2})\b(?:\s+\d{5})?\s*$/) || [])[1];
      seed = { naics: rows[0].naics, agency: rows[0].agency, keywords: rows[0].title, state: st || '' };
    }
    const pick = (k) => (typeof q[k] === 'string' ? q[k] : seed[k] || '');
    try {
      res.json(await xray({ naics: pick('naics'), agency: pick('agency'), keywords: pick('keywords'), state: pick('state') }));
    } catch (err) {
      if (err.userMessage) return res.status(400).json({ error: err.userMessage });
      console.error('[xray] failed:', err.message);
      return res.status(502).json({ error: 'USAspending.gov did not respond. Please try again in a few minutes.' });
    }
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- Sources-Sought Responder

const naicsList = (s) => [...new Set(String(s || '').match(/\b\d{6}\b/g) || [])].slice(0, 5);
const EARLY = /sources sought|request for information|\brfi\b|special notice/i;

router.get('/sources-sought/notices', requireAuth, requireFeature('sources_sought'), perUser(10), async (req, res, next) => {
  try {
    const codes = naicsList(req.user.naics);
    if (!codes.length) return res.json({ needsNaics: true, codes, notices: [] });
    if (!(await samkey.available(req.user.id))) return res.json({ configured: false, codes, notices: [] });
    let lists;
    try {
      lists = await samkey.withKey(req.user.id, (key) => Promise.all(codes.map((c) => intel.opportunitiesFor(c, key))));
    } catch (err) {
      console.error('[sources-sought] failed:', err.message);
      return res.status(502).json({ error: (err instanceof sam.SamError && err.userMessage) || 'SAM.gov did not respond. Try again in a few minutes.' });
    }
    const seen = new Set();
    const notices = lists.flat().filter((o) => {
      if (!o.noticeId || seen.has(o.noticeId) || !EARLY.test(`${o.type} ${o.title}`)) return false;
      seen.add(o.noticeId);
      const due = Date.parse(o.responseDeadline || '');
      return !Number.isFinite(due) || due > Date.now();
    }).sort((a, b) => String(a.responseDeadline || '9').localeCompare(String(b.responseDeadline || '9')));
    const drafted = await db.query(
      `SELECT id, input->'notice'->>'noticeId' AS notice FROM ai_jobs WHERE user_id = $1 AND kind = 'sources_sought'`, [req.user.id]);
    const draftOf = new Map(drafted.rows.map((r) => [r.notice, r.id]));
    res.json({ configured: true, codes, notices: notices.slice(0, 60).map((o) => ({ ...o, draftId: draftOf.get(o.noticeId) || null })) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- Submission Preflight

async function loadForPreflight(userId, id) {
  const { rows } = await db.query(
    `SELECT p.id, p.title, p.content_md, p.preflight, p.status, s.summary
       FROM proposals p LEFT JOIN rfp_summaries s ON s.id = p.rfp_summary_id AND s.status = 'ready'
      WHERE p.id = $1 AND p.user_id = $2`,
    [id, userId]);
  return rows[0];
}

router.get('/proposals/:id/preflight', requireAuth, requireFeature('submission_preflight'), async (req, res, next) => {
  try {
    const p = await loadForPreflight(req.user.id, toId(req.params.id));
    if (!p) return res.status(404).json({ error: 'Not found' });
    if (p.status !== 'ready') return res.status(409).json({ error: 'The proposal is not finished yet.' });
    res.json({ proposal: { id: p.id, title: p.title }, linked: Boolean(p.summary), ...preflight.check({ proposal: p, summary: p.summary }) });
  } catch (err) { next(err); }
});

router.patch('/proposals/:id/preflight', requireAuth, requireFeature('submission_preflight'), express.json({ limit: '2kb' }), async (req, res, next) => {
  try {
    const { key, done } = req.body || {};
    if (!preflight.MANUAL_KEYS.includes(key) || typeof done !== 'boolean') return res.status(400).json({ error: 'Unknown check.' });
    const { rowCount } = await db.query(
      `UPDATE proposals SET preflight = CASE WHEN $4 THEN COALESCE(preflight, '{}') || jsonb_build_object($3::text, to_char(now(), 'YYYY-MM-DD'))
                                             ELSE COALESCE(preflight, '{}') - $3::text END
        WHERE id = $1 AND user_id = $2`,
      [toId(req.params.id), req.user.id, key, done]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    const p = await loadForPreflight(req.user.id, toId(req.params.id));
    res.json({ proposal: { id: p.id, title: p.title }, linked: Boolean(p.summary), ...preflight.check({ proposal: p, summary: p.summary }) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- Calendar feed and SMS reminders

async function calendarNonce(userId, reset = false) {
  if (reset) {
    const { rows } = await db.query('UPDATE "Users" SET calendar_nonce = $2 WHERE id = $1 RETURNING calendar_nonce', [userId, crypto.randomBytes(9).toString('base64url')]);
    return rows[0].calendar_nonce;
  }
  const { rows } = await db.query(
    `UPDATE "Users" SET calendar_nonce = COALESCE(calendar_nonce, $2) WHERE id = $1 RETURNING calendar_nonce`,
    [userId, crypto.randomBytes(9).toString('base64url')]);
  return rows[0].calendar_nonce;
}
const feedUrl = (userId, nonce) => `${baseUrl()}/api/calendar/${userId}-${secrets.calendarKey(userId, nonce)}.ics`;

router.get('/calendar/link', requireAuth, requireFeature('deadline_alerts'), async (req, res, next) => {
  try {
    const url = feedUrl(req.user.id, await calendarNonce(req.user.id));
    const { rows } = await db.query('SELECT sms_alerts FROM "Users" WHERE id = $1', [req.user.id]);
    res.json({ url, sms: { available: smsAvailable(), on: Boolean(rows[0] && rows[0].sms_alerts), phone: req.user.phone || '' } });
  } catch (err) { next(err); }
});

router.post('/calendar/reset', requireAuth, requireFeature('deadline_alerts'), perUser(5), async (req, res, next) => {
  try {
    res.json({ url: feedUrl(req.user.id, await calendarNonce(req.user.id, true)) });
  } catch (err) { next(err); }
});

// Public: calendar apps fetch this without a cookie. The HMAC in the path is the credential.
const feedLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
router.get('/calendar/:file', feedLimiter, async (req, res, next) => {
  try {
    const m = String(req.params.file).match(/^(\d{1,12})-([A-Za-z0-9_-]{32})\.ics$/);
    if (!m) return res.status(404).end();
    const userId = Number(m[1]);
    const { rows } = await db.query(
      `SELECT u.calendar_nonce, u.status, ap.revoked_at, ap.id AS purchase_id
         FROM "Users" u LEFT JOIN authorized_purchasers ap ON lower(ap.email) = lower(u.email) WHERE u.id = $1`, [userId]);
    const u = rows[0];
    if (!u || !u.calendar_nonce || !secrets.checkCalendarKey(userId, u.calendar_nonce, m[2])) return res.status(404).end();
    if (u.status === 'disabled' || (process.env.REQUIRE_PURCHASE !== 'false' && (!u.purchase_id || u.revoked_at))) return res.status(404).end();
    res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=900', 'Content-Disposition': 'inline; filename="govproposalpro.ics"' });
    res.send(await feedFor(userId, baseUrl()));
  } catch (err) { next(err); }
});

/** SMS reminders go out through GoHighLevel, which bills per text, so the owner switches them on. */
const smsAvailable = () => process.env.ALERT_SMS === 'on' && ghl.enabled();

router.patch('/me/sms-alerts', requireAuth, requireFeature('deadline_alerts'), express.json({ limit: '1kb' }), async (req, res, next) => {
  try {
    const on = req.body && req.body.on;
    if (typeof on !== 'boolean') return res.status(400).json({ error: 'Invalid setting.' });
    if (on && !smsAvailable()) return res.status(400).json({ error: 'Text reminders are not switched on yet.' });
    if (on && String(req.user.phone || '').replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'Add a mobile number to your profile first.' });
    await db.query('UPDATE "Users" SET sms_alerts = $2 WHERE id = $1', [req.user.id, on]);
    res.json({ ok: true, on });
  } catch (err) { next(err); }
});

module.exports = { router, smsAvailable };
