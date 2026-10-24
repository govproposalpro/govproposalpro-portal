'use strict';

/**
 * Public data behind the Enterprise intelligence tools: Live Compliance Pulse (Federal Register),
 * Predictive Bid Matchmaker scoring (SAM.gov opportunities) and top-rated local subcontractors
 * (Google Places, optional). SAM.gov and Federal Register results are cached in cache_entries so
 * members share one lookup; Google results are not stored, per Google's terms.
 */

const db = require('../db');
const sam = require('./sam');

/** Returns cached data younger than maxAgeMs, else calls load() and caches what it returns. */
async function cached(key, maxAgeMs, load) {
  const hit = await db.query('SELECT data, fetched_at FROM cache_entries WHERE key = $1', [key]);
  if (hit.rows[0] && Date.now() - new Date(hit.rows[0].fetched_at).getTime() < maxAgeMs) return hit.rows[0].data;
  try {
    const data = await load();
    await db.query(
      `INSERT INTO cache_entries (key, data, fetched_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, fetched_at = now()`,
      [key, JSON.stringify(data)]
    );
    return data;
  } catch (err) {
    // A stale copy beats an error when the source is down or over quota.
    if (hit.rows[0]) return hit.rows[0].data;
    throw err;
  }
}

// ---------------------------------------------------------------- Live Compliance Pulse

/** Which regulation a 48 CFR part belongs to. */
function regulationOf(part) {
  const n = Number.parseInt(part, 10);
  if (!Number.isFinite(n)) return 'Acquisition regulation';
  if (n < 100) return 'FAR';
  if (n >= 200 && n < 300) return 'DFARS';
  if (n >= 500 && n < 600) return 'GSAR';
  if (n >= 800 && n < 900) return 'VAAR';
  if (n >= 1800 && n < 1900) return 'NASA FAR Supplement';
  if (n >= 3000 && n < 3100) return 'HSAR';
  return 'Agency supplement';
}

// The 2026 rules every bidder has to know, pinned above the live feed.
const PINNED = [
  {
    title: 'CMMC Phase 2 starts November 10, 2026',
    body: 'Since November 10, 2025 (Phase 1), DoD solicitations can require a CMMC Level 1 or Level 2 self-assessment posted in SPRS before award (DFARS 252.204-7021). From November 10, 2026, many contracts handling CUI will require a Level 2 certification from a C3PAO instead.',
    url: 'https://dodcio.defense.gov/cmmc/About/',
    tag: 'DFARS',
  },
  {
    title: 'Buy American: 65% domestic content until 2029',
    body: 'Under FAR 25.101, a manufactured end product counts as domestic only when the cost of its domestic components exceeds 65% (deliveries in 2024 through 2028), rising to 75% from 2029. Check every supply quote against it.',
    url: 'https://www.acquisition.gov/far/25.101',
    tag: 'FAR',
  },
  {
    title: 'The FAR is being rewritten (Executive Order 14275)',
    body: 'The Revolutionary FAR Overhaul is replacing the FAR part by part with streamlined text, first as agency class deviations and then formal rules. Always follow the clause numbers and dates in the solicitation itself.',
    url: 'https://www.acquisition.gov/far-overhaul',
    tag: 'FAR',
  },
  {
    title: 'Basic safeguarding: FAR 52.204-21',
    body: 'Any contract that touches Federal Contract Information includes these 15 basic cybersecurity requirements. Work through the CMMC Level 1 Readiness checklist to confirm you meet them.',
    url: 'https://www.acquisition.gov/far/52.204-21',
    tag: 'FAR',
  },
];

