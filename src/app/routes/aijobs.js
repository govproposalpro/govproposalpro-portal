'use strict';

/**
 * Enterprise AI tasks that run as background jobs: Section M Compliance Grader, RFI Ghostwriter
 * and Past Performance Portfolio Builder. Each kind has its own daily cap so Claude spend stays
 * tied to real member use.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const ai = require('../ai');
const { requireAuth } = require('../session');
const { hasFeature } = require('../tiers');
const { aiProfile } = require('../profile');

const router = express.Router();

const KINDS = {
  section_m: { feature: 'section_m', perDay: 15, label: 'grades' },
  rfi: { feature: 'rfi_ghostwriter', perDay: 15, label: 'RFI drafts' },
  case_study: { feature: 'past_performance', perDay: 20, label: 'case studies' },
};

const toId = (v) => {
  const n = typeof v === 'number' ? v : Number.parseInt(v, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max) : '');
const safeError = (err) => (err instanceof ai.AiError ? err.message : 'Something went wrong on our side. Please try again.');

const burst = rateLimit({
  windowMs: 60 * 1000,
  limit: 4,
  keyGenerator: (req) => `u${req.user.id}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Slow down a little. Try again in a minute.' },
});

const kindOf = (req, res, next) => {
  const kind = KINDS[req.params.kind] ? req.params.kind : null;
  if (!kind) return res.status(404).json({ error: 'Not found' });
  if (!hasFeature(req.user.tier, KINDS[kind].feature)) return res.status(403).json({ error: 'This feature is part of the Enterprise Edition.', upgrade: true });
  req.kind = kind;
  return next();
};

const JOB_FIELDS = `id, kind, title, ref_id AS "refId", status, input, result, error, created_at AS "createdAt", completed_at AS "completedAt"`;

router.get('/jobs/:kind', requireAuth, kindOf, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT ${JOB_FIELDS} FROM ai_jobs WHERE user_id = $1 AND kind = $2 ORDER BY created_at DESC LIMIT 100`,
      [req.user.id, req.kind]);
    res.json({ jobs: rows });
  } catch (err) { next(err); }
});

router.get('/jobs/:kind/:id', requireAuth, kindOf, async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT ${JOB_FIELDS} FROM ai_jobs WHERE id = $1 AND user_id = $2 AND kind = $3`,
      [toId(req.params.id), req.user.id, req.kind]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ job: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/jobs/:kind/:id', requireAuth, kindOf, async (req, res, next) => {
  try {
    const { rowCount } = await db.query('DELETE FROM ai_jobs WHERE id = $1 AND user_id = $2 AND kind = $3', [toId(req.params.id), req.user.id, req.kind]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** Loads what the job needs and returns { title, refId, input, run } or { error, status }. */
async function prepare(req) {
  const b = req.body || {};
  const user = req.user;
  if (req.kind === 'section_m') {
    const id = toId(b.proposalId);
    const p = id && (await db.query(
      `SELECT p.title, p.content_md, s.summary FROM proposals p LEFT JOIN rfp_summaries s ON s.id = p.rfp_summary_id AND s.status = 'ready'
        WHERE p.id = $1 AND p.user_id = $2 AND p.status = 'ready'`, [id, user.id])).rows[0];
    if (!p) return { status: 404, error: 'Pick one of your finished proposals.' };
    let summary = p.summary;
    const sid = toId(b.rfpSummaryId);
    if (sid) {
      const s = (await db.query(`SELECT summary FROM rfp_summaries WHERE id = $1 AND user_id = $2 AND status = 'ready'`, [sid, user.id])).rows[0];
      if (!s) return { status: 404, error: 'Decrypted solicitation not found.' };
      summary = s.summary;
    }
    return {
      title: `Grade: ${p.title}`.slice(0, 200), refId: id, input: { proposalId: id, rfpSummaryId: sid || null },
      run: () => ai.gradeSectionM({ proposalMd: p.content_md || '', summary }),
    };
  }
  if (req.kind === 'rfi') {
    const id = toId(b.rfpSummaryId);
    const s = id && (await db.query(`SELECT summary FROM rfp_summaries WHERE id = $1 AND user_id = $2 AND status = 'ready'`, [id, user.id])).rows[0];
    if (!s) return { status: 404, error: 'Pick a decrypted solicitation.' };
    const notes = clean(b.notes, 4000);
    return {
      title: `RFI: ${(s.summary && s.summary.title) || 'Solicitation'}`.slice(0, 200), refId: id, input: { rfpSummaryId: id, notes },
      run: () => ai.writeRfi({ summary: s.summary, profile: aiProfile(user), notes }),
    };
  }
  // case_study: one of the member's past performance entries, or a project typed in here.
  const p = b.project && typeof b.project === 'object' ? b.project : {};
  const project = {
    title: clean(p.title, 200), customer: clean(p.customer, 200), value: clean(p.value, 60), period: clean(p.period, 80),
    role: ['prime', 'sub', 'commercial'].includes(p.role) ? p.role : 'prime', description: clean(p.description, 4000),
    contract_number: clean(p.contractNumber, 80), results: clean(p.results, 3000),
  };
  if (!project.title || project.description.length < 20) return { status: 400, error: 'Add the project name and a few sentences about what you delivered.' };
  return {
    title: project.title, refId: null, input: { project },
    run: () => ai.writeCaseStudy({ project, profile: aiProfile(user) }),
  };
}

router.post('/jobs/:kind', requireAuth, kindOf, burst, express.json({ limit: '32kb' }), async (req, res, next) => {
  try {
    if (!ai.enabled()) return res.status(503).json({ error: 'AI features are being switched on. Please try again shortly.' });
    const { perDay, label } = KINDS[req.kind];
    const today = await db.query(
      `SELECT count(*)::int AS n FROM ai_jobs WHERE user_id = $1 AND kind = $2 AND created_at > now() - interval '1 day'`,
      [req.user.id, req.kind]);
    if (today.rows[0].n >= perDay) return res.status(429).json({ error: `You can run ${perDay} ${label} a day. Try again tomorrow.` });
    const job = await prepare(req);
    if (job.error) return res.status(job.status).json({ error: job.error });
    const { rows } = await db.query(
      `INSERT INTO ai_jobs (user_id, kind, title, ref_id, input) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.user.id, req.kind, job.title, job.refId, JSON.stringify(job.input)]);
    const id = rows[0].id;
    res.status(202).json({ id, status: 'working' });
    job.run()
      .then((result) => db.query(`UPDATE ai_jobs SET status = 'ready', result = $2, completed_at = now() WHERE id = $1`, [id, JSON.stringify(result)]))
      .catch((err) => {
        console.error(`[jobs] ${req.kind} ${id} failed:`, err.message);
        return db.query(`UPDATE ai_jobs SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`, [id, safeError(err)]);
      })
      .catch((err) => console.error(`[jobs] ${id} could not record result:`, err.message));
  } catch (err) { next(err); }
});

// Lets the member fix up a finished RFI or case study before sending or using it.
router.patch('/jobs/:kind/:id', requireAuth, kindOf, express.json({ limit: '64kb' }), async (req, res, next) => {
  try {
    const result = req.body && req.body.result;
    if (!result || typeof result !== 'object' || JSON.stringify(result).length > 60_000) return res.status(400).json({ error: 'Invalid content.' });
    const { rowCount } = await db.query(
      `UPDATE ai_jobs SET result = $4 WHERE id = $1 AND user_id = $2 AND kind = $3 AND status = 'ready'`,
      [toId(req.params.id), req.user.id, req.kind, JSON.stringify(result)]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = { router };
