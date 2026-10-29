'use strict';

/**
 * Images and documents a member adds to a finished proposal: cover photos, images placed in the
 * text, and attachments (PDF, Word, images) laid out as appendix pages in the proposal PDF.
 * Also imports a proposal the member edited in Word back into the dashboard. None of this calls
 * the AI, so editing and dressing up a proposal never costs a generation.
 */

const express = require('express');
const mammoth = require('mammoth');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const { requireAuth, requireFeature } = require('../session');

const router = express.Router();

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SNIFF = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  'image/png': (b) => b.subarray(1, 4).toString('latin1') === 'PNG',
  'image/webp': (b) => b.subarray(8, 12).toString('latin1') === 'WEBP',
  'image/gif': (b) => b.subarray(0, 3).toString('latin1') === 'GIF',
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  [DOCX]: (b) => b.subarray(0, 4).toString('latin1') === 'PK\u0003\u0004',
};
const isImage = (t) => t.startsWith('image/');
const ROLES = ['cover', 'figure', 'appendix'];
const MB = 1024 * 1024;
// Images are shrunk in the browser before upload, so 4 MB is generous. Totals keep the database small.
const MAX_IMAGE = 4 * MB;
const MAX_DOC = 10 * MB;
const MAX_PER_PROPOSAL = 30 * MB;
const MAX_FILES = 24;
const MAX_COVER = 3;

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `pf${req.user.id}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many uploads at once. Try again in a minute.' },
});

const toId = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max) : '');
const dim = (v) => { const n = Number.parseInt(v, 10); return n > 0 && n < 20000 ? n : null; };

const COLUMNS = `id::int AS id, role, name, caption, media_type AS "mediaType", bytes, width, height, position, created_at AS "createdAt"`;

/** The member's own, not archived proposal, or null. Photos can be added while it is still being written. */
async function ownProposal(id, userId, { writing = false } = {}) {
  const { rows } = await db.query(
    `SELECT id FROM proposals WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
        AND (status = 'ready' OR ($3 AND status = 'working'))`, [id, userId, writing]);
  return rows[0] || null;
}

/** Decodes and checks an uploaded file. Returns { buffer } or { error }. */
function readUpload(b) {
  const mediaType = b && b.mediaType;
  if (!SNIFF[mediaType] || typeof b.data !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(b.data)) {
    return { error: 'Add a photo (JPG, PNG, WebP), a PDF or a Word (.docx) file.' };
  }
  const buffer = Buffer.from(b.data, 'base64');
  if (!buffer.length || !SNIFF[mediaType](buffer)) return { error: `${text(b.name, 80) || 'That file'} could not be read. Try saving it again.` };
  if (buffer.length > (isImage(mediaType) ? MAX_IMAGE : MAX_DOC)) {
    return { error: isImage(mediaType) ? 'Images can be up to 4 MB.' : 'Documents can be up to 10 MB.' };
  }
  return { buffer, mediaType };
}

router.get('/proposals/:id/files', requireAuth, requireFeature('proposal_engine'), async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id || !(await ownProposal(id, req.user.id))) return res.status(404).json({ error: 'Not found' });
    const { rows } = await db.query(
      `SELECT ${COLUMNS} FROM proposal_files WHERE proposal_id = $1 ORDER BY role, position, id`, [id]);
    res.json({ files: rows });
  } catch (err) { next(err); }
});

router.post('/proposals/:id/files', requireAuth, requireFeature('proposal_engine'), uploadLimiter, express.json({ limit: '15mb' }),
  async (req, res, next) => {
    try {
      const id = toId(req.params.id);
      if (!id || !(await ownProposal(id, req.user.id, { writing: true }))) return res.status(404).json({ error: 'Not found' });
      const b = req.body || {};
      const role = ROLES.includes(b.role) ? b.role : 'figure';
      const file = readUpload(b);
      if (file.error) return res.status(400).json({ error: file.error });
      if (role !== 'appendix' && !isImage(file.mediaType)) return res.status(400).json({ error: 'Only photos can go on the cover or in the text. Add documents as attachments.' });

      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        // One upload at a time per proposal, so parallel uploads can't slip past the limits.
        await client.query('SELECT pg_advisory_xact_lock(7340002, $1::int)', [id]);
        const { rows: [t] } = await client.query(
          `SELECT count(*)::int AS n, COALESCE(sum(bytes), 0)::bigint AS total,
                  count(*) FILTER (WHERE role = 'cover')::int AS covers,
                  COALESCE(max(position) FILTER (WHERE role = $2), -1)::int AS last
             FROM proposal_files WHERE proposal_id = $1`, [id, role]);
        let error = null;
        if (t.n >= MAX_FILES) error = `A proposal can hold up to ${MAX_FILES} images and attachments.`;
        else if (Number(t.total) + file.buffer.length > MAX_PER_PROPOSAL) error = 'This proposal\'s images and attachments can add up to 30 MB. Remove one or use a smaller file.';
        else if (role === 'cover' && t.covers >= MAX_COVER) error = 'The cover holds up to 3 photos. Remove one first.';
        if (error) { await client.query('ROLLBACK'); return res.status(400).json({ error }); }
        const { rows } = await client.query(
          `INSERT INTO proposal_files (proposal_id, user_id, role, name, caption, media_type, bytes, width, height, position, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING ${COLUMNS}`,
          [id, req.user.id, role, text(b.name, 160) || 'file', text(b.caption, 300) || null, file.mediaType, file.buffer.length,
            dim(b.width), dim(b.height), t.last + 1, file.buffer]);
        await client.query('COMMIT');
        res.status(201).json({ file: rows[0] });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) { next(err); }
  });

/** The file itself, for the dashboard (images in the text, the PDF preview, downloads). */
router.get('/proposal-files/:fid', requireAuth, requireFeature('proposal_engine'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT f.name, f.media_type, f.data FROM proposal_files f JOIN proposals p ON p.id = f.proposal_id
        WHERE f.id = $1 AND f.user_id = $2 AND p.archived_at IS NULL`, [toId(req.params.fid), req.user.id]);
    const f = rows[0];
    if (!f) return res.status(404).json({ error: 'Not found' });
    const ascii = f.name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
    res.set({
      'Content-Type': f.media_type,
      'Content-Disposition': `${f.media_type === DOCX ? 'attachment' : 'inline'}; filename="${ascii}"`,
      'Cache-Control': 'private, max-age=3600',
    });
    res.send(f.data);
  } catch (err) { next(err); }
});