async function compliancePulse() {
  const feed = await cached('fedreg:48cfr', 3 * 3600_000, async () => {
    const url = new URL('https://www.federalregister.gov/api/v1/documents.json');
    const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
    url.searchParams.set('per_page', '40');
    url.searchParams.set('order', 'newest');
    url.searchParams.set('conditions[cfr][title]', '48');
    url.searchParams.set('conditions[publication_date][gte]', since);
    url.searchParams.append('conditions[type][]', 'RULE');
    url.searchParams.append('conditions[type][]', 'PRORULE');
    for (const f of ['title', 'publication_date', 'html_url', 'agencies', 'type', 'abstract', 'effective_on', 'comments_close_on', 'cfr_references']) {
      url.searchParams.append('fields[]', f);
    }
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Federal Register -> ${res.status}`);
    const data = await res.json();
    return (data.results || []).map((d) => {
      const parts = (d.cfr_references || []).map((c) => c.part).filter(Boolean);
      return {
        title: d.title,
        type: d.type,
        published: d.publication_date,
        effective: d.effective_on,
        commentsClose: d.comments_close_on,
        agencies: (d.agencies || []).map((a) => a.name).filter(Boolean),
        regulation: regulationOf(parts[0]),
        parts: [...new Set(parts)].slice(0, 6),
        abstract: (d.abstract || '').slice(0, 700),
        url: d.html_url,
      };
    });
  });
  return { pinned: PINNED, feed };
}

// ---------------------------------------------------------------- Predictive Bid Matchmaker

const SET_ASIDE_FOR_CERT = {
  sdvosb: ['SDVOSBC', 'SDVOSBS'],
  vosb: ['VSA', 'VSS'],
  wosb: ['WOSB', 'WOSBSS', 'EDWOSB', 'EDWOSBSS'],
  hubzone: ['HZC', 'HZS'],
  '8a': ['8A', '8AN'],
};
const SMALL_BUSINESS = ['SBA', 'SBP'];

const naicsList = (s) => [...new Set(String(s || '').match(/\b\d{6}\b/g) || [])].slice(0, 5);

/**
 * Open opportunities for the member's NAICS codes, scored by how likely they are to win them:
 * exact NAICS, a set-aside they qualify for, where the work is, and time left to respond.
 */
async function matchOpportunities(user) {
  const codes = naicsList(user.naics);
  if (!codes.length) return { codes, matches: [], needsNaics: true };
  const lists = await Promise.all(codes.map((code) => cached(`sam:opps:${code}`, 6 * 3600_000, () => sam.searchOpportunities(code))));
  const certs = String(user.certifications || '').split(',').filter(Boolean);
  const eligible = new Set([...SMALL_BUSINESS, ...certs.flatMap((c) => SET_ASIDE_FOR_CERT[c] || [])]);
  const home = String([user.service_area, user.address].join(' ')).toUpperCase();
  const seen = new Set();
  const matches = [];
  for (const o of lists.flat()) {
    if (!o.noticeId || seen.has(o.noticeId)) continue;
    seen.add(o.noticeId);
    const due = o.responseDeadline ? Date.parse(o.responseDeadline) : NaN;
    if (Number.isFinite(due) && due < Date.now()) continue;
    const reasons = [];
    let score = 40;
    if (codes.includes(o.naics)) { score += 20; reasons.push(`Matches your NAICS ${o.naics}`); }
    if (o.setAsideCode && eligible.has(o.setAsideCode)) { score += 20; reasons.push(`${o.setAside} set-aside you qualify for`); }
    else if (o.setAsideCode) { score -= 25; reasons.push(`${o.setAside} set-aside you may not qualify for`); }
    else reasons.push('Full and open competition');
    if (o.state && (home.includes(` ${o.state}`) || home.includes(`, ${o.state}`) || /NATIONWIDE/.test(home))) { score += 10; reasons.push(`In your service area (${o.state})`); }
    if (/sources sought|presolicitation/i.test(o.type || '')) { score -= 5; reasons.push('Early notice: respond to shape the requirement'); }
    if (Number.isFinite(due)) {
      const days = Math.ceil((due - Date.now()) / 86400000);
      if (days < 5) { score -= 10; reasons.push(`Only ${days} day${days === 1 ? '' : 's'} left`); }
      else if (days >= 10) score += 5;
    }
    matches.push({ ...o, score: Math.max(1, Math.min(99, score)), reasons });
  }
  matches.sort((a, b) => b.score - a.score || String(a.responseDeadline).localeCompare(String(b.responseDeadline)));
  return { codes, matches: matches.slice(0, 60) };
}

// ---------------------------------------------------------------- Top-rated local subcontractors (Google Places)

const placesEnabled = () => Boolean(process.env.GOOGLE_PLACES_API_KEY);

async function topRatedPlaces(query) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.businessStatus',
    },
    body: JSON.stringify({ textQuery: query, pageSize: 20 }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Google Places -> ${res.status}`);
  const data = await res.json();
  return (data.places || [])
    .filter((p) => p.businessStatus !== 'CLOSED_PERMANENTLY')
    .map((p) => ({
      company: p.displayName && p.displayName.text,
      location: p.formattedAddress,
      rating: p.rating || null,
      reviews: p.userRatingCount || 0,
      phone: p.nationalPhoneNumber || '',
      website: p.websiteUri || '',
      mapsUrl: p.googleMapsUri || '',
    }))
    // Best first: rating weighted by how many reviews back it up.
    .sort((a, b) => (b.rating || 0) * Math.log10((b.reviews || 0) + 10) - (a.rating || 0) * Math.log10((a.reviews || 0) + 10));
}

module.exports = { cached, compliancePulse, matchOpportunities, placesEnabled, topRatedPlaces, naicsList };
