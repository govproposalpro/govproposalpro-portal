'use strict';

/**
 * Single source of truth for what each tier can do. The server enforces it (requireFeature,
 * monthly caps) and /api/me sends it to the dashboard so the UI shows the same locks.
 */

const TIERS = {
  core: { label: 'Core Edition', monthlyProposals: 10 },
  enterprise: { label: 'Enterprise Edition', monthlyProposals: 50 },
};

// status: 'live' (built), 'soon' (shown in the nav, not built yet). Order is the nav order.
const BOTH = ['core', 'enterprise'];
const ENT = ['enterprise'];
const FEATURES = [
  { key: 'autopilot', name: 'GovCon Autopilot', tiers: ENT, status: 'live' },
  { key: 'proposal_engine', name: 'AI Proposal Engine', tiers: BOTH, status: 'live' },
  { key: 'bid_decryptor', name: 'AI Bid Decryptor', tiers: BOTH, status: 'live' },
  { key: 'go_no_go', name: 'Go/No-Go Indicator', tiers: BOTH, status: 'live' },
  { key: 'bid_crm', name: 'Visual Bid CRM', tiers: BOTH, status: 'live' },
  { key: 'bid_matchmaker', name: 'Predictive Bid Matchmaker', tiers: ENT, status: 'live' },
  { key: 'vendor_scraper', name: 'Smart Vendor Scraper', tiers: BOTH, status: 'live' },
  { key: 'outreach', name: '1-Click Outreach Sequences', tiers: BOTH, status: 'live' },
  { key: 'foia', name: 'FOIA Automator', tiers: BOTH, status: 'live' },
  { key: 'pricing_matrix', name: 'Profit Pricing Matrix', tiers: BOTH, status: 'live' },
  { key: 'teaming_legal', name: 'Auto-Teaming Legal Engine', tiers: ENT, status: 'live' },
  { key: 'section_m', name: 'Section M Compliance Grader', tiers: ENT, status: 'live' },
  { key: 'rfi_ghostwriter', name: 'RFI Ghostwriter', tiers: ENT, status: 'live' },
  { key: 'milestones', name: 'Post-Award Milestone Tracker', tiers: BOTH, status: 'live' },
  { key: 'invoicing', name: 'Simplified Invoicing Engine', tiers: BOTH, status: 'live' },
  { key: 'capability_statement', name: 'Capability Statement Generator', tiers: BOTH, status: 'live' },
  { key: 'past_performance', name: 'Past Performance Portfolio Builder', tiers: ENT, status: 'live' },
  { key: 'winning_voice', name: 'Past Performance RAG (Winning Voice)', tiers: ENT, status: 'live' },
  { key: 'cmmc_checklist', name: 'CMMC Level 1 Readiness', tiers: BOTH, status: 'live' },
  { key: 'compliance_pulse', name: 'Live Compliance Pulse', tiers: ENT, status: 'live' },
  { key: 'subcontracting_check', name: 'Subcontracting Limits Checker', tiers: BOTH, status: 'live' },
  { key: 'sam_checklist', name: 'SAM.gov Registration Checklist', tiers: BOTH, status: 'live' },
  { key: 'sub_vetting', name: 'Sub-Safe SAM.gov Vetting', tiers: ENT, status: 'live' },
  { key: 'state_directory', name: 'Per-State Directory', tiers: ENT, status: 'live' },
  { key: 'deadline_alerts', name: 'Deadline Alerts', tiers: BOTH, status: 'live' },
];

// Shared tools that do more on Enterprise (checked inside the feature, not by the nav).
const ENTERPRISE_EXTRAS = ['places_vendors', 'pricing_fringe_ga'];

function normalizeTier(tier) {
  return tier === 'enterprise' ? 'enterprise' : 'core';
}

function hasFeature(tier, key) {
  if (ENTERPRISE_EXTRAS.includes(key)) return normalizeTier(tier) === 'enterprise';
  const feature = FEATURES.find((f) => f.key === key);
  return Boolean(feature && feature.tiers.includes(normalizeTier(tier)));
}

function featuresFor(tier) {
  const t = normalizeTier(tier);
  return FEATURES.map((f) => ({ key: f.key, name: f.name, status: f.status, unlocked: f.tiers.includes(t) }));
}

module.exports = { TIERS, FEATURES, normalizeTier, hasFeature, featuresFor };
