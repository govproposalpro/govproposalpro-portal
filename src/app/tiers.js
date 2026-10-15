'use strict';

/**
 * Single source of truth for what each tier can do. The server enforces it (requireFeature,
 * monthly caps) and /api/me sends it to the dashboard so the UI shows the same locks.
 */

const TIERS = {
  core: { label: 'Core Edition', monthlyProposals: 10 },
  enterprise: { label: 'Enterprise Edition', monthlyProposals: 50 },
};

// status: 'live' (built), 'soon' (shown in the nav, not built yet).
const FEATURES = [
  { key: 'proposal_engine', name: 'AI Proposal Engine', tiers: ['core', 'enterprise'], status: 'live' },
  { key: 'bid_decryptor', name: 'AI Bid Decryptor', tiers: ['core', 'enterprise'], status: 'live' },
  { key: 'bid_crm', name: 'Visual Bid CRM', tiers: ['core', 'enterprise'], status: 'live' },
  { key: 'go_no_go', name: 'Go/No-Go Indicator', tiers: ['core', 'enterprise'], status: 'soon' },
  { key: 'vendor_scraper', name: 'Smart Vendor Scraper', tiers: ['core', 'enterprise'], status: 'soon' },
  { key: 'outreach', name: '1-Click Outreach Sequences', tiers: ['core', 'enterprise'], status: 'soon' },
  { key: 'foia', name: 'FOIA Automator', tiers: ['core', 'enterprise'], status: 'soon' },
  { key: 'pricing_matrix', name: 'Profit Pricing Matrix', tiers: ['core', 'enterprise'], status: 'soon' },
  { key: 'milestones', name: 'Post-Award Milestone Tracker', tiers: ['core', 'enterprise'], status: 'soon' },
  { key: 'bid_matchmaker', name: 'Predictive Bid Matchmaker', tiers: ['enterprise'], status: 'soon' },
  { key: 'teaming_legal', name: 'Auto-Teaming Legal Engine', tiers: ['enterprise'], status: 'soon' },
  { key: 'section_m', name: 'Section M Compliance Grader', tiers: ['enterprise'], status: 'soon' },
  { key: 'rfi_ghostwriter', name: 'RFI Ghostwriter', tiers: ['enterprise'], status: 'soon' },
  { key: 'past_performance', name: 'Past Performance Portfolio Builder', tiers: ['enterprise'], status: 'soon' },
  { key: 'state_directory', name: 'State Procurement Directory', tiers: ['enterprise'], status: 'soon' },
];

function normalizeTier(tier) {
  return tier === 'enterprise' ? 'enterprise' : 'core';
}

function hasFeature(tier, key) {
  const feature = FEATURES.find((f) => f.key === key);
  return Boolean(feature && feature.tiers.includes(normalizeTier(tier)));
}

function featuresFor(tier) {
  const t = normalizeTier(tier);
  return FEATURES.map((f) => ({ key: f.key, name: f.name, status: f.status, unlocked: f.tiers.includes(t) }));
}

module.exports = { TIERS, FEATURES, normalizeTier, hasFeature, featuresFor };
