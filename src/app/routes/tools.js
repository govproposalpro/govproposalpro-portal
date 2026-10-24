'use strict';

/**
 * The edition toolkit that runs without Claude: subcontractor lists and outreach, FOIA requests,
 * pricing sheets, post-award milestones, SF-1034 invoices, NDAs and teaming agreements, the CMMC
 * Level 1 checklist, the per-state directory, Live Compliance Pulse, the Predictive Bid
 * Matchmaker and the Smart Vendor Scraper (SAM.gov, plus Google for Enterprise).
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const sam = require('../sam');
const intel = require('../intel');
const STATES = require('../data/states');
const { requireAuth, requireFeature } = require('../session');
const { hasFeature } = require('../tiers');

const router = express.Router();

const toId = (v) => {
  const n = typeof v === 'number' ? v : Number.parseInt(v, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const perUser = (limit, windowMs = 60 * 1000, message = 'Slow down a little. Try again in a minute.') => rateLimit({
  windowMs,
  limit,
  keyGenerator: (req) => `u${req.user.id}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: message },
});

// ---------------------------------------------------------------- field parsers (throw a user-facing message)

const text = (max, required) => (v, label) => {
  if (v === null || v === '') { if (required) throw new Error(`${label} is required.`); return null; }
  if (typeof v !== 'string') throw new Error(`${label} must be text.`);
  const s = v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
  if (!s && required) throw new Error(`${label} is required.`);
  return s || null;
};
const longText = (max) => (v, label) => {
  if (v === null || v === '') return null;
  if (typeof v !== 'string') throw new Error(`${label} must be text.`);
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max);
};
const money = (v, label) => {
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0 || n >= 1e12) throw new Error(`${label} must be a dollar amount.`);
  return Math.round(n * 100) / 100;
};
const date = (v, label) => {
  if (v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new Error(`${label} must be a date.`);
  return v;
};
const oneOf = (values, fallback) => (v, label) => {
  if (v === null || v === '' || v === undefined) { if (fallback) return fallback; throw new Error(`${label} is required.`); }
  if (!values.includes(v)) throw new Error(`Choose a valid ${label.toLowerCase()}.`);
  return v;
};
// Free-form JSON documents (pricing tables, invoice lines, agreement terms), capped in size.
const json = (maxBytes) => (v, label) => {
  if (v === null) return '{}';
  if (typeof v !== 'object' || Array.isArray(v)) throw new Error(`${label} is invalid.`);
  const s = JSON.stringify(v);
  if (s.length > maxBytes) throw new Error(`${label} is too large.`);
  return s;
};
const rating = (v, label) => {
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 5) throw new Error(`${label} must be between 0 and 5.`);
  return Math.round(n * 10) / 10;
};
const ownedBid = { table: 'bids' };
const ownedSub = { table: 'sub_contacts' };

/**
 * A member-owned table with list, create, update and delete. `fields` maps the API name to
 * [column, parser, label, owned?]; `owned` makes sure a referenced row belongs to the member.
 */
