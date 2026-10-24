'use strict';

/**
 * AI Bid Decryptor and AI Proposal Engine. Both run in the background: the request returns a
 * row id straight away and the dashboard polls it, so a closed tab or a slow model never loses work.
 */

const express = require('express');
const mammoth = require('mammoth');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const ai = require('../ai');
const { requireAuth, requireFeature } = require('../session');
const { reserveProposal, proposalUsage } = require('../quota');
const { aiProfile } = require('../profile');
const { documentContext } = require('./profile');

const router = express.Router();
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 400_000;
const DECRYPTS_PER_DAY = Math.max(1, Number.parseInt(process.env.DECRYPTS_PER_DAY || '25', 10));

// Bursts of AI calls from one member are almost always a double click or a script.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  keyGenerator: (req) => `u${req.user.id}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Slow down a little. Try again in a minute.' },
});

const toId = (v) => {
  const n = typeof v === 'number' ? v : Number.parseInt(v, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const safeError = (err) => (err instanceof ai.AiError ? err.message : 'Something went wrong on our side. Please try again.');

// ---------------------------------------------------------------- AI Bid Decryptor

const MAX_SOLICITATION_FILES = 6;

/** Plain text of a Word document. Solicitations and amendments are often posted as .docx. */
async function docxText(buffer) {
  try {
    const { value } = await mammoth.extractRawText({ buffer });
    return value.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  } catch {
    return '';
  }
}

router.post(
  '/decryptor',
  requireAuth,
  requireFeature('bid_decryptor'),
  aiLimiter,
  express.json({ limit: '42mb' }),
  async (req, res, next) => {
    try {
      if (!ai.enabled()) return res.status(503).json({ error: 'AI features are being switched on. Please try again shortly.' });
      const b = req.body || {};
      // The solicitation plus any amendments, Q&A or attachments: PDF or Word files, or pasted text.
      const incoming = Array.isArray(b.files) ? b.files
        : typeof b.pdfBase64 === 'string' && b.pdfBase64 ? [{ name: b.fileName, data: b.pdfBase64 }] : [];
      if (incoming.length > MAX_SOLICITATION_FILES) return res.status(400).json({ error: `Upload up to ${MAX_SOLICITATION_FILES} files at a time.` });
      const files = [];
      let bytesTotal = 0;
      for (const f of incoming) {
        const name = typeof f.name === 'string' && f.name.slice(0, 200) ? f.name.slice(0, 200) : 'solicitation';
        if (typeof f.data !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(f.data)) return res.status(400).json({ error: `${name} could not be read.` });
        const bytes = Buffer.from(f.data, 'base64');
        bytesTotal += bytes.length;
        if (bytesTotal > MAX_PDF_BYTES * 1.5) return res.status(413).json({ error: 'Files can add up to 30 MB.' });
        if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
          files.push({ name, kind: 'pdf', data: f.data });
        } else if (bytes.subarray(0, 2).toString('latin1') === 'PK' && /\.docx$/i.test(name)) {
          const text = await docxText(bytes);
          if (!text) return res.status(400).json({ error: `${name} has no readable text.` });
          files.push({ name, kind: 'text', data: text.slice(0, MAX_TEXT_CHARS) });
        } else {
          return res.status(400).json({ error: `${name}: upload PDF or Word (.docx) files.` });
        }
      }
      const pasted = typeof b.text === 'string' && b.text.trim().length >= 200 ? b.text.slice(0, MAX_TEXT_CHARS) : null;
      if (!files.length && !pasted) return res.status(400).json({ error: 'Upload the solicitation (PDF or Word) or paste at least a few paragraphs of it.' });
      const bidId = b.bidId ? toId(b.bidId) : null;
      if (bidId) {
        const owns = await db.query('SELECT 1 FROM bids WHERE id = $1 AND user_id = $2', [bidId, req.user.id]);
        if (!owns.rowCount) return res.status(404).json({ error: 'Opportunity not found.' });
      }
      const today = await db.query(
        `SELECT count(*)::int AS n FROM rfp_summaries WHERE user_id = $1 AND created_at > now() - interval '1 day'`,
        [req.user.id]
      );
      if (today.rows[0].n >= DECRYPTS_PER_DAY) {
        return res.status(429).json({ error: `You've decrypted ${DECRYPTS_PER_DAY} solicitations in the last 24 hours. Try again tomorrow.` });
      }

      const fileName = files.length ? files.map((f) => f.name).join(', ').slice(0, 200) : 'Pasted text';
      const { rows } = await db.query(
        'INSERT INTO rfp_summaries (user_id, bid_id, file_name) VALUES ($1, $2, $3) RETURNING id',
        [req.user.id, bidId, fileName]
      );
      const id = rows[0].id;
      res.status(202).json({ id, status: 'working' });

      ai.decryptRfp({ files, text: pasted })
        .then((summary) => db.query(
          `UPDATE rfp_summaries SET status = 'ready', summary = $2, completed_at = now() WHERE id = $1`, [id, summary]))
        .catch((err) => {
          console.error(`[decryptor] ${id} failed:`, err.message);
          return db.query(`UPDATE rfp_summaries SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`, [id, safeError(err)]);
        })
        .catch((err) => console.error(`[decryptor] ${id} could not record result:`, err.message));
    } catch (err) {
      next(err);
    }
  }
);

router.get('/decryptor', requireAuth, requireFeature('bid_decryptor'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, bid_id AS "bidId", file_name AS "fileName", status, summary->>'title' AS title,
              summary->>'response_due' AS "responseDue", created_at AS "createdAt"
         FROM rfp_summaries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ summaries: rows });
  } catch (err) { next(err); }
});

