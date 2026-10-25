'use strict';

/**
 * SAM.gov lookups for Sub-Safe vetting: entity registration (Entity Management API v4) and
 * federal exclusions / debarments (Exclusions API v4). Needs SAM_API_KEY from a SAM.gov account
 * (Workspace -> Public API Key). A public key with no SAM.gov role is limited to 10 calls a day;
 * one with a role gets 1,000.
 */

// SAM_API_BASE_URL only exists so tests can point at a local stand-in.
const ORIGIN = (process.env.SAM_API_BASE_URL || 'https://api.sam.gov').replace(/\/$/, '');
const BASE = `${ORIGIN}/entity-information/v4`;
const OPPORTUNITIES = `${ORIGIN}/opportunities/v2/search`;
const UEI_RE = /^[A-Z0-9]{12}$/;

const enabled = () => Boolean(process.env.SAM_API_KEY);

class SamError extends Error {
  constructor(message, userMessage) { super(message); this.userMessage = userMessage; }
}

/** apiKey: a member's own key (Autopilot); defaults to the platform key. */
async function get(path, params, apiKey = process.env.SAM_API_KEY) {
  const url = new URL(/^https?:\/\//.test(path) ? path : `${BASE}/${path}`);
  url.searchParams.set('api_key', apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 429) throw new SamError('SAM.gov 429', 'SAM.gov lookup limit reached for today. Try again tomorrow.');
  if (res.status === 401 || res.status === 403) throw new SamError(`SAM.gov ${res.status}`, 'SAM.gov did not accept the API key. Check it in SAM.gov under Account Details.');
  if (res.status === 404) return {};
  if (!res.ok) throw new SamError(`SAM.gov ${path} -> ${res.status}`);
  return res.json();
}

const isActiveExclusion = (actions) => {
  const list = (actions && actions.listOfActions) || [];
  if (!list.length) return true;
  return list.some((a) => {
    const t = a.terminationDate;
    if (!t || /indefinite/i.test(t)) return true;
    const d = Date.parse(t);
    return Number.isNaN(d) || d > Date.now();
  });
};

/**
 * @param {string} query legal business name or UEI
 * @returns {Promise<{verdict: 'clear'|'excluded'|'not_registered'|'review', entities: object[], exclusions: object[], checkedAt: string, by: string}>}
 */
async function vet(query) {
  const uei = query.toUpperCase().replace(/\s/g, '');
  const byUei = UEI_RE.test(uei);
  const [entityRes, exclusionRes] = await Promise.all([
    get('entities', byUei ? { ueiSAM: uei, includeSections: 'entityRegistration,coreData' } : { legalBusinessName: query, includeSections: 'entityRegistration,coreData' }),
    get('exclusions', byUei ? { ueiSAM: uei } : { exclusionName: query }),
  ]);

  const entities = (entityRes.entityData || []).slice(0, 8).map((e) => {
    const r = e.entityRegistration || {};
    const a = (e.coreData && e.coreData.physicalAddress) || {};
    return {
      name: r.legalBusinessName,
      uei: r.ueiSAM,
      cage: r.cageCode,
      status: r.registrationStatus,
      expires: r.registrationExpirationDate,
      exclusionFlag: r.exclusionStatusFlag,
      location: [a.city, a.stateOrProvinceCode].filter(Boolean).join(', '),
    };
  });
  const exclusions = (exclusionRes.excludedEntity || []).slice(0, 15).map((x) => {
    const id = x.exclusionIdentification || {};
    const d = x.exclusionDetails || {};
    const acts = (x.exclusionActions && x.exclusionActions.listOfActions) || [];
    return {
      name: id.entityName || [id.firstName, id.lastName].filter(Boolean).join(' '),
      uei: id.ueiSAM,
      type: d.exclusionType,
      program: d.exclusionProgram,
      agency: d.excludingAgencyName,
      activeDate: acts[0] && acts[0].activateDate,
      terminationDate: acts[0] && acts[0].terminationDate,
      active: isActiveExclusion(x.exclusionActions),
    };
  });

  let verdict;
  if (exclusions.some((x) => x.active) || entities.some((e) => e.exclusionFlag === 'Y')) verdict = 'excluded';
  else if (entities.length === 1 && /^a/i.test(entities[0].status || '')) verdict = 'clear';
  else if (entities.length === 0) verdict = 'not_registered';
  else verdict = 'review';

  return { verdict, by: byUei ? 'uei' : 'name', entities, exclusions, totalEntities: entityRes.totalRecords || entities.length, checkedAt: new Date().toISOString() };
}

const mmddyyyy = (d) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`;

/**
 * Open solicitations posted in the last `days` days for one NAICS code (Predictive Bid Matchmaker).
 * Notice types: o solicitation, k combined synopsis/solicitation, p presolicitation, r sources sought.
 */
async function searchOpportunities(naics, days = 30, { apiKey, types = 'o,k,p,r' } = {}) {
  const to = new Date();
  const from = new Date(Date.now() - days * 86400000);
  const data = await get(OPPORTUNITIES, {
    postedFrom: mmddyyyy(from), postedTo: mmddyyyy(to), ncode: naics, ptype: types, limit: '100', offset: '0',
  }, apiKey);
  return (data.opportunitiesData || []).filter((o) => o.active !== 'No').map((o) => {
    const pop = o.placeOfPerformance || {};
    const poc = (o.pointOfContact || [])[0] || {};
    return {
      noticeId: o.noticeId,
      title: o.title,
      solicitationNumber: o.solicitationNumber,
      agency: [...new Set((o.fullParentPathName || '').split('.').slice(0, 2))].join(' / '),
      office: (o.fullParentPathName || '').split('.').slice(-1)[0],
      type: o.type,
      postedDate: o.postedDate,
      responseDeadline: o.responseDeadLine,
      naics: o.naicsCode,
      setAside: o.typeOfSetAsideDescription || '',
      setAsideCode: o.typeOfSetAside || '',
      state: (pop.state && pop.state.code) || '',
      city: (pop.city && pop.city.name) || '',
      contact: [poc.fullName, poc.email].filter(Boolean).join(', '),
      url: o.uiLink || `https://sam.gov/opp/${o.noticeId}/view`,
      descriptionUrl: /^https:\/\//.test(o.description || '') ? o.description : '',
      resourceLinks: (o.resourceLinks || []).filter((l) => /^https:\/\//.test(l)).slice(0, 10),
    };
  });
}

