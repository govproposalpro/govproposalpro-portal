'use strict';

/**
 * Contract-win popups on the public site. The team manages the list in Admin -> Wins; the
 * landing page and the embeddable script (/embed/wins.js) read published wins from the public
 * feed below, which is the only unauthenticated read in the app and returns names, amounts and
 * agencies only.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const SEED = path.join(__dirname, '..', '..', 'db', 'seed', 'contract-wins.json');
const FEED_SIZE = 40;

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max) : '');
const amountOf = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 1e12 ? Math.round(n) : null;
};

/** Validates one win from the admin form or an import line. */
function parseWin(b) {
  const name = clean(b && b.name, 60);
  const agency = clean(b && b.agency, 160).replace(/^the\s+/i, '');
  const amount = amountOf(b && b.amount);
  if (!name) return { error: 'Add the member name, like Emily C.' };
  if (!agency) return { error: 'Add the agency.' };
  if (!amount) return { error: 'Add the contract amount.' };
  return { win: { name, agency, amount } };
}

/** Parses pasted lines: "Emily C. just won a contract worth over $30,000 from the Department of ..." or "Emily C., 30000, Department of ...". */
function parseImport(text) {
  const wins = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const lineText = raw.replace(/^[\s•*\-"“]+|["”!.\s]+$/g, '');
    if (!lineText) continue;
    let m = lineText.match(/^(.+?)\s+just won a contract worth (?:over )?\$?([\d,]+(?:\.\d+)?)\s+from\s+(.+)$/i);
    if (!m) m = lineText.match(/^(.+?)[,\t|]\s*\$?([\d,]+(?:\.\d+)?)\s*[,\t|]\s*(.+)$/);
    if (!m) continue;
    const { win } = parseWin({ name: m[1], amount: m[2], agency: m[3] });
    if (win) wins.push(win);
  }
  return wins.slice(0, 2000);
}

/** Loads the owner-supplied list into an empty table (first deploy only). */
async function seedWins() {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM contract_wins');
  if (rows[0].n > 0) return;
  const list = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  const wins = list.map((w) => parseWin(w).win).filter(Boolean);
  if (!wins.length) return;
  await db.query(
    `INSERT INTO contract_wins (name, amount, agency)
     SELECT * FROM unnest($1::text[], $2::numeric[], $3::text[])`,
    [wins.map((w) => w.name), wins.map((w) => w.amount), wins.map((w) => w.agency)]
  );
  console.log(`Seeded ${wins.length} contract wins.`);
}

// ---------------------------------------------------------------- public feed

const publicRouter = express.Router();
const feedLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false });

// Any site may read it (the main site embeds the popup script); it is read-only and holds no secrets.
publicRouter.get('/public/wins', feedLimiter, async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, amount::float AS amount, agency FROM contract_wins
        WHERE published ORDER BY random() LIMIT $1`, [FEED_SIZE]);
    res.set({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=60', 'Cross-Origin-Resource-Policy': 'cross-origin' });
    res.json({ wins: rows });
  } catch (err) { next(err); }
});

// Totals for the landing page (hero pill, wins wall, agency strip). Published wins only, cached
// in memory for a few minutes so a busy landing page costs one query per window.
const STATS_TTL_MS = 5 * 60 * 1000;
let statsCache = { at: 0, body: null };
publicRouter.get('/public/wins/stats', feedLimiter, async (_req, res, next) => {
  try {
    if (!statsCache.body || Date.now() - statsCache.at > STATS_TTL_MS) {
      const [totals, agencies] = await Promise.all([
        db.query('SELECT count(*)::int AS count, coalesce(sum(amount), 0)::float AS total FROM contract_wins WHERE published'),
        db.query(`SELECT agency FROM contract_wins WHERE published GROUP BY agency ORDER BY count(*) DESC, agency LIMIT 24`),
      ]);
      statsCache = { at: Date.now(), body: { ...totals.rows[0], agencies: agencies.rows.map((r) => r.agency) } };
    }
    res.set({ 'Cache-Control': 'public, max-age=300' });
    res.json(statsCache.body);
  } catch (err) { next(err); }
});

module.exports = { publicRouter, seedWins, parseWin, parseImport };
