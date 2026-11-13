'use strict';

/**
 * Recompete Radar: federal contracts in the member's NAICS codes whose current period of
 * performance ends 3 to 18 months from now, so the member can get in front of the recompete
 * before the solicitation drops. Data: USAspending.gov award search (free, no key). One search
 * per NAICS code and state, cached for a day and shared by every member who asks for it.
 */

const { cached } = require('./intel');

// USAPENDING_API_BASE_URL only exists so tests can point at a local stand-in.
const API = `${(process.env.USASPENDING_API_BASE_URL || 'https://api.usaspending.gov').replace(/\/$/, '')}/api/v2/search/spending_by_award/`;
const FIELDS = ['Award ID', 'Recipient Name', 'Recipient UEI', 'Award Amount', 'Description', 'Awarding Agency',
  'Awarding Sub Agency', 'Start Date', 'End Date', 'Place of Performance State Code', 'NAICS'];
const PAGE_SIZE = 100;
const MAX_PAGES = 15; // up to 1,500 awards per NAICS code, latest end dates first
// Below this it is usually a one-off purchase, not a recompete. Nationwide searches only look at
// larger contracts so busy NAICS codes still reach the contracts ending soonest.
const MIN_VALUE = { state: 25_000, nationwide: 250_000 };
const WINDOW = { fromMonths: 3, toMonths: 18 };

const STATES = new Set(('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND '
  + 'OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY GU VI AS MP').split(' '));

const iso = (d) => d.toISOString().slice(0, 10);
const addMonths = (d, n) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x; };

/** Six-digit NAICS codes from free text such as "561730, 561720 Janitorial". */
function naicsCodes(text, max = 3) {
  return [...new Set(String(text || '').match(/\b\d{6}\b/g) || [])].slice(0, max);
}

/** A two-letter state, or '' for nationwide. */
function stateCode(v) {
  const s = String(v || '').trim().toUpperCase();
  return STATES.has(s) ? s : '';
}

/** Guesses the member's state from their address ("..., Columbus, OH 43215"). */
function stateFromAddress(address) {
  const m = String(address || '').toUpperCase().match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
  return m && STATES.has(m[1]) ? m[1] : '';
}

async function page(filters, n) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ filters, fields: FIELDS, limit: PAGE_SIZE, page: n, sort: 'End Date', order: 'desc' }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`USAspending -> ${res.status}`);
  return res.json();
}

/**
 * Awards for one NAICS code (and optional state) ending inside the radar window.
 * USAspending cannot filter on end date, so this pages through awards sorted by end date,
 * newest first, and stops once it passes the start of the window.
 */
async function scan(naics, state) {
  const now = new Date();
  const from = iso(addMonths(now, WINDOW.fromMonths));
  const to = iso(addMonths(now, WINDOW.toMonths));
  const filters = {
    award_type_codes: ['A', 'B', 'C', 'D'],
    naics_codes: [naics],
    // Contracts still running have had some action (an option, a modification) in recent years.
    time_period: [{ start_date: iso(addMonths(now, -48)), end_date: iso(now) }],
    award_amounts: [{ lower_bound: state ? MIN_VALUE.state : MIN_VALUE.nationwide }],
  };
  if (state) filters.place_of_performance_locations = [{ country: 'USA', state }];

  const out = [];
  let complete = false;
  for (let n = 1; n <= MAX_PAGES; n++) {
    const data = await page(filters, n);
    const rows = data.results || [];
    for (const r of rows) {
      const end = String(r['End Date'] || '').slice(0, 10);
      if (end >= from && end <= to) out.push(shape(r, naics));
    }
    const last = rows.length ? String(rows[rows.length - 1]['End Date'] || '').slice(0, 10) : '';
    if (!rows.length || !(data.page_metadata && data.page_metadata.hasNext) || (last && last < from)) { complete = true; break; }
  }
  // complete false: the page limit ran out before the start of the window, so the contracts
  // ending soonest may be missing. The member is told to narrow to a state.
  return { naics, state, from, to, complete, minValue: filters.award_amounts[0].lower_bound, awards: out, fetchedAt: now.toISOString() };
}

function shape(r, naics) {
  const naicsField = r.NAICS && typeof r.NAICS === 'object' ? r.NAICS : {};
  return {
    id: String(r['Award ID'] || ''),
    incumbent: String(r['Recipient Name'] || ''),
    incumbentUei: String(r['Recipient UEI'] || ''),
    value: Math.round(Number(r['Award Amount']) || 0),
    description: String(r.Description || '').slice(0, 300),
    agency: String(r['Awarding Agency'] || ''),
    subAgency: String(r['Awarding Sub Agency'] || ''),
    start: String(r['Start Date'] || '').slice(0, 10),
    end: String(r['End Date'] || '').slice(0, 10),
    state: String(r['Place of Performance State Code'] || ''),
    naics: String(naicsField.code || naics),
    naicsTitle: String(naicsField.description || ''),
    url: r.generated_internal_id ? `https://www.usaspending.gov/award/${encodeURIComponent(r.generated_internal_id)}` : '',
  };
}

/**
 * Every expiring contract across the member's NAICS codes, soonest first.
 * @returns {Promise<{codes: string[], state: string, from: string, to: string, awards: object[], failed: string[]}>}
 */
async function radar({ codes, state }) {
  const st = stateCode(state);
  const results = await Promise.all(codes.map((c) =>
    cached(`usa:recompete:v2:${c}:${st || 'US'}`, 24 * 3600_000, () => scan(c, st))
      .then((r) => ({ ok: true, r }), (err) => { console.error(`[recompete] ${c}/${st || 'US'} failed:`, err.message); return { ok: false, c }; })));
  const seen = new Set();
  const awards = [];
  for (const x of results) {
    if (!x.ok) continue;
    for (const a of x.r.awards) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      awards.push(a);
    }
  }
  awards.sort((a, b) => a.end.localeCompare(b.end) || b.value - a.value);
  const now = new Date();
  return {
    codes,
    state: st,
    from: iso(addMonths(now, WINDOW.fromMonths)),
    to: iso(addMonths(now, WINDOW.toMonths)),
    awards,
    minValue: st ? MIN_VALUE.state : MIN_VALUE.nationwide,
    partial: results.filter((x) => x.ok && !x.r.complete).map((x) => x.r.naics),
    failed: results.filter((x) => !x.ok).map((x) => x.c),
  };
}

module.exports = { radar, naicsCodes, stateCode, stateFromAddress, WINDOW };
