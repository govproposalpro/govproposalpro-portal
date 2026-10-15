'use strict';

// Visual Bid CRM: the member's opportunities as a Kanban board.

const express = require('express');
const db = require('../../db');
const { requireAuth, requireFeature } = require('../session');

const router = express.Router();
const STAGES = ['prospecting', 'qualifying', 'sourcing', 'pricing', 'drafting', 'submitted', 'won', 'lost'];
const MAX_BIDS = 500;

router.use('/bids', requireAuth, requireFeature('bid_crm'));

const clean = (v, max) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max) || null : null;
};

/** Validates writable fields; returns { fields } or { error }. Undefined means "leave unchanged". */
function parseBid(body, { requireTitle }) {
  const b = body && typeof body === 'object' ? body : {};
  const fields = {
    title: clean(b.title, 200),
    agency: clean(b.agency, 200),
    solicitation_number: clean(b.solicitationNumber, 100),
    naics: clean(b.naics, 20),
    set_aside: clean(b.setAside, 60),
    place_of_performance: clean(b.placeOfPerformance, 200),
    notes: typeof b.notes === 'string' ? b.notes.slice(0, 10000) : b.notes === null ? null : undefined,
  };
  if (requireTitle && !fields.title) return { error: 'Give the opportunity a title.' };
  if (fields.title === null) return { error: 'Title cannot be empty.' };

  if (b.dueAt !== undefined) {
    if (b.dueAt === null || b.dueAt === '') fields.due_at = null;
    else if (typeof b.dueAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.dueAt) && !Number.isNaN(Date.parse(b.dueAt))) fields.due_at = b.dueAt;
    else return { error: 'Due date must be a valid date.' };
  }
  if (b.questionsDueAt !== undefined) {
    if (b.questionsDueAt === null || b.questionsDueAt === '') fields.questions_due_at = null;
    else if (typeof b.questionsDueAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.questionsDueAt) && !Number.isNaN(Date.parse(b.questionsDueAt))) fields.questions_due_at = b.questionsDueAt;
    else return { error: 'Questions due date must be a valid date.' };
  }
  if (b.estValue !== undefined) {
    const n = b.estValue === null || b.estValue === '' ? null : Number(b.estValue);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 1e12)) return { error: 'Estimated value must be a positive number.' };
    fields.est_value = n;
  }
  if (b.stage !== undefined) {
    if (!STAGES.includes(b.stage)) return { error: 'Unknown stage.' };
    fields.stage = b.stage;
  }
  if (b.position !== undefined) {
    if (!Number.isInteger(b.position) || b.position < 0 || b.position > 100000) return { error: 'Invalid position.' };
    fields.position = b.position;
  }
  for (const k of Object.keys(fields)) if (fields[k] === undefined) delete fields[k];
  return { fields };
}

const COLUMNS = `id, title, agency, solicitation_number AS "solicitationNumber", naics, set_aside AS "setAside",
  place_of_performance AS "placeOfPerformance", to_char(due_at, 'YYYY-MM-DD') AS "dueAt",
  to_char(questions_due_at, 'YYYY-MM-DD') AS "questionsDueAt", est_value::float AS "estValue",
  stage, position, notes, created_at AS "createdAt", updated_at AS "updatedAt"`;

router.get('/bids', async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT ${COLUMNS} FROM bids WHERE user_id = $1 ORDER BY stage, position, id`, [req.user.id]);
    res.json({ stages: STAGES, bids: rows });
  } catch (err) { next(err); }
});

router.post('/bids', express.json({ limit: '32kb' }), async (req, res, next) => {
  try {
    const { fields, error } = parseBid(req.body, { requireTitle: true });
    if (error) return res.status(400).json({ error });
    const count = await db.query('SELECT count(*)::int AS n FROM bids WHERE user_id = $1', [req.user.id]);
    if (count.rows[0].n >= MAX_BIDS) return res.status(400).json({ error: `Your board holds up to ${MAX_BIDS} opportunities. Archive some lost bids first.` });

    fields.stage = fields.stage || 'prospecting';
    const keys = Object.keys(fields);
    const { rows } = await db.query(
      `INSERT INTO bids (user_id, ${keys.join(', ')}, position)
       VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')},
               (SELECT COALESCE(max(position) + 1, 0) FROM bids WHERE user_id = $1 AND stage = $${keys.length + 2}))
       RETURNING ${COLUMNS}`,
      [req.user.id, ...keys.map((k) => fields[k]), fields.stage]
    );
    res.status(201).json({ bid: rows[0] });
  } catch (err) { next(err); }
});

router.patch('/bids/:id', express.json({ limit: '32kb' }), async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isSafeInteger(id)) return res.status(404).json({ error: 'Not found' });
    const { fields, error } = parseBid(req.body, { requireTitle: false });
    if (error) return res.status(400).json({ error });
    const keys = Object.keys(fields);
    if (keys.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
    const { rows } = await db.query(
      `UPDATE bids SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')}, updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING ${COLUMNS}`,
      [id, req.user.id, ...keys.map((k) => fields[k])]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ bid: rows[0] });
  } catch (err) { next(err); }
});

// Saves a column's new order after a drag and drop: { stage, ids: [in order] }.
router.post('/bids/reorder', express.json({ limit: '16kb' }), async (req, res, next) => {
  try {
    const { stage, ids } = req.body || {};
    if (!STAGES.includes(stage) || !Array.isArray(ids) || ids.length > MAX_BIDS || !ids.every(Number.isSafeInteger)) {
      return res.status(400).json({ error: 'Invalid order.' });
    }
    await db.query(
      `UPDATE bids b SET stage = $2, position = o.ord - 1, updated_at = now()
         FROM unnest($3::bigint[]) WITH ORDINALITY AS o(id, ord)
        WHERE b.id = o.id AND b.user_id = $1`,
      [req.user.id, stage, ids]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/bids/:id', async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isSafeInteger(id)) return res.status(404).json({ error: 'Not found' });
    const { rowCount } = await db.query('DELETE FROM bids WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = { router, STAGES };
