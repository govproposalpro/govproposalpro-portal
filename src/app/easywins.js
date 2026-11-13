'use strict';

/**
 * Easy Wins Feed: the small, fast, low-competition work a beginner can actually win first.
 * 1. Open SAM.gov notices in the member's NAICS codes, re-ranked for ease rather than fit:
 *    combined synopsis/solicitations (usually quick RFQs), a set-aside the member qualifies for,
 *    work in their state and enough time to respond. Uses the same shared 6-hour cache as the
 *    Matchmaker, so it costs no extra SAM.gov calls.
 * 2. "Buyers to call": the contracting offices that bought the member's NAICS under the
 *    simplified acquisition threshold in the last 12 months (USAspending.gov, free, cached a day).
 */

const intel = require('./intel');
const { post, fetchAward, median, ORIGIN } = require('./xray');

const SAT = 350_000; // simplified acquisition threshold (FAR 2.101, from Oct 1, 2025)
const SEARCH = `${ORIGIN}/api/v2/search/spending_by_award/`;
const BUYER_DETAILS = 8;

const iso = (d) => d.toISOString().slice(0, 10);

/** Set-aside codes this member can bid on. */
function eligibleCodes(user) {
  const certs = String(user.certifications || '').split(',').map((c) => c.trim()).filter(Boolean);
  return new Set([...intel.SMALL_BUSINESS, ...certs.flatMap((c) => intel.SET_ASIDE_FOR_CERT[c] || [])]);
}

function homeStates(user) {
  const text = String([user.service_area, user.address].join(' ')).toUpperCase();
  return { text, nationwide: /NATIONWIDE/.test(text) };
}

/** Ranks open notices by how easy they are for this member to win. Pure (no I/O). */
function rankEasy(user, list, now = Date.now()) {
  const eligible = eligibleCodes(user);
  const home = homeStates(user);
  const seen = new Set();
  const out = [];
  for (const o of list) {
    if (!o.noticeId || seen.has(o.noticeId)) continue;
    seen.add(o.noticeId);
    if (/sources sought|presolicitation|special notice|award/i.test(o.type || '')) continue; // not biddable yet
    const due = Date.parse(o.responseDeadline || '');
    const days = Number.isFinite(due) ? Math.ceil((due - now) / 86400000) : null;
    if (days !== null && days < 1) continue;
    if (o.setAsideCode && !eligible.has(o.setAsideCode)) continue; // reserved for someone else
    let ease = 40;
    const why = [];
    if (/combined synopsis/i.test(o.type || '')) { ease += 20; why.push('Quick RFQ (combined synopsis/solicitation)'); }
    if (o.setAsideCode) { ease += 20; why.push(`${o.setAside || 'Small business'} set-aside you qualify for`); }
    else { ease -= 10; why.push('Open to everyone, so expect more bidders'); }
    if (o.state && (home.text.includes(` ${o.state}`) || home.text.includes(`, ${o.state}`))) { ease += 15; why.push(`In your state (${o.state})`); }
    else if (o.state && !home.nationwide) { ease -= 5; why.push(`Out of state (${o.state})`); }
    if (days !== null) {
      if (days < 4) { ease -= 20; why.push(`Only ${days} day${days === 1 ? '' : 's'} to respond`); }
      else if (days >= 7) { ease += 10; why.push(`${days} days to respond`); }
      else why.push(`${days} days to respond`);
    }
    out.push({ ...o, ease: Math.max(1, Math.min(99, ease)), why, daysLeft: days });
  }
  return out.sort((a, b) => b.ease - a.ease || (a.daysLeft ?? 99) - (b.daysLeft ?? 99));
}

/** Supplies NAICS (manufacturing 31-33, wholesale 42): point at DLA DIBBS, where most small supply buys live. */
const suppliesCodes = (codes) => codes.filter((c) => /^(31|32|33|42)/.test(c));

/**
 * Contracting offices that bought these NAICS codes under the SAT in the last year, by number of
 * small awards. Groups awards by the first six characters of the award ID (the office's
 * DoDAAC-style code for most agencies) and reads one detail record per office for its name.
 */
async function buyers({ codes, state }) {
  const key = `usa:buyers:v1:${codes.join('+')}:${state || 'US'}`;
  return intel.cached(key, 24 * 3600_000, async () => {
    const now = new Date();
    const filters = {
      award_type_codes: ['A', 'B', 'C', 'D'],
      naics_codes: codes,
      time_period: [{ start_date: iso(new Date(now.getTime() - 365 * 86400000)), end_date: iso(now) }],
      award_amounts: [{ lower_bound: 1000, upper_bound: SAT }],
    };
    if (state) filters.place_of_performance_locations = [{ country: 'USA', state }];
    const pages = [];
    for (let page = 1; page <= 2; page += 1) {
      const data = await post(SEARCH, {
        filters,
        fields: ['Award ID', 'Award Amount', 'Awarding Agency', 'Awarding Sub Agency', 'Recipient Name', 'Start Date', 'Place of Performance State Code'],
        limit: 100, page, sort: 'Start Date', order: 'desc',
      });
      pages.push(...(data.results || []));
      if (!(data.page_metadata && data.page_metadata.hasNext)) break;
    }
    const groups = new Map();
    for (const r of pages) {
      const id = String(r['Award ID'] || '').toUpperCase();
      if (id.length < 8) continue;
      const code = id.slice(0, 6);
      if (!groups.has(code)) groups.set(code, { code, agency: r['Awarding Sub Agency'] || r['Awarding Agency'] || '', awards: [], keys: [] });
      const g = groups.get(code);
      g.awards.push({ id, value: Number(r['Award Amount']) || 0, date: String(r['Start Date'] || '').slice(0, 10), winner: String(r['Recipient Name'] || ''), state: r['Place of Performance State Code'] || '' });
      if (r.generated_internal_id) g.keys.push(r.generated_internal_id);
    }
    const top = [...groups.values()].sort((a, b) => b.awards.length - a.awards.length).slice(0, BUYER_DETAILS);
    await Promise.all(top.map(async (g) => {
      const d = g.keys[0] ? await fetchAward(g.keys[0]).catch(() => null) : null;
      g.office = (d && d.awarding_agency && String(d.awarding_agency.office_agency_name || '').replace(/\s+/g, ' ').trim()) || '';
      g.city = (d && d.place_of_performance && d.place_of_performance.city_name) || '';
    }));
    return {
      sat: SAT,
      sampled: pages.length,
      offices: top.map((g) => {
        const values = g.awards.map((a) => a.value);
        return {
          code: g.code,
          office: g.office || g.code,
          agency: g.agency,
          city: g.city,
          awards: g.awards.length,
          total: Math.round(values.reduce((s, v) => s + v, 0)),
          median: Math.round(median(values)),
          last: g.awards[0].date,
          recentWinners: [...new Set(g.awards.map((a) => a.winner))].slice(0, 3),
        };
      }),
    };
  });
}

module.exports = { rankEasy, buyers, suppliesCodes, SAT };
