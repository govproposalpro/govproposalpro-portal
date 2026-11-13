'use strict';

/**
 * Competition X-Ray: who won this kind of work before, for how much, against how many bidders,
 * and whether it went to small businesses. Answers "can I actually win this?" before a member
 * spends a proposal on it. Data: USAspending.gov (free, no key): one award search plus the detail
 * record (number of offers, competition, set-aside) of the largest recent awards. Cached a day.
 */

const { cached } = require('./intel');
const { keywordsOf } = require('./market');

const ORIGIN = (process.env.USASPENDING_API_BASE_URL || 'https://api.usaspending.gov').replace(/\/$/, '');
const SEARCH = `${ORIGIN}/api/v2/search/spending_by_award/`;
const FIELDS = ['Award ID', 'Recipient Name', 'Recipient UEI', 'Award Amount', 'Start Date', 'End Date', 'Awarding Agency',
  'Awarding Sub Agency', 'Place of Performance State Code', 'Description'];
const LOOKBACK_YEARS = 5;
const DETAILS = 12; // detail lookups per X-Ray (number of offers, set-aside, competition)

const iso = (d) => d.toISOString().slice(0, 10);
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`USAspending -> ${res.status}`);
  return res.json();
}

async function fetchAward(id) {
  const res = await fetch(`${ORIGIN}/api/v2/awards/${encodeURIComponent(id)}/`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  return res.ok ? res.json() : null;
}

function contractFacts(d) {
  const c = (d && d.latest_transaction_contract_data) || {};
  const offers = Number.parseInt(c.number_of_offers_received, 10);
  return {
    offers: Number.isFinite(offers) && offers > 0 ? offers : null,
    competition: String(c.extent_competed_description || ''),
    setAside: String(c.type_set_aside_description || ''),
    pricing: String(c.type_of_contract_pricing_description || ''),
  };
}

/**
 * Offers, competition and set-aside for one award. Task and delivery orders usually leave offers and
 * set-aside blank, because they were recorded on the parent contract vehicle, so fall back to the parent
 * (memoised per scan, since many orders share one vehicle).
 */
async function detail(id, parents) {
  const d = await fetchAward(id);
  if (!d) return null;
  const facts = contractFacts(d);
  const parentId = d.parent_award && d.parent_award.generated_unique_award_id;
  if (parentId && (facts.offers == null || !facts.setAside)) {
    if (!parents.has(parentId)) parents.set(parentId, fetchAward(parentId).then(contractFacts).catch(() => null));
    const p = await parents.get(parentId);
    if (p) {
      if (facts.offers == null) facts.offers = p.offers;
      if (!facts.setAside) facts.setAside = p.setAside;
      if (!facts.competition) facts.competition = p.competition;
    }
  }
  facts.smallBusiness = d.recipient && Array.isArray(d.recipient.business_categories)
    ? d.recipient.business_categories.some((b) => /small business/i.test(b)) : null;
  return facts;
}

const clean = (v, max) => String(v || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);

/** Normalised search inputs (also the cache key). */
function inputs({ naics, agency, keywords, state }) {
  const code = (String(naics || '').match(/\b\d{6}\b/) || [])[0] || '';
  const words = keywordsOf(clean(keywords, 200)).slice(0, 3);
  const st = /^[A-Z]{2}$/.test(String(state || '').toUpperCase()) ? String(state).toUpperCase() : '';
  return { naics: code, agency: clean(agency, 120), keywords: words, state: st };
}

async function scan({ naics, agency, keywords, state }) {
  const now = new Date();
  const from = new Date(now); from.setUTCFullYear(from.getUTCFullYear() - LOOKBACK_YEARS);
  const filters = {
    award_type_codes: ['A', 'B', 'C', 'D'],
    time_period: [{ start_date: iso(from), end_date: iso(now) }],
  };
  if (naics) filters.naics_codes = [naics];
  if (keywords.length) filters.keywords = keywords;
  if (agency) filters.agencies = [{ type: 'awarding', tier: 'toptier', name: agency }];
  if (state) filters.place_of_performance_locations = [{ country: 'USA', state }];

  let data = await post(SEARCH, { filters, fields: FIELDS, limit: 100, page: 1, sort: 'Start Date', order: 'desc' });
  let agencyMatched = Boolean(agency);
  // The agency name often doesn't match USAspending's top-tier name exactly; fall back to all agencies.
  if (agency && !(data.results || []).length) {
    delete filters.agencies;
    agencyMatched = false;
    data = await post(SEARCH, { filters, fields: FIELDS, limit: 100, page: 1, sort: 'Start Date', order: 'desc' });
  }
  const awards = (data.results || []).map((r) => ({
    id: String(r['Award ID'] || ''),
    key: String(r.generated_internal_id || ''),
    winner: String(r['Recipient Name'] || ''),
    winnerUei: String(r['Recipient UEI'] || ''),
    value: Math.round(Number(r['Award Amount']) || 0),
    start: String(r['Start Date'] || '').slice(0, 10),
    end: String(r['End Date'] || '').slice(0, 10),
    agency: String(r['Awarding Sub Agency'] || r['Awarding Agency'] || ''),
    state: String(r['Place of Performance State Code'] || ''),
    description: String(r.Description || '').slice(0, 200),
    url: r.generated_internal_id ? `https://www.usaspending.gov/award/${encodeURIComponent(r.generated_internal_id)}` : '',
  })).filter((a) => a.value > 0);

  // Detail records for the most recent awards: offers received, competition, set-aside.
  const sample = awards.slice(0, DETAILS);
  const parents = new Map();
  const details = await Promise.all(sample.map((a) => (a.key ? detail(a.key, parents).catch(() => null) : null)));
  sample.forEach((a, i) => Object.assign(a, details[i] || {}));
  return { awards, agencyMatched, fetchedAt: now.toISOString() };
}

/** Plain-English read of the numbers, aimed at a newer contractor. */
function verdictOf(s) {
  if (!s.count) return { level: 'unknown', headline: 'No past awards found', advice: 'Nothing matched in the last five years. Try fewer keywords, a different NAICS code or no state. New work with no incumbent can be a real opening.' };
  const parts = [];
  let points = 0;
  if (s.avgOffers !== null) {
    if (s.avgOffers <= 3) { points += 2; parts.push(`only ${s.avgOffers} offer${s.avgOffers === 1 ? '' : 's'} on average`); }
    else if (s.avgOffers <= 6) { points += 1; parts.push(`about ${s.avgOffers} offers each time`); }
    else parts.push(`${s.avgOffers} offers on average, which is crowded`);
  }
  if (s.smallBusinessShare !== null) {
    if (s.smallBusinessShare >= 60) { points += 1; parts.push(`${s.smallBusinessShare}% went to small businesses`); }
    else parts.push(`only ${s.smallBusinessShare}% went to small businesses`);
  }
  if (s.topWinnerShare >= 50) { points -= 1; parts.push(`one company holds ${s.topWinnerShare}% of the dollars`); }
  else { points += 1; parts.push('no single company dominates'); }
  const level = points >= 3 ? 'good' : points >= 1 ? 'fair' : 'tough';
  const headline = { good: 'Winnable: low competition', fair: 'Competitive but open', tough: 'Tough: crowded or locked up' }[level];
  const advice = {
    good: 'Few bidders and small businesses win here. Price close to the typical award and submit a complete, compliant package.',
    fair: 'You can compete. Study the incumbent and the typical award value, then lead with a specific, local, well-priced offer.',
    tough: 'Expect strong competition or an entrenched incumbent. Consider teaming, a subcontract role, or smaller awards in this area first.',
  }[level];
  return { level, headline, advice: `${parts.join(', ')}. ${advice}` };
}

function summarize(awards) {
  const values = awards.map((a) => a.value);
  const total = values.reduce((s, v) => s + v, 0);
  const byWinner = new Map();
  for (const a of awards) {
    const k = a.winnerUei || a.winner;
    const w = byWinner.get(k) || { name: a.winner, uei: a.winnerUei, awards: 0, value: 0, last: '' };
    w.awards += 1; w.value += a.value; if (a.start > w.last) w.last = a.start;
    byWinner.set(k, w);
  }
  const winners = [...byWinner.values()].sort((a, b) => b.value - a.value);
  const offers = awards.map((a) => a.offers).filter((n) => Number.isFinite(n));
  const sb = awards.filter((a) => typeof a.smallBusiness === 'boolean');
  const setAsides = awards.filter((a) => a.setAside && !/NO SET ASIDE/i.test(a.setAside));
  const competed = awards.filter((a) => a.competition);
  const s = {
    count: awards.length,
    totalValue: total,
    medianValue: Math.round(median(values)),
    distinctWinners: winners.length,
    topWinnerShare: total ? Math.round((winners[0].value / total) * 100) : 0,
    avgOffers: offers.length ? Math.round((offers.reduce((a, b) => a + b, 0) / offers.length) * 10) / 10 : null,
    soleSourceShare: competed.length ? Math.round((competed.filter((a) => /NOT AVAILABLE|NOT COMPETED/i.test(a.competition)).length / competed.length) * 100) : null,
    smallBusinessShare: sb.length ? Math.round((sb.filter((a) => a.smallBusiness).length / sb.length) * 100) : null,
    setAsideShare: competed.length ? Math.round((setAsides.length / competed.length) * 100) : null,
    sampled: offers.length,
  };
  return { stats: s, winners: winners.slice(0, 8), verdict: verdictOf(s) };
}

/** Runs (or reuses) an X-Ray. Throws when USAspending is down. */
async function xray(raw) {
  const q = inputs(raw);
  if (!q.naics && !q.keywords.length) {
    const err = new Error('need naics or keywords'); err.userMessage = 'Enter a NAICS code or a few keywords.'; throw err;
  }
  const key = `usa:xray:v2:${q.naics}:${q.agency.toLowerCase()}:${q.keywords.join('+').toLowerCase()}:${q.state}`;
  const data = await cached(key, 24 * 3600_000, () => scan(q));
  return { query: q, agencyMatched: data.agencyMatched, ...summarize(data.awards), awards: data.awards.slice(0, 40), fetchedAt: data.fetchedAt };
}

module.exports = { xray, inputs, summarize, verdictOf, post, fetchAward, median, ORIGIN };
