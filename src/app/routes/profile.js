'use strict';

// Business profile, onboarding, alert settings, and company documents (capability statements etc.).

const express = require('express');
const db = require('../../db');
const ai = require('../ai');
const { requireAuth } = require('../session');
const { parseProfileUpdate } = require('../profile');

const router = express.Router();
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_DOCS = 30;
const DOC_KINDS = ['capability_statement', 'past_performance', 'resume', 'company_overview', 'other'];

router.patch('/me/profile', requireAuth, express.json({ limit: '128kb' }), async (req, res, next) => {
  try {
    let parsed;
    try {
      parsed = parseProfileUpdate(req.body);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!parsed.sets.length) return res.status(400).json({ error: 'Nothing to update.' });
    await db.query(`UPDATE "Users" SET ${parsed.sets.join(', ')} WHERE id = $1`, [req.user.id, ...parsed.values]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/me/onboarding/complete', requireAuth, async (req, res, next) => {
  try {
    await db.query('UPDATE "Users" SET onboarded_at = COALESCE(onboarded_at, now()) WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/me/settings', requireAuth, express.json({ limit: '2kb' }), async (req, res, next) => {
  try {
    const v = req.body && req.body.emailAlerts;
    if (typeof v !== 'boolean') return res.status(400).json({ error: 'Invalid setting.' });
    await db.query('UPDATE "Users" SET email_alerts = $2 WHERE id = $1', [req.user.id, v]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------ company documents

router.get('/me/documents', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, file_name AS "fileName", kind, status, summary, extracted, error, created_at AS "createdAt"
         FROM company_documents WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ documents: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/me/documents', requireAuth, express.json({ limit: '28mb' }), async (req, res, next) => {
  try {
    if (!ai.enabled()) return res.status(503).json({ error: 'Document reading is being switched on. Please try again shortly.' });
    const b = req.body || {};
    const kind = DOC_KINDS.includes(b.kind) ? b.kind : 'other';
    let pdfBase64 = null;
    let text = null;
    if (typeof b.pdfBase64 === 'string' && b.pdfBase64) {
      if (!/^[A-Za-z0-9+/]+=*$/.test(b.pdfBase64)) return res.status(400).json({ error: 'That file could not be read.' });
      const bytes = Buffer.from(b.pdfBase64, 'base64');
      if (bytes.length > MAX_PDF_BYTES) return res.status(413).json({ error: 'PDFs up to 20 MB are supported.' });
      if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return res.status(400).json({ error: 'Please upload a PDF file.' });
      pdfBase64 = b.pdfBase64;
    } else if (typeof b.text === 'string' && b.text.trim().length >= 50) {
      text = b.text.slice(0, 200_000);
    } else {
      return res.status(400).json({ error: 'Upload a PDF or paste the text.' });
    }
    const count = await db.query('SELECT count(*)::int AS n FROM company_documents WHERE user_id = $1', [req.user.id]);
    if (count.rows[0].n >= MAX_DOCS) return res.status(400).json({ error: `You can keep up to ${MAX_DOCS} documents. Remove one first.` });

    const fileName = (typeof b.fileName === 'string' && b.fileName.slice(0, 200)) || (pdfBase64 ? 'document.pdf' : 'Pasted text');
    const { rows } = await db.query(
      'INSERT INTO company_documents (user_id, file_name, kind) VALUES ($1, $2, $3) RETURNING id',
      [req.user.id, fileName, kind]
    );
    const id = rows[0].id;
    res.status(202).json({ id, status: 'working' });

    ai.readCompanyDocument({ pdfBase64, text, kind })
      .then((r) => db.query(
        `UPDATE company_documents SET status = 'ready', summary = $2, extracted = $3, completed_at = now() WHERE id = $1`,
        [id, r.summary, r.extracted]))
      .catch((err) => {
        console.error(`[documents] ${id} failed:`, err.message);
        const msg = err instanceof ai.AiError ? err.message : 'We could not read that document. Please try again.';
        return db.query(`UPDATE company_documents SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`, [id, msg]);
      })
      .catch((err) => console.error(`[documents] ${id} could not record result:`, err.message));
  } catch (err) {
    next(err);
  }
});

router.delete('/me/documents/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await db.query('DELETE FROM company_documents WHERE id = $1 AND user_id = $2',
      [Number.parseInt(req.params.id, 10) || 0, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Ready document summaries for prompts, newest first, capped so prompts stay a sane size. */
async function documentContext(userId, maxChars = 30_000) {
  const { rows } = await db.query(
    `SELECT file_name, kind, summary FROM company_documents
      WHERE user_id = $1 AND status = 'ready' ORDER BY created_at DESC`,
    [userId]
  );
  const out = [];
  let used = 0;
  for (const r of rows) {
    if (!r.summary || used + r.summary.length > maxChars) continue;
    out.push({ document: r.file_name, type: r.kind, summary: r.summary });
    used += r.summary.length;
  }
  return out;
}

module.exports = { router, documentContext };
