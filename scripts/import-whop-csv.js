'use strict';

/**
 * Loads paid buyers from a Whop customer/membership CSV export into authorized_purchasers.
 * Usage: node scripts/import-whop-csv.js ./whop-export.csv [core|enterprise]
 * The first column whose header contains "email" is used. Safe to re-run.
 */

require('dotenv').config();
const fs = require('fs');
const { pool } = require('../src/db');
const { normalizeEmail, isValidEmail } = require('../src/validation');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

async function main() {
  const [file, tierArg] = process.argv.slice(2);
  if (!file) throw new Error('Usage: node scripts/import-whop-csv.js <file.csv> [core|enterprise]');
  const tier = tierArg ? tierArg.toLowerCase() : null;
  if (tier && !['core', 'enterprise'].includes(tier)) throw new Error('Tier must be core or enterprise');

  const [header, ...rows] = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const col = header.findIndex((h) => h.toLowerCase().includes('email'));
  if (col === -1) throw new Error('No column with "email" in its header was found');

  let added = 0;
  let skipped = 0;
  for (const r of rows) {
    const email = normalizeEmail(r[col]);
    if (!isValidEmail(email)) { skipped++; continue; }
    const result = await pool.query(
      `INSERT INTO authorized_purchasers (email, tier, source) VALUES ($1, $2, 'csv')
       ON CONFLICT ((lower(email))) DO UPDATE SET tier = COALESCE(EXCLUDED.tier, authorized_purchasers.tier)
       RETURNING (xmax = 0) AS inserted`,
      [email, tier]
    );
    if (result.rows[0].inserted) added++;
  }
  console.log(`Imported ${added} new buyer(s); ${rows.length - added - skipped} already present; ${skipped} invalid row(s) skipped.`);
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => pool.end());
