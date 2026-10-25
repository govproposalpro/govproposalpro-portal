'use strict';

/**
 * Enterprise GovCon Autopilot: setup (the "learning" intake, keys, mailbox, margin and quota),
 * on-demand runs, and the pipeline of opportunities it is working. Keys are encrypted at rest
 * and never sent back to the browser; the browser only learns whether one is set and its last 4.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const ai = require('../ai');
const sam = require('../sam');
const mailbox = require('../mailbox');
const secrets = require('../secrets');
const autopilot = require('../autopilot');
const { requireAuth, requireFeature } = require('../session');
const { aiProfile } = require('../profile');

const router = express.Router();
const gate = [requireAuth, requireFeature('autopilot')];

const toId = (v) => {
  const n = typeof v === 'number' ? v : Number.parseInt(v, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max) : '');
const perUser = (limit, windowMs) => rateLimit({
  windowMs,
  limit,
  keyGenerator: (req) => `u${req.user.id}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Slow down a little. Try again in a minute.' },
});

async function settingsRow(userId) {
  const { rows } = await db.query('SELECT * FROM autopilot_settings WHERE user_id = $1', [userId]);
  return rows[0] || null;
}

/** Settings as the browser sees them: secrets reduced to set/last4. */
function publicSettings(s, user) {
  if (!s) {
    return {
      configured: false, description: '', learned: {}, role: 'prime', naics: user.naics || '', keywords: '', states: '',
      minDaysLeft: 7, dailyQuota: 1, marginPct: 20, overheadPct: 10,
      samKey: { set: false }, aiKey: { set: false }, email: { set: false }, autoEmail: false,
      smtpHost: '', smtpPort: 465, smtpUser: user.email || '', imapHost: '', imapPort: 993, fromName: user.business_name || '',
    };
  }
  return {
    configured: true,
    description: s.description || '',
    learned: s.learned || {},
    role: s.role,
    naics: s.naics || '',
    keywords: s.keywords || '',
    states: s.states || '',
    minDaysLeft: s.min_days_left,
    dailyQuota: s.daily_quota,
    marginPct: Number(s.margin_pct),
    overheadPct: Number(s.overhead_pct),
    samKey: secrets.hint(s.sam_key_enc),
    aiKey: secrets.hint(s.ai_key_enc),
    email: s.smtp_pass_enc ? secrets.hint(s.smtp_pass_enc) : { set: false },
    autoEmail: s.auto_email,
    smtpHost: s.smtp_host || '',
    smtpPort: s.smtp_port || 465,
    smtpUser: s.smtp_user || '',
    imapHost: s.imap_host || '',
    imapPort: s.imap_port || 993,
    fromName: s.from_name || user.business_name || '',
  };
}

const ITEM_COLUMNS = `i.id, i.notice_id AS "noticeId", i.title, i.agency, i.sol_number AS "solNumber", i.due_at AS "dueAt", i.url, i.score,
  i.stage, i.reason, i.rfp_summary_id AS "rfpSummaryId", i.bid_id AS "bidId", i.pricing_sheet_id AS "pricingSheetId",
  i.proposal_id AS "proposalId", i.created_at AS "createdAt", i.updated_at AS "updatedAt",
  jsonb_array_length(i.quotes) AS "quoteCount", ps.total::float AS "priceTotal",
  (SELECT count(*)::int FROM sub_contacts sc WHERE sc.user_id = i.user_id AND sc.bid_id = i.bid_id AND i.bid_id IS NOT NULL) AS "subCount"`;