router.get('/decryptor/:id', requireAuth, requireFeature('bid_decryptor'), async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const { rows } = await db.query(
      `SELECT id, bid_id AS "bidId", file_name AS "fileName", status, summary, error, created_at AS "createdAt"
         FROM rfp_summaries WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ summary: rows[0] });
  } catch (err) { next(err); }
});

// Turns a decrypted solicitation into a card on the Bid CRM board.
router.post('/decryptor/:id/to-bid', requireAuth, requireFeature('bid_crm'), async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const { rows } = await db.query(
      `SELECT summary, bid_id FROM rfp_summaries WHERE id = $1 AND user_id = $2 AND status = 'ready'`, [id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    if (rows[0].bid_id) return res.json({ bidId: rows[0].bid_id });
    const s = rows[0].summary || {};
    const val = (v, max) => (typeof v === 'string' && v && !/^not stated$/i.test(v) ? v.slice(0, max) : null);
    const bid = await db.query(
      `INSERT INTO bids (user_id, title, agency, solicitation_number, naics, set_aside, place_of_performance, notes, stage, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'qualifying',
               (SELECT COALESCE(max(position) + 1, 0) FROM bids WHERE user_id = $1 AND stage = 'qualifying'))
       RETURNING id`,
      [req.user.id, val(s.title, 200) || 'Untitled solicitation', val(s.agency, 200), val(s.solicitation_number, 100),
        val(s.naics, 20), val(s.set_aside, 60), val(s.place_of_performance, 200),
        [val(s.response_due, 200) && `Response due: ${s.response_due}`, val(s.executive_summary, 4000)].filter(Boolean).join('\n\n')]
    );
    await db.query('UPDATE rfp_summaries SET bid_id = $2 WHERE id = $1', [id, bid.rows[0].id]);
    res.status(201).json({ bidId: bid.rows[0].id });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- AI Proposal Engine

const CONTRACT_TYPES = ['Firm Fixed Price', 'Time and Materials', 'Labor Hour', 'Cost Reimbursement', 'IDIQ', 'BPA', 'Purchase Order', 'Not sure'];
const FILE_TYPES = {
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  'image/png': (b) => b.subarray(1, 4).toString('latin1') === 'PNG',
  'image/webp': (b) => b.subarray(8, 12).toString('latin1') === 'WEBP',
  'image/gif': (b) => b.subarray(0, 3).toString('latin1') === 'GIF',
};
const MAX_FILES = 8;
const MAX_FILES_BYTES = 25 * 1024 * 1024;
const money = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 && n < 1e12 ? Math.round(n * 100) / 100 : null;
};
const line = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max) : '');

/**
 * Contract type, pricing table and supporting files the member adds for one proposal.
 * Totals are computed here so the writer never does its own arithmetic on raw input.
 * Files are passed to Claude and never stored.
 */
function parseProposalDetails(b) {
  const out = { contract: null, pricing: null, attachments: [] };
  const contractType = CONTRACT_TYPES.includes(b.contractType) ? b.contractType : null;
  const delivery = line(b.deliveryTerms, 300);
  if (contractType || delivery) out.contract = { type: contractType || 'Not stated', delivery_and_lead_time: delivery || 'Not stated' };

  const items = Array.isArray(b.pricingItems) ? b.pricingItems.slice(0, 60) : [];
  const rows = [];
  for (const it of items) {
    const description = line(it && it.description, 300);
    if (!description) continue;
    const unitPrice = money(it.unitPrice);
    const quantity = money(it.quantity);
    rows.push({
      item: line(it.item, 20) || String(rows.length + 1).padStart(4, '0'),
      description,
      unit: line(it.unit, 30) || 'Each',
      quantity,
      unit_price: unitPrice,
      total: unitPrice !== null && quantity !== null ? Math.round(unitPrice * quantity * 100) / 100 : null,
    });
  }
  const extras = (Array.isArray(b.pricingExtras) ? b.pricingExtras.slice(0, 10) : [])
    .map((x) => ({ label: line(x && x.label, 100), amount: money(x && x.amount) }))
    .filter((x) => x.label && x.amount !== null);
  if (rows.length || extras.length) {
    const subtotal = rows.reduce((t, r) => t + (r.total || 0), 0);
    const total = subtotal + extras.reduce((t, x) => t + x.amount, 0);
    out.pricing = {
      line_items: rows,
      subtotal: Math.round(subtotal * 100) / 100,
      other_charges: extras,
      total: Math.round(total * 100) / 100,
      note: rows.some((r) => r.total === null) ? 'Some line items have no price yet: use [INSERT: price] for them.' : undefined,
    };
  }

  const files = Array.isArray(b.attachments) ? b.attachments : [];
  if (files.length > MAX_FILES) return { error: `Attach up to ${MAX_FILES} files.` };
  let bytesTotal = 0;
  for (const f of files) {
    const mediaType = f && f.mediaType;
    if (!FILE_TYPES[mediaType] || typeof f.data !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(f.data)) {
      return { error: 'Attach photos (JPG, PNG, WebP) or PDF files only.' };
    }
    const bytes = Buffer.from(f.data, 'base64');
    bytesTotal += bytes.length;
    if (bytesTotal > MAX_FILES_BYTES) return { error: 'Attachments can add up to 25 MB.' };
    if (!FILE_TYPES[mediaType](bytes)) return { error: `${line(f.name, 80) || 'A file'} is not a valid ${mediaType === 'application/pdf' ? 'PDF' : 'image'}.` };
    out.attachments.push({ name: line(f.name, 120) || 'attachment', mediaType, data: f.data });
  }
  return out;
}

router.post(
  '/proposals',
  requireAuth,
  requireFeature('proposal_engine'),
  aiLimiter,
  express.json({ limit: '36mb' }),
  async (req, res, next) => {
    try {
      if (!ai.enabled()) return res.status(503).json({ error: 'AI features are being switched on. Please try again shortly.' });
      if (!req.user.onboarded_at) return res.status(409).json({ error: 'Finish your company setup first, so the proposal is written about your business.', setupRequired: true });
      const b = req.body || {};
      const details = parseProposalDetails(b);
      if (details.error) return res.status(400).json({ error: details.error });
      const bidId = b.bidId ? toId(b.bidId) : null;
      const summaryId = b.rfpSummaryId ? toId(b.rfpSummaryId) : null;
      const instructions = typeof b.instructions === 'string' ? b.instructions.trim().slice(0, 6000) : '';
      if (!bidId && !summaryId && instructions.length < 40) {
        return res.status(400).json({ error: 'Pick an opportunity or decrypted solicitation, or describe the contract in a few sentences.' });
      }

      let bid = null;
      if (bidId) {
        const r = await db.query(
          `SELECT title, agency, solicitation_number, naics, set_aside, place_of_performance,
                  to_char(due_at, 'YYYY-MM-DD') AS due_date, est_value::float AS estimated_value, notes
             FROM bids WHERE id = $1 AND user_id = $2`, [bidId, req.user.id]);
        if (!r.rows[0]) return res.status(404).json({ error: 'Opportunity not found.' });
        bid = r.rows[0];
      }
      let summary = null;
      if (summaryId) {
        const r = await db.query(
          `SELECT summary FROM rfp_summaries WHERE id = $1 AND user_id = $2 AND status = 'ready'`, [summaryId, req.user.id]);
        if (!r.rows[0]) return res.status(404).json({ error: 'Decrypted solicitation not found.' });
        summary = r.rows[0].summary;
      }

      const title = (typeof b.title === 'string' && b.title.trim().slice(0, 200))
        || (bid && bid.title) || (summary && summary.title && `Proposal: ${summary.title}`.slice(0, 200)) || 'Government Proposal';

      const id = await reserveProposal(req.user.id, req.user.tier, { title, bidId, rfpSummaryId: summaryId });
      if (!id) {
        const usage = await proposalUsage(req.user.id, req.user.tier);
        return res.status(429).json({
          error: `You've used all ${usage.limit} proposals for this month. Your count resets on ${new Date(usage.resetsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })}.`,
          usage,
          upgrade: req.user.tier !== 'enterprise',
        });
      }
      res.status(202).json({ id, status: 'working' });

      const profile = aiProfile(req.user);
      const documents = await documentContext(req.user.id);
      ai.writeProposal({ bid, summary, profile, documents, instructions, title, ...details })
        .then((md) => db.query(
          `UPDATE proposals SET status = 'ready', content_md = $2, completed_at = now() WHERE id = $1`, [id, md]))
        .catch((err) => {
          console.error(`[proposals] ${id} failed:`, err.message);
          return db.query(`UPDATE proposals SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`, [id, safeError(err)]);
        })
        .catch((err) => console.error(`[proposals] ${id} could not record result:`, err.message));
    } catch (err) {
      next(err);
    }
  }
);