/** Active SAM.gov registrants for a NAICS code in one state (Smart Vendor Scraper). One page of 10. */
async function searchEntities({ naics, state }, apiKey) {
  const data = await get('entities', {
    naicsCode: naics,
    physicalAddressProvinceOrStateCode: state,
    registrationStatus: 'A',
    includeSections: 'entityRegistration,coreData,pointsOfContact',
    page: '0',
    size: '10',
  }, apiKey);
  return {
    total: data.totalRecords || 0,
    entities: (data.entityData || []).map((e) => {
      const r = e.entityRegistration || {};
      const c = e.coreData || {};
      const a = c.physicalAddress || {};
      const poc = (e.pointsOfContact && (e.pointsOfContact.governmentBusinessPOC || e.pointsOfContact.electronicBusinessPOC)) || {};
      return {
        company: r.legalBusinessName,
        dba: r.dbaName || '',
        uei: r.ueiSAM,
        cage: r.cageCode,
        expires: r.registrationExpirationDate,
        location: [a.city, a.stateOrProvinceCode].filter(Boolean).join(', '),
        website: (c.entityInformation && c.entityInformation.entityURL) || '',
        contactName: [poc.firstName, poc.lastName].filter(Boolean).join(' '),
        contactTitle: poc.title || '',
        email: poc.email || '',
        phone: poc.USPhone || '',
      };
    }),
  };
}

/** The full notice text behind an opportunity's description link (needs an API key). */
async function noticeDescription(descriptionUrl, apiKey) {
  if (!descriptionUrl) return '';
  const url = new URL(descriptionUrl);
  if (!/(^|\.)sam\.gov$/.test(url.hostname) && !process.env.SAM_API_BASE_URL) return '';
  const data = await get(url.toString(), {}, apiKey).catch(() => ({}));
  const html = String(data.description || '');
  return html.replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim().slice(0, 200_000);
}

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/**
 * Downloads one solicitation attachment from SAM.gov (public files). Returns
 * { name, bytes } or null when it is missing, too big or not a PDF or Word file.
 */
async function downloadAttachment(link) {
  const url = new URL(link);
  if (!/(^|\.)sam\.gov$/.test(url.hostname) && !process.env.SAM_API_BASE_URL) return null;
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!res || !res.ok) return null;
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_ATTACHMENT_BYTES) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_ATTACHMENT_BYTES) return null;
  const cd = res.headers.get('content-disposition') || '';
  const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const name = decodeURIComponent((m && m[1]) || url.pathname.split('/').pop() || 'attachment').slice(0, 200);
  const isPdf = bytes.subarray(0, 5).toString('latin1') === '%PDF-';
  const isDocx = bytes.subarray(0, 2).toString('latin1') === 'PK' && /\.docx$/i.test(name);
  if (!isPdf && !isDocx) return null;
  return { name, bytes, kind: isPdf ? 'pdf' : 'docx' };
}

module.exports = { enabled, vet, searchOpportunities, searchEntities, noticeDescription, downloadAttachment, SamError };