router.get('/autopilot', ...gate, async (req, res, next) => {
  try {
    const s = await settingsRow(req.user.id);
    const [items, run, today] = await Promise.all([
      db.query(`SELECT ${ITEM_COLUMNS} FROM autopilot_items i LEFT JOIN pricing_sheets ps ON ps.id = i.pricing_sheet_id
                 WHERE i.user_id = $1 ORDER BY i.created_at DESC LIMIT 60`, [req.user.id]),
      db.query(`SELECT id, status, log, error, created_at AS "createdAt", completed_at AS "completedAt"
                  FROM autopilot_runs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [req.user.id]),
      db.query(`SELECT count(*)::int AS n FROM autopilot_items
                 WHERE user_id = $1 AND stage IN ('pricing', 'writing', 'ready', 'submitted')
                   AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`, [req.user.id]),
    ]);
    res.json({
      settings: publicSettings(s, req.user),
      items: items.rows,
      lastRun: run.rows[0] || null,
      today: today.rows[0].n,
      mailboxReady: Boolean(s && s.smtp_host && s.smtp_user && s.smtp_pass_enc),
    });
  } catch (err) { next(err); }
});

const SECRET_FIELDS = { samKey: 'sam_key_enc', aiKey: 'ai_key_enc', emailPassword: 'smtp_pass_enc' };

function parseSettings(b) {
  const out = {};
  if (b.description !== undefined) out.description = clean(b.description, 6000) || null;
  if (b.role !== undefined) {
    if (!['prime', 'sub', 'both'].includes(b.role)) throw new Error('Choose prime, sub or both.');
    out.role = b.role;
  }
  if (b.naics !== undefined) {
    const codes = [...new Set(String(b.naics || '').match(/\b\d{6}\b/g) || [])];
    if (!codes.length) throw new Error('Add at least one six-digit NAICS code.');
    out.naics = codes.slice(0, 8).join(', ');
  }
  if (b.keywords !== undefined) out.keywords = clean(b.keywords, 400) || null;
  if (b.states !== undefined) out.states = [...new Set(String(b.states || '').toUpperCase().match(/\b[A-Z]{2}\b/g) || [])].slice(0, 30).join(', ') || null;
  const int = (v, lo, hi, label) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`${label} must be between ${lo} and ${hi}.`);
    return n;
  };
  if (b.minDaysLeft !== undefined) out.min_days_left = Math.round(int(b.minDaysLeft, 0, 60, 'Minimum days left'));
  if (b.dailyQuota !== undefined) out.daily_quota = Math.round(int(b.dailyQuota, 1, 5, 'Bids per day'));
  if (b.marginPct !== undefined) out.margin_pct = Math.round(int(b.marginPct, 0, 60, 'Profit margin') * 100) / 100;
  if (b.overheadPct !== undefined) out.overhead_pct = Math.round(int(b.overheadPct, 0, 100, 'Overhead') * 100) / 100;
  if (b.autoEmail !== undefined) out.auto_email = Boolean(b.autoEmail);
  if (b.fromName !== undefined) out.from_name = clean(b.fromName, 120) || null;
  if (b.smtpHost !== undefined) out.smtp_host = clean(b.smtpHost, 200).toLowerCase() || null;
  if (b.imapHost !== undefined) out.imap_host = clean(b.imapHost, 200).toLowerCase() || null;
  if (b.smtpPort !== undefined) out.smtp_port = b.smtpPort ? Math.round(int(b.smtpPort, 1, 65535, 'SMTP port')) : null;
  if (b.imapPort !== undefined) out.imap_port = b.imapPort ? Math.round(int(b.imapPort, 1, 65535, 'IMAP port')) : null;
  if (b.smtpUser !== undefined) {
    const v = clean(b.smtpUser, 254);
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('Enter the email address you send from.');
    out.smtp_user = v || null;
  }
  for (const [field, column] of Object.entries(SECRET_FIELDS)) {
    if (b[field] === undefined) continue;
    if (b[field] === null || b[field] === '') { out[column] = null; continue; }
    const v = String(b[field]).trim();
    if (v.length < 8 || v.length > 400 || /\s/.test(v) && field !== 'emailPassword') throw new Error('That key does not look right. Paste it again.');
    if (field === 'aiKey' && !/^sk-ant-/.test(v)) throw new Error('Anthropic API keys start with sk-ant-.');
    out[column] = secrets.encrypt(v);
  }
  return out;
}

router.put('/autopilot/settings', ...gate, perUser(30, 60 * 1000), express.json({ limit: '64kb' }), async (req, res, next) => {
  try {
    let fields;
    try { fields = parseSettings(req.body || {}); } catch (e) { return res.status(400).json({ error: e.message }); }
    // Fill in a known provider's servers from the email address.
    if (fields.smtp_user && !fields.smtp_host) {
      const p = mailbox.preset(fields.smtp_user);
      if (p) Object.assign(fields, { smtp_host: p.smtp, smtp_port: p.smtpPort, imap_host: p.imap, imap_port: 993 });
    }
    const keys = Object.keys(fields);
    await db.query('INSERT INTO autopilot_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [req.user.id]);
    if (keys.length) {
      await db.query(`UPDATE autopilot_settings SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE user_id = $1`,
        [req.user.id, ...keys.map((k) => fields[k])]);
    }
    res.json({ settings: publicSettings(await settingsRow(req.user.id), req.user) });
  } catch (err) { next(err); }
});

// The intake: the member describes the business in their own words and the Autopilot works out
// NAICS codes, search words and what to go after. Runs on the light model.
router.post('/autopilot/learn', ...gate, perUser(6, 60 * 60 * 1000), express.json({ limit: '32kb' }), async (req, res, next) => {
  try {
    const description = clean(req.body && req.body.description, 6000);
    if (description.length < 30) return res.status(400).json({ error: 'Tell us a little more: what you do, where, and what kind of government work you want.' });
    const s = await settingsRow(req.user.id);
    const own = s && secrets.decrypt(s.ai_key_enc);
    if (!own && !ai.enabled()) return res.status(503).json({ error: 'Add your Anthropic API key first.' });
    const learned = await (own
      ? ai.withMemberKey(own, () => ai.learnBusiness({ description, profile: aiProfile(req.user) }))
      : ai.learnBusiness({ description, profile: aiProfile(req.user) }));
    const naics = learned.naics.map((n) => String(n.code).match(/\d{6}/)).filter(Boolean).map((m) => m[0]).slice(0, 8).join(', ');
    await db.query(
      `INSERT INTO autopilot_settings (user_id, description, learned, role, naics, keywords) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET description = $2, learned = $3, role = $4,
         naics = COALESCE(NULLIF($5, ''), autopilot_settings.naics), keywords = $6, updated_at = now()`,
      [req.user.id, description, JSON.stringify(learned), learned.role, naics, learned.keywords.slice(0, 10).join(', ').slice(0, 400)]);
    res.json({ learned, settings: publicSettings(await settingsRow(req.user.id), req.user) });
  } catch (err) {
    if (err instanceof ai.AiError) return res.status(502).json({ error: err.message });
    next(err);
  }
});

// Checks a saved key or the mailbox without spending AI tokens.
router.post('/autopilot/test', ...gate, perUser(10, 60 * 1000), express.json({ limit: '4kb' }), async (req, res, next) => {
  try {
    const what = req.body && req.body.what;
    const s = await settingsRow(req.user.id);
    if (!s) return res.status(400).json({ error: 'Save your settings first.' });
    if (what === 'sam') {
      const key = secrets.decrypt(s.sam_key_enc);
      if (!key) return res.status(400).json({ error: 'Add your SAM.gov API key first.' });
      const code = (String(s.naics || req.user.naics || '').match(/\d{6}/) || ['561720'])[0];
      const list = await sam.searchOpportunities(code, 7, { apiKey: key });
      return res.json({ ok: true, message: `SAM.gov key works. ${list.length} notices posted this week for NAICS ${code}.` });
    }
    if (what === 'ai') {
      const key = secrets.decrypt(s.ai_key_enc);
      if (!key) return res.status(400).json({ error: 'Add your Anthropic API key first.' });
      await ai.checkKey(key);
      return res.json({ ok: true, message: 'Anthropic key works.' });
    }
    if (what === 'email') {
      const pass = secrets.decrypt(s.smtp_pass_enc);
      if (!s.smtp_host || !s.smtp_user || !pass) return res.status(400).json({ error: 'Add your email address and app password first.' });
      await mailbox.verify({ host: s.smtp_host, port: s.smtp_port, user: s.smtp_user, pass });
      return res.json({ ok: true, message: `Signed in to ${s.smtp_host} as ${s.smtp_user}.` });
    }
    res.status(400).json({ error: 'Unknown check.' });
  } catch (err) {
    if (err instanceof sam.SamError) return res.status(400).json({ error: err.userMessage || 'SAM.gov did not answer. Try again in a minute.' });
    if (err instanceof ai.AiError || err instanceof mailbox.MailboxError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.post('/autopilot/run', ...gate, perUser(4, 60 * 1000), express.json({ limit: '4kb' }), async (req, res, next) => {
  try {
    try { await autopilot.loadContext(req.user.id); } catch (e) {
      if (e instanceof autopilot.AutopilotError) return res.status(400).json({ error: e.message, setupRequired: true });
      throw e;
    }
    if (!req.user.onboarded_at) return res.status(409).json({ error: 'Finish your company setup first, so proposals are written about your business.', setupRequired: true });
    const count = Math.min(5, Math.max(1, Number.parseInt(req.body && req.body.count, 10) || 5));
    // One run at a time per member.
    const { rows } = await db.query(
      `INSERT INTO autopilot_runs (user_id, requested)
       SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM autopilot_runs WHERE user_id = $1 AND status = 'working')
       RETURNING id`, [req.user.id, count]);
    if (!rows[0]) return res.status(409).json({ error: 'The Autopilot is already running. Watch its progress below.' });
    res.status(202).json({ id: rows[0].id, status: 'working' });
    autopilot.run(req.user.id, rows[0].id, count).catch((err) => console.error('[autopilot] run crashed:', err.message));
  } catch (err) { next(err); }
});

router.get('/autopilot/runs/:id', ...gate, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, status, log, error, created_at AS "createdAt", completed_at AS "completedAt"
         FROM autopilot_runs WHERE id = $1 AND user_id = $2`, [toId(req.params.id), req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ run: rows[0] });
  } catch (err) { next(err); }
});

router.get('/autopilot/items/:id', ...gate, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT ${ITEM_COLUMNS}, i.market, i.quotes, p.status AS "proposalStatus", ps.data AS "pricing"
         FROM autopilot_items i
         LEFT JOIN pricing_sheets ps ON ps.id = i.pricing_sheet_id
         LEFT JOIN proposals p ON p.id = i.proposal_id
        WHERE i.id = $1 AND i.user_id = $2`, [toId(req.params.id), req.user.id]);
    const item = rows[0];
    if (!item) return res.status(404).json({ error: 'Not found' });
    const subs = item.bidId ? (await db.query(
      `SELECT id, company, contact_name AS "contactName", email, phone, location, uei, quote::float AS quote, outreach
         FROM sub_contacts WHERE user_id = $1 AND bid_id = $2 ORDER BY id`, [req.user.id, item.bidId])).rows : [];
    res.json({ item: { ...item, subs } });
  } catch (err) { next(err); }
});

router.post('/autopilot/items/:id/send-quotes', ...gate, perUser(6, 60 * 1000), async (req, res, next) => {
  try {
    const ctx = await autopilot.loadContext(req.user.id);
    const sent = await autopilot.sendQuoteRequests(ctx, toId(req.params.id));
    res.json({ sent });
  } catch (err) {
    if (err instanceof autopilot.AutopilotError || err instanceof mailbox.MailboxError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// The member marks a bid submitted (or passes on it) once they've reviewed it.
router.patch('/autopilot/items/:id', ...gate, express.json({ limit: '4kb' }), async (req, res, next) => {
  try {
    const stage = req.body && req.body.stage;
    if (!['submitted', 'skipped'].includes(stage)) return res.status(400).json({ error: 'Unknown stage.' });
    const { rows } = await db.query(
      `UPDATE autopilot_items SET stage = $3::varchar, reason = CASE WHEN $3::varchar = 'skipped' THEN 'You passed on this one.' ELSE reason END, updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING bid_id`, [toId(req.params.id), req.user.id, stage]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    if (stage === 'submitted' && rows[0].bid_id) await db.query(`UPDATE bids SET stage = 'submitted', updated_at = now() WHERE id = $1`, [rows[0].bid_id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = { router };