router.get('/proposals', requireAuth, requireFeature('proposal_engine'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, bid_id AS "bidId", title, status, error, created_at AS "createdAt"
         FROM proposals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ proposals: rows, usage: await proposalUsage(req.user.id, req.user.tier) });
  } catch (err) { next(err); }
});

router.get('/proposals/:id', requireAuth, requireFeature('proposal_engine'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, bid_id AS "bidId", title, status, error, content_md AS "contentMd", created_at AS "createdAt"
         FROM proposals WHERE id = $1 AND user_id = $2`,
      [toId(req.params.id), req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ proposal: rows[0] });
  } catch (err) { next(err); }
});

// Members edit the draft in the dashboard before exporting.
router.patch('/proposals/:id', requireAuth, requireFeature('proposal_engine'), express.json({ limit: '1mb' }), async (req, res, next) => {
  try {
    const md = req.body && req.body.contentMd;
    if (typeof md !== 'string' || md.length > 500_000) return res.status(400).json({ error: 'Invalid proposal text.' });
    const { rowCount } = await db.query(
      `UPDATE proposals SET content_md = $3 WHERE id = $1 AND user_id = $2 AND status = 'ready'`,
      [toId(req.params.id), req.user.id, md]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * A job still 'working' after 30 minutes was cut off by a restart or deploy and will never finish;
 * fail it so the member sees why and the proposal credit comes back.
 */
async function failInterruptedJobs() {
  const msg = 'This was interrupted by a system update. Please run it again; it did not count toward your limit.';
  for (const table of ['proposals', 'rfp_summaries', 'company_documents', 'capability_statements']) {
    await db.query(
      `UPDATE ${table} SET status = 'failed', error = $1, completed_at = now()
        WHERE status = 'working' AND created_at < now() - interval '30 minutes'`,
      [msg]
    );
  }
}

module.exports = { router, failInterruptedJobs };
