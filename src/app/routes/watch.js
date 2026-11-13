'use strict';

/**
 * Amendment Watch, Easy Wins Feed (every member), Teaming Partner Finder and Compliance Watchdog
 * (Enterprise). The scheduled halves live in src/app/watch.js.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const sam = require('../sam');
const samkey = require('../samkey');
const intel = require('../intel');
const watch = require('../watch');
const easy = require('../easywins');
const { post, ORIGIN } = require('../xray');
const { stateCode, stateFromAddress } = require('../recompete');
const { requireAuth, requireFeature } = require('../session');

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
const samError = (res, err, what) => {
  console.error(`[${what}] failed:`, err.message);
  return res.status(502).json({ error: (err instanceof sam.SamError && err.userMessage) || 'SAM.gov did not respond. Try again in a few minutes.' });
};
const homeState = (user) => stateFromAddress(user.address) || '';

// ---------------------------------------------------------------- Amendment Watch

const AMEND_GATE = [requireAuth, requireFeature('amendment_watch')];

const amendmentRow = (r) => ({
  id: r.id, bidId: r.bid_id, bidTitle: r.bid_title, noticeId: r.notice_id, type: r.notice_type, title: r.title,
  postedDate: r.posted_date, url: r.url, changes: r.changes, seen: Boolean(r.seen_at), createdAt: r.created_at,
});

router.get('/amendments', ...AMEND_GATE, async (req, res, next) => {
  try {
    const bids = await db.query(
      `SELECT id, title, agency, stage, solicitation_number, to_char(due_at, 'YYYY-MM-DD') AS due, amend_watch
         FROM bids WHERE user_id = $1 AND stage = ANY($2) ORDER BY due_at NULLS LAST, id DESC LIMIT 200`,
      [req.user.id, watch.OPEN_STAGES]);
    const changes = await db.query(
      `SELECT a.*, b.title AS bid_title FROM bid_amendments a JOIN bids b ON b.id = a.bid_id
        WHERE a.user_id = $1 ORDER BY a.created_at DESC LIMIT 60`, [req.user.id]);
    res.json({
      configured: Boolean(await samkey.keyFor(req.user.id)), // daily checks run on the member's own key
      bids: bids.rows.map((b) => {
        const w = b.amend_watch || null;
        return {
          id: b.id, title: b.title, agency: b.agency, stage: b.stage, due: b.due,
          solicitationNumber: b.solicitation_number || '',
          watching: String(b.solicitation_number || '').trim().length >= 4,
          checkedAt: w && w.checkedAt, notices: w && w.count, latest: w && w.latest, error: w && w.error,
        };
      }),
      changes: changes.rows.map(amendmentRow),
    });
  } catch (err) { next(err); }
});

router.post('/amendments/:bidId/check', ...AMEND_GATE, perUser(6, 10 * 60 * 1000, 'You have checked a lot of bids just now. Try again in a few minutes.'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, user_id, title, solicitation_number, to_char(due_at, 'YYYY-MM-DD') AS due, amend_watch
         FROM bids WHERE id = $1 AND user_id = $2`, [toId(req.params.bidId), req.user.id]);
    const bid = rows[0];
    if (!bid) return res.status(404).json({ error: 'Not found' });
    if (String(bid.solicitation_number || '').trim().length < 4) return res.status(400).json({ error: 'Add the solicitation number to this bid in your Bid CRM first.' });
    if (!(await samkey.available(req.user.id))) return res.status(400).json({ error: 'Add your free SAM.gov API key first, then Amendment Watch can check SAM.gov.' });
    try {
      const { snapshot, added } = await watch.checkBid(bid, { maxAgeMs: 3600_000 });
      res.json({ snapshot, added });
    } catch (err) { return samError(res, err, 'amendments'); }
  } catch (err) { next(err); }
});

router.post('/amendments/seen', ...AMEND_GATE, async (req, res, next) => {
  try {
    await db.query('UPDATE bid_amendments SET seen_at = now() WHERE user_id = $1 AND seen_at IS NULL', [req.user.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- Easy Wins Feed

router.get('/easy-wins', requireAuth, requireFeature('easy_wins'), perUser(10), async (req, res, next) => {
  try {
    const codes = intel.naicsList(req.user.naics);
    const base = { codes, state: homeState(req.user), supplies: easy.suppliesCodes(codes).length > 0, sat: easy.SAT };
    if (!codes.length) return res.json({ ...base, needsNaics: true, notices: [] });
    if (!(await samkey.available(req.user.id))) return res.json({ ...base, configured: false, notices: [] });
    let lists;
    try {
      lists = await samkey.withKey(req.user.id, (key) => Promise.all(codes.map((c) => intel.opportunitiesFor(c, key))));
    } catch (err) { return samError(res, err, 'easy-wins'); }
    res.json({ ...base, configured: true, notices: easy.rankEasy(req.user, lists.flat()).slice(0, 40) });
  } catch (err) { next(err); }
});

router.get('/easy-wins/buyers', requireAuth, requireFeature('easy_wins'), perUser(10), async (req, res, next) => {
  try {
    const codes = intel.naicsList(req.user.naics).slice(0, 3);
    if (!codes.length) return res.json({ needsNaics: true, offices: [] });
    const state = typeof req.query.state === 'string' ? stateCode(req.query.state) : homeState(req.user);
    try {
      res.json({ codes, state, ...(await easy.buyers({ codes, state })) });
    } catch (err) {
      console.error('[easy-wins] buyers failed:', err.message);
      res.status(502).json({ error: 'USAspending.gov did not respond. Please try again in a few minutes.' });
    }
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- Teaming Partner Finder

// Socio-economic filters: SAM.gov business type codes (businessTypeCode / sbaBusinessTypeCode).
const PARTNER_TYPES = {
  any: {},
  '8a': { sbaType: 'A6' },
  hubzone: { sbaType: 'XX' },
  sdvosb: { businessType: 'QF' },
  vosb: { businessType: 'A5' },
  wosb: { businessType: '8W' },
  women: { businessType: 'A2' },
};

router.get('/partners', requireAuth, requireFeature('teaming_finder'), perUser(8), async (req, res, next) => {
  try {
    const naics = (String(req.query.naics || '').match(/^\d{6}$/) || [])[0] || intel.naicsList(req.user.naics)[0] || '';
    if (!naics) return res.status(400).json({ error: 'Enter a 6-digit NAICS code.' });
    const state = typeof req.query.state === 'string' ? stateCode(req.query.state) : homeState(req.user);
    const type = PARTNER_TYPES[req.query.type] ? String(req.query.type) : 'any';
    const page = Math.min(Math.max(Number.parseInt(req.query.page, 10) || 0, 0), 20);
    if (!(await samkey.available(req.user.id))) return res.json({ configured: false, naics, state, type, page, total: 0, partners: [] });
    let data;
    try {
      data = await samkey.withKey(req.user.id, (key) => intel.cached(`sam:partners:v1:${naics}:${state}:${type}:${page}`, 24 * 3600_000,
        () => sam.searchEntities({ naics, state, ...PARTNER_TYPES[type], page }, key)));
    } catch (err) { return samError(res, err, 'partners'); }
    const saved = await db.query('SELECT uei FROM sub_contacts WHERE user_id = $1 AND uei IS NOT NULL', [req.user.id]);
    const have = new Set(saved.rows.map((r) => r.uei));
    const own = String(req.user.uei || '');
    res.json({
      configured: true, naics, state, type, page, total: data.total,
      partners: data.entities.filter((e) => e.uei !== own).map((e) => ({ ...e, saved: have.has(e.uei) })),
    });
  } catch (err) { next(err); }
});

router.get('/partners/awards', requireAuth, requireFeature('teaming_finder'), perUser(20), async (req, res, next) => {
  try {
    const uei = String(req.query.uei || '').toUpperCase();
    if (!/^[A-Z0-9]{12}$/.test(uei)) return res.status(400).json({ error: 'Not a valid UEI.' });
    const now = new Date();
    const filters = {
      award_type_codes: ['A', 'B', 'C', 'D'],
      recipient_search_text: [uei],
      time_period: [{ start_date: `${now.getUTCFullYear() - 5}-01-01`, end_date: now.toISOString().slice(0, 10) }],
    };
    try {
      const data = await intel.cached(`usa:recipient:v1:${uei}`, 7 * 24 * 3600_000, async () => {
        const [list, count] = await Promise.all([
          post(`${ORIGIN}/api/v2/search/spending_by_award/`, {
            filters, fields: ['Award ID', 'Award Amount', 'Awarding Sub Agency', 'Start Date', 'Description'], limit: 5, page: 1, sort: 'Award Amount', order: 'desc',
          }),
          post(`${ORIGIN}/api/v2/search/spending_by_award_count/`, { filters }),
        ]);
        return {
          count: (count.results && count.results.contracts) || 0,
          top: (list.results || []).map((r) => ({
            id: r['Award ID'], value: Math.round(Number(r['Award Amount']) || 0), agency: r['Awarding Sub Agency'] || '',
            start: String(r['Start Date'] || '').slice(0, 10), description: String(r.Description || '').slice(0, 140),
            url: r.generated_internal_id ? `https://www.usaspending.gov/award/${encodeURIComponent(r.generated_internal_id)}` : '',
          })),
        };
      });
      res.json({ uei, ...data });
    } catch (err) {
      console.error('[partners] awards failed:', err.message);
      res.status(502).json({ error: 'USAspending.gov did not respond. Please try again in a few minutes.' });
    }
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- Compliance Watchdog

const DOG_GATE = [requireAuth, requireFeature('compliance_watchdog')];

router.get('/watchdog', ...DOG_GATE, async (req, res, next) => {
  try {
    res.json({ configured: Boolean(await samkey.keyFor(req.user.id)), ...(await watch.watchdogSummary(req.user)) });
  } catch (err) { next(err); }
});

const isoDate = (v, label) => {
  if (v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new Error(`${label}: use a valid date.`);
  return v;
};

router.patch('/watchdog/subs/:id', ...DOG_GATE, express.json({ limit: '2kb' }), async (req, res, next) => {
  try {
    const b = req.body || {};
    const sets = [];
    const vals = [toId(req.params.id), req.user.id];
    try {
      if ('coiExpires' in b) { vals.push(isoDate(b.coiExpires, 'Insurance certificate')); sets.push(`coi_expires = $${vals.length}`); }
      if ('licenseExpires' in b) { vals.push(isoDate(b.licenseExpires, 'Licence')); sets.push(`license_expires = $${vals.length}`); }
    } catch (err) { return res.status(400).json({ error: err.message }); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
    const { rows } = await db.query(`UPDATE sub_contacts SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING ${watch.SUB_SELECT}`, vals);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ sub: { ...rows[0], ...watch.subLevel(rows[0]) } });
  } catch (err) { next(err); }
});

router.post('/watchdog/subs/:id/check', ...DOG_GATE, perUser(5, 10 * 60 * 1000, 'You have run a lot of checks just now. Try again in a few minutes.'), async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT ${watch.SUB_SELECT} FROM sub_contacts WHERE id = $1 AND user_id = $2`, [toId(req.params.id), req.user.id]);
    const sub = rows[0];
    if (!sub) return res.status(404).json({ error: 'Not found' });
    if (!/^[A-Z0-9]{12}$/.test(sub.uei || '')) return res.status(400).json({ error: 'Add this subcontractor\'s 12-character UEI first.' });
    if (!(await samkey.available(req.user.id))) return res.status(400).json({ error: 'Add your free SAM.gov API key first.' });
    try {
      sub.watch = await watch.recheckSub(req.user.id, sub);
    } catch (err) { return samError(res, err, 'watchdog'); }
    res.json({ sub: { ...sub, ...watch.subLevel(sub) } });
  } catch (err) { next(err); }
});

router.post('/watchdog/me/check', ...DOG_GATE, perUser(3, 10 * 60 * 1000), async (req, res, next) => {
  try {
    if (!/^[A-Z0-9]{12}$/.test(req.user.uei || '')) return res.status(400).json({ error: 'Add your 12-character UEI to your profile first.' });
    if (!(await samkey.available(req.user.id))) return res.status(400).json({ error: 'Add your free SAM.gov API key first.' });
    try {
      await watch.refreshOwnRegistration(req.user);
    } catch (err) { return samError(res, err, 'watchdog'); }
    res.json({ configured: true, ...(await watch.watchdogSummary(req.user)) });
  } catch (err) { next(err); }
});

module.exports = { router };
