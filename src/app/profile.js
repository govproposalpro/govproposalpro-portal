'use strict';

/**
 * The member's business profile: what the onboarding wizard collects and every AI feature reads.
 * One parser serves the member's own edits and admin edits so both follow the same rules.
 */

const { PROFILE_OPTIONS } = require('../validation');

const EMPLOYEES = ['1', '2-10', '11-50', '51-200', '201+'];
const PP_ROLES = ['prime', 'sub', 'commercial'];

const clean = (v, max) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max) : '';

function publicProfile(u) {
  return {
    email: u.email,
    fullName: u.full_name,
    phone: u.phone,
    businessName: u.business_name,
    naics: u.naics,
    capabilities: u.capabilities,
    certifications: u.certifications ? u.certifications.split(',').filter(Boolean) : [],
    samStatus: u.sam_status,
    experienceLevel: u.experience_level,
    uei: u.uei,
    cageCode: u.cage_code,
    samExpiresOn: u.sam_expires_on ? new Date(u.sam_expires_on).toISOString().slice(0, 10) : null,
    website: u.website,
    address: u.address,
    yearFounded: u.year_founded,
    employees: u.employees,
    serviceArea: u.service_area,
    differentiators: u.differentiators,
    keyPersonnel: u.key_personnel,
    pastPerformance: u.past_performance || [],
    onboarded: Boolean(u.onboarded_at),
    samChecklist: u.sam_checklist || {},
    emailAlerts: u.email_alerts !== false,
  };
}

// Column name for each editable field, with its parser. A parser returns undefined (skip),
// a value, or throws a user-facing message.
const FIELDS = {
  fullName: ['full_name', (v) => clean(v, 120) || null],
  phone: ['phone', (v) => clean(v, 30) || null],
  businessName: ['business_name', (v) => clean(v, 160) || null],
  naics: ['naics', (v) => clean(v, 200) || null],
  capabilities: ['capabilities', (v) => clean(v, 4000) || null],
  website: ['website', (v) => clean(v, 200) || null],
  address: ['address', (v) => clean(v, 300) || null],
  serviceArea: ['service_area', (v) => clean(v, 300) || null],
  differentiators: ['differentiators', (v) => clean(v, 2000) || null],
  keyPersonnel: ['key_personnel', (v) => clean(v, 4000) || null],
  uei: ['uei', (v) => {
    const s = clean(v, 20).toUpperCase().replace(/\s/g, '');
    if (s && !/^[A-Z0-9]{12}$/.test(s)) throw new Error('A UEI is exactly 12 letters and numbers.');
    return s || null;
  }],
  cageCode: ['cage_code', (v) => {
    const s = clean(v, 10).toUpperCase().replace(/\s/g, '');
    if (s && !/^[A-Z0-9]{5}$/.test(s)) throw new Error('A CAGE code is exactly 5 letters and numbers.');
    return s || null;
  }],
  samExpiresOn: ['sam_expires_on', (v) => {
    if (!v) return null;
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new Error('Enter a valid SAM expiration date.');
    return v;
  }],
  yearFounded: ['year_founded', (v) => {
    if (v === '' || v === null) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1800 || n > new Date().getFullYear()) throw new Error('Enter the year your business started.');
    return n;
  }],
  employees: ['employees', (v) => {
    if (!v) return null;
    if (!EMPLOYEES.includes(v)) throw new Error('Choose an employee range.');
    return v;
  }],
  samStatus: ['sam_status', (v) => {
    if (!v) return null;
    if (!Object.prototype.hasOwnProperty.call(PROFILE_OPTIONS.samStatus, v)) throw new Error('Choose your SAM.gov status.');
    return v;
  }],
  certifications: ['certifications', (v) => {
    if (!Array.isArray(v) || v.length > 6 || v.some((c) => !Object.prototype.hasOwnProperty.call(PROFILE_OPTIONS.certifications, c))) {
      throw new Error('Choose certifications from the list.');
    }
    return [...new Set(v)].join(',');
  }],
  pastPerformance: ['past_performance', (v) => {
    if (!Array.isArray(v) || v.length > 25) throw new Error('Add up to 25 past performance entries.');
    const out = v.map((p) => ({
      title: clean(p && p.title, 200),
      customer: clean(p && p.customer, 200),
      value: clean(p && p.value, 60),
      period: clean(p && p.period, 80),
      role: PP_ROLES.includes(p && p.role) ? p.role : 'prime',
      description: clean(p && p.description, 2000),
    })).filter((p) => p.title || p.description);
    return JSON.stringify(out);
  }],
};

/** @returns {{ sets: string[], values: any[] }} SQL fragments for an UPDATE "Users", params from $2. */
function parseProfileUpdate(body) {
  const b = body && typeof body === 'object' ? body : {};
  const sets = [];
  const values = [];
  for (const [key, [column, parse]] of Object.entries(FIELDS)) {
    if (b[key] === undefined) continue;
    values.push(parse(b[key]));
    sets.push(`${column} = $${values.length + 1}${column === 'past_performance' ? '::jsonb' : ''}`);
  }
  return { sets, values };
}

/** What the AI sees about the member's company. Empty fields are left out. */
function aiProfile(u) {
  const p = publicProfile(u);
  const label = (group, v) => (v ? PROFILE_OPTIONS[group][v] || v : undefined);
  const out = {
    company: p.businessName,
    owner: p.fullName,
    website: p.website,
    address: p.address,
    uei: p.uei,
    cage_code: p.cageCode,
    sam_registration: label('samStatus', p.samStatus),
    year_founded: p.yearFounded,
    employees: p.employees,
    service_area: p.serviceArea,
    naics_codes: p.naics,
    certifications: p.certifications.map((c) => label('certifications', c)).join(', ') || undefined,
    capabilities: p.capabilities,
    differentiators: p.differentiators,
    key_personnel: p.keyPersonnel,
    past_performance: p.pastPerformance.length ? p.pastPerformance : undefined,
    experience: label('experienceLevel', p.experienceLevel),
  };
  for (const k of Object.keys(out)) if (out[k] === undefined || out[k] === null || out[k] === '') delete out[k];
  return out;
}

module.exports = { publicProfile, parseProfileUpdate, aiProfile, EMPLOYEES };
