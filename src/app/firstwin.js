'use strict';

/**
 * First Win Path: the beginner's road from an LLC to a first award, as one checklist.
 * Most steps tick themselves from what the member has already done in the app; every step can
 * also be ticked by hand (for work done elsewhere). Step text lives here so the dashboard card,
 * the full page and any future onboarding email all say the same thing.
 */

const db = require('../db');

// tool: the dashboard feature that does the step (the page shows its upgrade card if locked).
// link: an official free resource. target: how many of something finishes the step.
const STEPS = [
  {
    key: 'llc', title: 'Form your LLC',
    body: 'Register a limited liability company with your state. It keeps your personal assets separate and SAM.gov needs a legal business name. File it yourself with your Secretary of State, or ask us and we will point you to help setting it up.',
    link: 'https://www.sba.gov/business-guide/launch-your-business/register-your-business', linkLabel: 'SBA: register your business', tool: 'state_directory',
  },
  {
    key: 'ein', title: 'Get your EIN',
    body: 'Apply for an Employer Identification Number on IRS.gov. It is free and takes about 10 minutes online. Your business name must match the IRS letter exactly when you register in SAM.gov.',
    link: 'https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number', linkLabel: 'IRS.gov: get an EIN',
  },
  {
    key: 'naics', title: 'Pick your NAICS codes',
    body: 'NAICS codes say what work you do (for example 561730 Landscaping). Every search, match and recompete in GovProposalPro uses them. Add two or three to your profile.',
    link: 'https://www.census.gov/naics/', linkLabel: 'Census.gov NAICS search', path: '/profile', auto: 'Ticks itself when your profile has a NAICS code.',
  },
  {
    key: 'sam', title: 'Get SAM.gov Active with a UEI and CAGE code',
    body: 'Register in SAM.gov (free) to get your Unique Entity ID and CAGE code. Add your UEI to your profile and we check SAM.gov for you. Registration usually takes 2 to 4 weeks, so start now.',
    link: 'https://sam.gov', linkLabel: 'SAM.gov', tool: 'sam_checklist', auto: 'Ticks itself when SAM.gov shows your UEI as Active.',
  },
  {
    key: 'capability', title: 'Create your capability statement',
    body: 'A one-page resume for your company. Contracting officers and primes ask for it, and you attach it to every sources-sought response.',
    tool: 'capability_statement', auto: 'Ticks itself when you generate one.',
  },
  {
    key: 'subs', title: 'Put 3 subcontractors on your bench', target: 3,
    body: 'Find local companies that do the work and save them with a quote or contact. With subs lined up you can price bids in a day instead of a week.',
    tool: 'vendor_scraper', auto: 'Counts the subcontractors you save.',
  },
  {
    key: 'sources_sought', title: 'Answer your first sources-sought notice',
    body: 'Sources-sought notices ask who could do the work. Answering one with your capability statement is how a new company gets a contract set aside for small businesses. Search SAM.gov for "Sources Sought" in your NAICS codes.',
    link: 'https://sam.gov/search/?index=opp&page=1&sfm%5BsimpleSearch%5D%5BkeywordRadio%5D=ALL&sfm%5Bstatus%5D%5Bis_active%5D=true&sfm%5BtypeOfNotice%5D%5B0%5D%5Bkey%5D=r', linkLabel: 'Sources sought on SAM.gov', tool: 'rfi_ghostwriter',
  },
  {
    key: 'bids', title: 'Submit your first 5 bids', target: 5,
    body: 'Most first wins come within the first 5 to 20 bids. Start with small, simple contracts in your NAICS codes and move each one to Submitted in your Bid CRM.',
    tool: 'proposal_engine', auto: 'Counts bids you move to Submitted, Won or Lost in your Bid CRM.',
  },
  {
    key: 'win', title: 'Win your first award',
    body: 'When an award comes in, move the bid to Won. Then set up your milestones and invoices so you and your subs get paid on time.',
    tool: 'bid_crm', auto: 'Ticks itself when a bid in your Bid CRM is marked Won.',
  },
];
const KEYS = STEPS.map((s) => s.key);

/** What the member's data says about each step: { key: { done, count } }. */
async function autoProgress(user) {
  const { rows } = await db.query(
    `SELECT
       (SELECT count(*)::int FROM capability_statements WHERE user_id = $1 AND status = 'ready') AS capability,
       (SELECT count(*)::int FROM sub_contacts WHERE user_id = $1) AS subs,
       (SELECT count(*)::int FROM bids WHERE user_id = $1 AND stage IN ('submitted', 'won', 'lost')) AS bids,
       (SELECT count(*)::int FROM bids WHERE user_id = $1 AND stage = 'won') AS wins`,
    [user.id]
  );
  const n = rows[0];
  const sam = user.sam_checked || null;
  return {
    llc: { done: Boolean(user.entity_structure && /llc|corp|inc|partnership/i.test(user.entity_structure)) },
    ein: { done: false },
    naics: { done: /\b\d{6}\b/.test(user.naics || '') },
    sam: { done: Boolean(sam && sam.active && sam.uei === user.uei) },
    capability: { done: n.capability > 0, count: n.capability },
    subs: { done: n.subs >= 3, count: n.subs },
    sources_sought: { done: false },
    bids: { done: n.bids >= 5, count: n.bids },
    win: { done: n.wins > 0, count: n.wins },
  };
}

/** The checklist as the dashboard shows it. */
async function pathFor(user) {
  const auto = await autoProgress(user);
  const manual = user.first_win || {};
  const steps = STEPS.map((s) => {
    const a = auto[s.key] || {};
    return {
      key: s.key, title: s.title, body: s.body, link: s.link || null, linkLabel: s.linkLabel || null,
      tool: s.tool || null, path: s.path || null, autoNote: s.auto || null, target: s.target || null,
      count: a.count ?? null,
      done: Boolean(a.done || manual[s.key]),
      doneBy: a.done ? 'auto' : manual[s.key] ? 'manual' : null,
      doneOn: manual[s.key] || null,
    };
  });
  const done = steps.filter((s) => s.done).length;
  return {
    steps,
    done,
    total: steps.length,
    next: (steps.find((s) => !s.done) || {}).key || null,
    sam: user.sam_checked || null,
  };
}

module.exports = { STEPS, KEYS, pathFor };
