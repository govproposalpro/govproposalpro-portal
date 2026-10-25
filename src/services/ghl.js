'use strict';

/**
 * GoHighLevel (LeadConnector API v2) integration for new portal signups.
 *
 * On each registration this: upserts the contact with their business profile, adds tags,
 * logs a note, creates a "confirm access" task for the sales team, and sends the branded
 * welcome email from the GHL location. Everything runs through the API, so no GHL workflow
 * is required; tags (gpp-portal-registered, gpp-core / gpp-enterprise) are there to trigger
 * extra automations if wanted.
 *
 * Env: GHL_API_KEY (private integration token), GHL_LOCATION_ID, optional GHL_TASK_ASSIGNEE
 * (GHL user id), optional GHL_EMAIL_FROM ("Name <address>").
 */

const { PROFILE_OPTIONS } = require('../validation');
const { buildWelcomeEmail, buildPurchaseEmail } = require('./email');

// GHL_API_BASE_URL only points tests at a local stand-in.
const BASE = process.env.GHL_API_BASE_URL || 'https://services.leadconnectorhq.com';

function enabled() {
  return Boolean(process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID);
}

async function call(method, path, body, version = '2021-07-28') {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GHL_API_KEY}`,
      Version: version,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(`GHL ${method} ${path.split('?')[0]} -> ${res.status} ${(data.message || text).toString().slice(0, 200)}`);
  return data;
}

const label = (group, value) => (value ? PROFILE_OPTIONS[group][value] || value : '');

function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

function profileSummary({ email, tier, profile }) {
  return [
    `GovProposalPro portal signup (${tier ? tier.toUpperCase() : 'tier unknown'})`,
    `Name: ${profile.fullName}`,
    `Email: ${email}`,
    `Phone: ${profile.phone}`,
    `Business: ${profile.businessName}`,
    `Experience: ${label('experienceLevel', profile.experienceLevel)}`,
    `SAM.gov: ${label('samStatus', profile.samStatus)}`,
    `Revenue: ${label('annualRevenue', profile.annualRevenue) || 'Not shared'}`,
    `Goal: ${label('primaryGoal', profile.primaryGoal)}`,
    `Certifications: ${profile.certifications.map((c) => label('certifications', c)).join(', ') || 'None'}`,
    `NAICS: ${profile.naics || 'Not given'}`,
    `Capabilities: ${profile.capabilities || 'Not given'}`,
  ].join('\n');
}

/**
 * Runs every GHL step for a new signup. Steps are independent: one failing is logged and the
 * rest still run. Returns { contactId, emailed }.
 */
async function onRegistered({ email, tier, profile }) {
  if (!enabled()) throw new Error('GHL_API_KEY / GHL_LOCATION_ID are not set');
  const locationId = process.env.GHL_LOCATION_ID;
  const { firstName, lastName } = splitName(profile.fullName);
  const certs = profile.certifications.map((c) => label('certifications', c)).join(', ');

  const upsert = await call('POST', '/contacts/upsert', {
    locationId,
    email,
    firstName,
    lastName,
    phone: profile.phone,
    companyName: profile.businessName,
    source: 'GovProposalPro Access Portal',
    customFields: [
      { key: 'business_name', field_value: profile.businessName },
      { key: 'gpp_tier', field_value: tier || '' },
      { key: 'gpp_experience_level', field_value: label('experienceLevel', profile.experienceLevel) },
      { key: 'gpp_sam_status', field_value: label('samStatus', profile.samStatus) },
      { key: 'gpp_primary_goal', field_value: label('primaryGoal', profile.primaryGoal) },
      { key: 'gpp_annual_revenue', field_value: label('annualRevenue', profile.annualRevenue) },
      { key: 'gpp_naics_codes', field_value: profile.naics },
      { key: 'certifications', field_value: certs },
      { key: 'capability', field_value: profile.capabilities },
    ],
  });
  const contactId = upsert.contact?.id;
  if (!contactId) throw new Error('GHL upsert returned no contact id');

  const steps = {
    tags: () => call('POST', `/contacts/${contactId}/tags`, {
      tags: ['gpp-portal-registered', 'gpp-confirm-access', tier ? `gpp-${tier}` : 'gpp-tier-unknown'],
    }),
    note: () => call('POST', `/contacts/${contactId}/notes`, { body: profileSummary({ email, tier, profile }) }),
    task: () => call('POST', `/contacts/${contactId}/tasks`, {
      title: `Confirm GovProposalPro access: ${profile.fullName} (${tier || 'tier unknown'})`,
      body: `Call or text ${profile.phone} to confirm access and walk through setup.\n\n${profileSummary({ email, tier, profile })}`,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      completed: false,
      ...(process.env.GHL_TASK_ASSIGNEE ? { assignedTo: process.env.GHL_TASK_ASSIGNEE } : {}),
    }),
  };

  for (const [name, run] of Object.entries(steps)) {
    try { await run(); } catch (err) { console.error(`[ghl] ${name} failed:`, err.message); }
  }

  await sendEmail(contactId, buildWelcomeEmail({ email, tier, firstName }));
  return { contactId, emailed: true };
}

async function sendEmail(contactId, { subject, html }) {
  await call('POST', '/conversations/messages', {
    type: 'Email',
    contactId,
    subject,
    html,
    ...(process.env.GHL_EMAIL_FROM ? { emailFrom: process.env.GHL_EMAIL_FROM } : {}),
  }, '2021-04-15');
}

/**
 * Runs when a GovProposalPro purchase lands on Whop: makes sure the buyer is a GHL contact,
 * tags them, and emails the access link and setup instructions.
 */
async function onPurchased({ email, tier, fullName = '' }) {
  if (!enabled()) throw new Error('GHL_API_KEY / GHL_LOCATION_ID are not set');
  const { firstName, lastName } = splitName(fullName);
  const upsert = await call('POST', '/contacts/upsert', {
    locationId: process.env.GHL_LOCATION_ID,
    email,
    ...(firstName ? { firstName, lastName } : {}),
    source: 'GovProposalPro Whop Purchase',
    customFields: [{ key: 'gpp_tier', field_value: tier || '' }],
  });
  const contactId = upsert.contact?.id;
  if (!contactId) throw new Error('GHL upsert returned no contact id');
  try {
    await call('POST', `/contacts/${contactId}/tags`, { tags: ['gpp-purchased', tier ? `gpp-${tier}` : 'gpp-tier-unknown'] });
  } catch (err) { console.error('[ghl] purchase tags failed:', err.message); }
  await sendEmail(contactId, buildPurchaseEmail({ tier, firstName }));
  return { contactId };
}

/** Makes sure an address is a GHL contact (emails can only go to contacts) and returns its id. */
async function upsertContact({ email, tags = [] }) {
  const upsert = await call('POST', '/contacts/upsert', { locationId: process.env.GHL_LOCATION_ID, email });
  const contactId = upsert.contact?.id;
  if (!contactId) throw new Error('GHL upsert returned no contact id');
  if (tags.length) {
    try { await call('POST', `/contacts/${contactId}/tags`, { tags }); } catch (err) { console.error('[ghl] tags failed:', err.message); }
  }
  return contactId;
}

// GHL tags are free text; keep ad-source tags short and predictable (utm-source-facebook).
const tagPart = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/**
 * Runs when someone opts in on the demo video page: upserts the contact with their phone, tags
 * them gpp-vsl-lead plus the ad source and campaign, and notes where they came from.
 */
async function onLead({ email, firstName, phone, page, utm = {}, clickId, referrer }) {
  if (!enabled()) throw new Error('GHL_API_KEY / GHL_LOCATION_ID are not set');
  const upsert = await call('POST', '/contacts/upsert', {
    locationId: process.env.GHL_LOCATION_ID,
    email,
    firstName,
    phone,
    source: `GovProposalPro VSL${utm.source ? ` (${utm.source})` : ''}`,
  });
  const contactId = upsert.contact?.id;
  if (!contactId) throw new Error('GHL upsert returned no contact id');
  const tags = ['gpp-vsl-lead', `gpp-page-${tagPart(page) || 'watch'}`];
  if (tagPart(utm.source)) tags.push(`utm-source-${tagPart(utm.source)}`);
  if (tagPart(utm.campaign)) tags.push(`utm-campaign-${tagPart(utm.campaign)}`);
  const note = [
    `Opted in on the GovProposalPro demo page (/${page || 'watch'})`,
    `Name: ${firstName}`, `Email: ${email}`, `Phone: ${phone}`,
    `Source: ${utm.source || 'direct'} / ${utm.medium || 'none'}`,
    utm.campaign && `Campaign: ${utm.campaign}`, utm.content && `Ad: ${utm.content}`, utm.term && `Term: ${utm.term}`,
    clickId && `Click id: ${clickId}`, referrer && `Referrer: ${referrer}`,
  ].filter(Boolean).join('\n');
  for (const [name, run] of Object.entries({
    tags: () => call('POST', `/contacts/${contactId}/tags`, { tags }),
    note: () => call('POST', `/contacts/${contactId}/notes`, { body: note }),
  })) {
    try { await run(); } catch (err) { console.error(`[ghl] lead ${name} failed:`, err.message); }
  }
  return { contactId };
}

module.exports = { onRegistered, onPurchased, onLead, enabled, upsertContact, sendEmail };
