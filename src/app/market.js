'use strict';

/**
 * Real market prices for the Autopilot: what the government actually paid for similar work,
 * from USAspending.gov award data (free, no key). Results are cached for a day and shared.
 */

const { cached } = require('./intel');

const API = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';
const FIELDS = ['Award ID', 'Recipient Name', 'Award Amount', 'Description', 'Awarding Agency', 'Start Date', 'End Date', 'Place of Performance State Code'];
const STOP = new Set(('the and for with from into this that services service supply supplies support requirement contract '
  + 'department agency federal government center office base year option years annual notice solicitation rfq rfp '
  + 'sources sought presolicitation combined synopsis brand name equal new various multiple').split(' '));

/** Two or three words from the title that describe the work, e.g. "janitorial", "patio umbrellas". */
function keywordsOf(title) {
  return [...new Set(String(title || '').toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w)))].slice(0, 3);
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
};

async function search(filters) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ filters, fields: FIELDS, limit: 40, sort: 'Start Date', order: 'desc' }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`USAspending -> ${res.status}`);
  const data = await res.json();
  return (data.results || []).filter((r) => Number(r['Award Amount']) > 0);
}

/**
 * Comparable awards for one opportunity and what they cost.
 * @returns {{ basis: string, count: number, low: number|null, median: number|null, high: number|null, awards: object[] }}
 */
async function comparables({ naics, title, agency }) {
  const code = String(naics || '').match(/\d{6}/);
  const words = keywordsOf(title);
  const key = `usa:comps:${code ? code[0] : '-'}:${words.join('+')}:${String(agency || '').slice(0, 60)}`;
  return cached(key, 24 * 3600_000, async () => {
    const end = new Date();
    const start = new Date(Date.now() - 4 * 365 * 86400000);
    const base = {
      award_type_codes: ['A', 'B', 'C', 'D'],
      time_period: [{ start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) }],
    };
    if (code) base.naics_codes = [code[0]];
    const topAgency = String(agency || '').split(/[/.,]/)[0].trim();
    // Most specific first: same work at the same agency, then same work anywhere, then the NAICS code alone.
    const attempts = [
      words.length && topAgency ? { basis: `${words.join(', ')} at ${topAgency}`, f: { ...base, keywords: words, agencies: [{ type: 'awarding', tier: 'toptier', name: topAgency }] } } : null,
      words.length ? { basis: `${words.join(', ')} contracts`, f: { ...base, keywords: words } } : null,
      code ? { basis: `NAICS ${code[0]} contracts`, f: base } : null,
    ].filter(Boolean);
    for (const a of attempts) {
      let rows;
      try { rows = await search(a.f); } catch { continue; }
      if (rows.length < 3 && a !== attempts[attempts.length - 1]) continue;
      const amounts = rows.map((r) => Number(r['Award Amount'])).sort((x, y) => x - y);
      return {
        basis: a.basis,
        count: rows.length,
        low: quantile(amounts, 0.25),
        median: quantile(amounts, 0.5),
        high: quantile(amounts, 0.75),
        awards: rows.slice(0, 8).map((r) => ({
          id: r['Award ID'],
          recipient: r['Recipient Name'],
          amount: Math.round(Number(r['Award Amount'])),
          description: String(r.Description || '').slice(0, 240),
          agency: r['Awarding Agency'],
          start: r['Start Date'],
          end: r['End Date'],
          state: r['Place of Performance State Code'] || '',
          url: r.generated_internal_id ? `https://www.usaspending.gov/award/${encodeURIComponent(r.generated_internal_id)}` : '',
        })),
      };
    }
    return { basis: 'No comparable awards found', count: 0, low: null, median: null, high: null, awards: [] };
  });
}

module.exports = { comparables, keywordsOf };