/** Word attachments as HTML, so their text can be laid out as appendix pages. */
router.get('/proposal-files/:fid/html', requireAuth, requireFeature('proposal_engine'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT f.data FROM proposal_files f JOIN proposals p ON p.id = f.proposal_id
        WHERE f.id = $1 AND f.user_id = $2 AND f.media_type = $3 AND p.archived_at IS NULL`, [toId(req.params.fid), req.user.id, DOCX]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const { value } = await mammoth.convertToHtml({ buffer: rows[0].data });
    res.json({ html: value });
  } catch (err) {
    if (err && err.status) return next(err);
    res.status(422).json({ error: 'That Word file could not be read.' });
  }
});

router.patch('/proposal-files/:fid', requireAuth, requireFeature('proposal_engine'), express.json(), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows: [f] } = await db.query(
      'SELECT id, proposal_id, role, media_type FROM proposal_files WHERE id = $1 AND user_id = $2', [toId(req.params.fid), req.user.id]);
    if (!f) return res.status(404).json({ error: 'Not found' });
    const sets = [];
    const vals = [f.id];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.caption !== undefined) set('caption', text(b.caption, 300) || null);
    if (b.position !== undefined) {
      const n = Number.parseInt(b.position, 10);
      if (!Number.isSafeInteger(n) || n < 0 || n > 1000) return res.status(400).json({ error: 'Invalid position.' });
      set('position', n);
    }
    if (b.role !== undefined && b.role !== f.role) {
      if (!ROLES.includes(b.role)) return res.status(400).json({ error: 'Invalid place.' });
      if (b.role !== 'appendix' && !isImage(f.media_type)) return res.status(400).json({ error: 'Only photos can go on the cover or in the text.' });
      if (b.role === 'cover') {
        const { rows: [c] } = await db.query(`SELECT count(*)::int AS n FROM proposal_files WHERE proposal_id = $1 AND role = 'cover'`, [f.proposal_id]);
        if (c.n >= MAX_COVER) return res.status(400).json({ error: 'The cover holds up to 3 photos. Remove one first.' });
      }
      set('role', b.role);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to change.' });
    const { rows } = await db.query(`UPDATE proposal_files SET ${sets.join(', ')} WHERE id = $1 RETURNING ${COLUMNS}`, vals);
    res.json({ file: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/proposal-files/:fid', requireAuth, requireFeature('proposal_engine'), async (req, res, next) => {
  try {
    const { rowCount } = await db.query('DELETE FROM proposal_files WHERE id = $1 AND user_id = $2', [toId(req.params.fid), req.user.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * A proposal the member downloaded, edited in Word and wants back in the dashboard. Returns the
 * document as HTML (images inline); the browser turns it into the proposal text for review.
 */
router.post('/proposals/:id/import-word', requireAuth, requireFeature('proposal_engine'), uploadLimiter, express.json({ limit: '20mb' }),
  async (req, res, next) => {
    try {
      const id = toId(req.params.id);
      if (!id || !(await ownProposal(id, req.user.id))) return res.status(404).json({ error: 'Not found' });
      const file = readUpload({ ...req.body, mediaType: DOCX });
      if (file.error) return res.status(400).json({ error: 'Choose the proposal as a Word (.docx) file, up to 10 MB. In Word: File > Save As > Word Document.' });
      let html;
      try {
        ({ value: html } = await mammoth.convertToHtml({ buffer: file.buffer }));
      } catch {
        return res.status(422).json({ error: 'That Word file could not be read. In Word: File > Save As > Word Document (.docx), then try again.' });
      }
      res.json({ html });
    } catch (err) { next(err); }
  });

module.exports = { router };