function crud(path, table, { feature, fields, order, max, select }) {
  const cols = Object.entries(fields);
  const selectSql = select;

  async function parse(req, body, partial) {
    const b = body && typeof body === 'object' ? body : {};
    const out = [];
    for (const [key, [column, parser, label, owned]] of cols) {
      if (b[key] === undefined) {
        if (!partial) {
          try { const v = parser(null, label); if (v !== null) out.push([column, v]); } catch (err) { return { error: err.message }; }
        }
        continue;
      }
      let v;
      try { v = parser(b[key], label); } catch (err) { return { error: err.message }; }
      if (owned && v !== null) {
        const id = toId(v);
        const hit = id && await db.query(`SELECT 1 FROM ${owned.table} WHERE id = $1 AND user_id = $2`, [id, req.user.id]);
        if (!hit || !hit.rowCount) return { error: `${label} not found.` };
        v = id;
      }
      out.push([column, v]);
    }
    return { values: out };
  }

  const gate = [requireAuth, requireFeature(feature)];
  router.get(path, ...gate, async (req, res, next) => {
    try {
      const params = [req.user.id];
      let where = 'user_id = $1';
      const bidId = toId(req.query.bidId);
      if (bidId && fields.bidId) { params.push(bidId); where += ` AND bid_id = $${params.length}`; }
      const { rows } = await db.query(`SELECT ${selectSql} FROM ${table} WHERE ${where} ORDER BY ${order} LIMIT ${max}`, params);
      res.json({ items: rows });
    } catch (err) { next(err); }
  });

  router.post(path, ...gate, express.json({ limit: '256kb' }), async (req, res, next) => {
    try {
      const { values, error } = await parse(req, req.body, false);
      if (error) return res.status(400).json({ error });
      const count = await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [req.user.id]);
      if (count.rows[0].n >= max) return res.status(400).json({ error: `You can keep up to ${max}. Delete some first.` });
      const names = ['user_id', ...values.map(([c]) => c)];
      const { rows } = await db.query(
        `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING ${selectSql}`,
        [req.user.id, ...values.map(([, v]) => v)]
      );
      res.status(201).json({ item: rows[0] });
    } catch (err) { next(err); }
  });

  router.patch(`${path}/:id`, ...gate, express.json({ limit: '256kb' }), async (req, res, next) => {
    try {
      const { values, error } = await parse(req, req.body, true);
      if (error) return res.status(400).json({ error });
      if (!values.length) return res.status(400).json({ error: 'Nothing to update.' });
      const sets = values.map(([c], i) => `${c} = $${i + 3}`);
      if (['pricing_sheets', 'invoices', 'legal_docs'].includes(table)) sets.push('updated_at = now()');
      const { rows } = await db.query(
        `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING ${selectSql}`,
        [toId(req.params.id), req.user.id, ...values.map(([, v]) => v)]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json({ item: rows[0] });
    } catch (err) { next(err); }
  });

  router.delete(`${path}/:id`, ...gate, async (req, res, next) => {
    try {
      const { rowCount } = await db.query(`DELETE FROM ${table} WHERE id = $1 AND user_id = $2`, [toId(req.params.id), req.user.id]);
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch (err) { next(err); }
  });
}

// ---------------------------------------------------------------- member-owned records

crud('/subs', 'sub_contacts', {
  feature: 'vendor_scraper',
  order: 'created_at DESC',
  max: 1000,
  select: `id, bid_id AS "bidId", company, contact_name AS "contactName", email, phone, trade, location, website, uei, cage,
           rating::float AS rating, source, quote::float AS quote, notes, outreach, created_at AS "createdAt"`,
  fields: {
    bidId: ['bid_id', (v) => v, 'Opportunity', ownedBid],
    company: ['company', text(200, true), 'Company'],
    contactName: ['contact_name', text(120), 'Contact name'],
    email: ['email', (v, l) => {
      const s = text(254)(v, l);
      if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error('Enter a valid email.');
      return s;
    }, 'Email'],
    phone: ['phone', text(40), 'Phone'],
    trade: ['trade', text(120), 'Trade'],
    location: ['location', text(200), 'Location'],
    website: ['website', text(200), 'Website'],
    uei: ['uei', text(12), 'UEI'],
    cage: ['cage', text(5), 'CAGE'],
    rating: ['rating', rating, 'Rating'],
    source: ['source', oneOf(['manual', 'sam', 'places'], 'manual'), 'Source'],
    quote: ['quote', money, 'Quote'],
    notes: ['notes', longText(10000), 'Notes'],
    outreach: ['outreach', json(4000), 'Outreach'],
  },
});

crud('/foia', 'foia_requests', {
  feature: 'foia',
  order: 'created_at DESC',
  max: 300,
  select: `id, bid_id AS "bidId", agency, subject, data, letter, status, to_char(sent_on, 'YYYY-MM-DD') AS "sentOn", created_at AS "createdAt"`,
  fields: {
    bidId: ['bid_id', (v) => v, 'Opportunity', ownedBid],
    agency: ['agency', text(200, true), 'Agency'],
    subject: ['subject', text(300, true), 'Subject'],
    data: ['data', json(20000), 'Request details'],
    letter: ['letter', (v, l) => { const s = longText(30000)(v, l); if (!s) throw new Error('The letter is empty.'); return s; }, 'Letter'],
    status: ['status', oneOf(['draft', 'sent', 'received'], 'draft'), 'Status'],
    sentOn: ['sent_on', date, 'Sent date'],
  },
});

crud('/pricing', 'pricing_sheets', {
  feature: 'pricing_matrix',
  order: 'updated_at DESC',
  max: 300,
  select: `id, bid_id AS "bidId", title, data, total::float AS total, created_at AS "createdAt", updated_at AS "updatedAt"`,
  fields: {
    bidId: ['bid_id', (v) => v, 'Opportunity', ownedBid],
    title: ['title', text(200, true), 'Title'],
    data: ['data', json(200000), 'Pricing sheet'],
    total: ['total', money, 'Total'],
  },
});

crud('/milestones', 'milestones', {
  feature: 'milestones',
  order: 'due_on NULLS LAST, id',
  max: 2000,
  select: `id, bid_id AS "bidId", title, to_char(due_on, 'YYYY-MM-DD') AS "dueOn", sub_contact_id AS "subContactId",
           amount::float AS amount, status, to_char(done_on, 'YYYY-MM-DD') AS "doneOn", created_at AS "createdAt"`,
  fields: {
    bidId: ['bid_id', (v, l) => { if (v === null) throw new Error('Pick the contract.'); return v; }, 'Contract', ownedBid],
    title: ['title', text(200, true), 'Milestone'],
    dueOn: ['due_on', date, 'Due date'],
    subContactId: ['sub_contact_id', (v) => v, 'Subcontractor', ownedSub],
    amount: ['amount', money, 'Amount'],
    status: ['status', oneOf(['open', 'done'], 'open'), 'Status'],
    doneOn: ['done_on', date, 'Completed date'],
  },
});

crud('/invoices', 'invoices', {
  feature: 'invoicing',
  order: 'created_at DESC',
  max: 1000,
  select: `id, bid_id AS "bidId", number, data, total::float AS total, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
  fields: {
    bidId: ['bid_id', (v) => v, 'Contract', ownedBid],
    number: ['number', text(40, true), 'Voucher number'],
    data: ['data', json(100000), 'Voucher'],
    total: ['total', money, 'Total'],
    status: ['status', oneOf(['draft', 'submitted', 'paid'], 'draft'), 'Status'],
  },
});

crud('/legal', 'legal_docs', {
  feature: 'teaming_legal',
  order: 'updated_at DESC',
  max: 300,
  select: `id, bid_id AS "bidId", kind, title, data, created_at AS "createdAt", updated_at AS "updatedAt"`,
  fields: {
    bidId: ['bid_id', (v) => v, 'Opportunity', ownedBid],
    kind: ['kind', oneOf(['nda', 'teaming']), 'Document type'],
    title: ['title', text(200, true), 'Title'],
    data: ['data', json(60000), 'Agreement terms'],
  },
});

// ---------------------------------------------------------------- CMMC Level 1 readiness

// The 17 CMMC Level 1 practices (the 15 FAR 52.204-21 requirements, with two split in CMMC).
const CMMC_PRACTICES = [
  'AC.L1-3.1.1', 'AC.L1-3.1.2', 'AC.L1-3.1.20', 'AC.L1-3.1.22', 'IA.L1-3.5.1', 'IA.L1-3.5.2', 'MP.L1-3.8.3',
  'PE.L1-3.10.1', 'PE.L1-3.10.3', 'PE.L1-3.10.4', 'PE.L1-3.10.5', 'SC.L1-3.13.1', 'SC.L1-3.13.5',
  'SI.L1-3.14.1', 'SI.L1-3.14.2', 'SI.L1-3.14.4', 'SI.L1-3.14.5',
];

router.get('/me/cmmc', requireAuth, requireFeature('cmmc_checklist'), async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT cmmc_checklist FROM "Users" WHERE id = $1', [req.user.id]);
    res.json({ checklist: rows[0].cmmc_checklist || {} });
  } catch (err) { next(err); }
});

// Each practice is { status: 'met' | 'partial' | 'not_met', note } so the member can record evidence.
router.patch('/me/cmmc', requireAuth, requireFeature('cmmc_checklist'), express.json({ limit: '8kb' }), async (req, res, next) => {
  try {
    const { practice, status, note } = req.body || {};
    if (!CMMC_PRACTICES.includes(practice)) return res.status(400).json({ error: 'Unknown practice.' });
    if (!['met', 'partial', 'not_met', null].includes(status ?? null)) return res.status(400).json({ error: 'Unknown status.' });
    const value = status ? { status, note: typeof note === 'string' ? note.slice(0, 2000) : '', on: new Date().toISOString().slice(0, 10) } : null;
    await db.query(
      `UPDATE "Users" SET cmmc_checklist = CASE WHEN $3::jsonb IS NULL THEN cmmc_checklist - $2::text
                                                ELSE cmmc_checklist || jsonb_build_object($2::text, $3::jsonb) END
        WHERE id = $1`,
      [req.user.id, practice, value ? JSON.stringify(value) : null]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- Per-State Directory and Live Compliance Pulse

router.get('/states', requireAuth, requireFeature('state_directory'), (_req, res) => res.json({ states: STATES }));

router.get('/pulse', requireAuth, requireFeature('compliance_pulse'), async (_req, res, next) => {
  try {
    res.json(await intel.compliancePulse());
  } catch (err) {
    console.error('[pulse] failed:', err.message);
    next(err);
  }
});

// ---------------------------------------------------------------- Predictive Bid Matchmaker

router.get('/matchmaker', requireAuth, requireFeature('bid_matchmaker'), perUser(10), async (req, res, next) => {
  try {
    if (!sam.enabled()) return res.json({ configured: false, matches: [], codes: [] });
    res.json({ configured: true, ...(await intel.matchOpportunities(req.user)) });
  } catch (err) {
    console.error('[matchmaker] failed:', err.message);
    if (err instanceof sam.SamError) return res.status(502).json({ error: err.userMessage || 'SAM.gov did not respond. Try again in a few minutes.' });
    next(err);
  }
});

// ---------------------------------------------------------------- Smart Vendor Scraper

const STATE_CODES = new Set(STATES.map((s) => s.code));
const placesDaily = perUser(Math.max(1, Number.parseInt(process.env.PLACES_SEARCHES_PER_DAY || '15', 10)), 24 * 3600_000,
  'You have used today\'s top-rated searches. Try again tomorrow.');

router.get('/vendors/search', requireAuth, requireFeature('vendor_scraper'), perUser(10), async (req, res, next) => {
  try {
    const naics = String(req.query.naics || '').trim();
    const state = String(req.query.state || '').trim().toUpperCase();
    if (!/^\d{6}$/.test(naics)) return res.status(400).json({ error: 'Enter a 6-digit NAICS code.' });
    if (!STATE_CODES.has(state)) return res.status(400).json({ error: 'Choose a state.' });
    if (!sam.enabled()) return res.json({ configured: false, entities: [], total: 0 });
    const result = await intel.cached(`sam:entities:${naics}:${state}`, 24 * 3600_000, () => sam.searchEntities({ naics, state }));
    res.json({ configured: true, ...result, topRated: hasFeature(req.user.tier, 'places_vendors') && intel.placesEnabled() });
  } catch (err) {
    console.error('[vendors] SAM search failed:', err.message);
    if (err instanceof sam.SamError) return res.status(502).json({ error: err.userMessage || 'SAM.gov did not respond. Try again in a few minutes.' });
    next(err);
  }
});

// Enterprise: top-rated private businesses near the job, with phone and website.
router.get('/vendors/top-rated', requireAuth, requireFeature('vendor_scraper'), async (req, res, next) => {
  if (!hasFeature(req.user.tier, 'places_vendors')) return res.status(403).json({ error: 'Top-rated local subcontractors are part of the Enterprise Edition.', upgrade: true });
  if (!intel.placesEnabled()) return res.json({ configured: false, places: [] });
  return placesDaily(req, res, async () => {
    try {
      const trade = String(req.query.trade || '').replace(/[\u0000-\u001F]/g, '').trim().slice(0, 80);
      const where = String(req.query.where || '').replace(/[\u0000-\u001F]/g, '').trim().slice(0, 120);
      if (trade.length < 3 || where.length < 2) return res.status(400).json({ error: 'Enter the trade and the city or ZIP code of the job.' });
      res.json({ configured: true, places: await intel.topRatedPlaces(`${trade} in ${where}`) });
    } catch (err) {
      console.error('[vendors] Places search failed:', err.message);
      res.status(502).json({ error: 'The business search did not respond. Try again in a few minutes.' });
    }
  });
});

module.exports = { router, CMMC_PRACTICES };
