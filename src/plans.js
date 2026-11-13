'use strict';

/**
 * Whop plan ids, shared by the site, the webhook and the app's upgrade button. Each env var
 * overrides its default if a plan moves. Prices shown on the site live in public/site/*.html.
 *
 * Offer (Nov 2026): Enterprise $297/mo leads, Core $97/mo is the entry plan, both cancel anytime
 * with a 7-day money-back guarantee. Yearly plans are offered by email, not on the page. The
 * one-time editions ($897 / $4,997) and their monthly access plans stay for existing buyers.
 */

const planId = (name, fallback = '') => {
  const v = (process.env[name] || '').trim();
  return /^plan_[A-Za-z0-9]{4,40}$/.test(v) ? v : fallback;
};

const PLANS = {
  // Subscriptions sold on the site today.
  // The owner repriced the original edition plans in Whop to these subscriptions (Nov 12, 2026).
  coreMonthly: planId('WHOP_CORE_MONTHLY_PLAN_ID', 'plan_iIafOtFCKgFtZ'), // $97/mo
  enterpriseMonthly: planId('WHOP_ENTERPRISE_MONTHLY_PLAN_ID', 'plan_0E1DCEALxYJLU'), // $297/mo
  coreYearly: planId('WHOP_CORE_YEARLY_PLAN_ID'),
  enterpriseYearly: planId('WHOP_ENTERPRISE_YEARLY_PLAN_ID'),
  // One-time editions and their access plans (existing buyers; $4,997 is sold on calls).
  core: planId('WHOP_CORE_PLAN_ID', 'plan_iIafOtFCKgFtZ'),
  enterprise: planId('WHOP_ENTERPRISE_PLAN_ID', 'plan_0E1DCEALxYJLU'),
  coreAccess: planId('WHOP_CORE_ACCESS_PLAN_ID', 'plan_YG4iM72R2silB'),
  enterpriseAccess: planId('WHOP_ENTERPRISE_ACCESS_PLAN_ID', 'plan_Ksl5OvuMVFAhT'),
};

// The first monthly plans ($199 Core, $999 Enterprise). Still mapped so anyone on them keeps access.
const LEGACY_SUBSCRIPTIONS = { plan_3fn88Y0V7nDy8: 'core', plan_dodFFyk8v95Fv: 'enterprise' };

/** Subscription plan id -> tier. Access on these ends when the membership ends. */
const SUBSCRIPTION_TIERS = new Map(
  [
    ...Object.entries(LEGACY_SUBSCRIPTIONS),
    [PLANS.coreMonthly, 'core'],
    [PLANS.enterpriseMonthly, 'enterprise'],
    [PLANS.coreYearly, 'core'],
    [PLANS.enterpriseYearly, 'enterprise'],
  ].filter(([plan]) => plan)
);

const whopLink = (plan) => `https://whop.com/checkout/${plan}`;

// The free call calendar (GoHighLevel). BOOKING_URL overrides the link; BOOKING_EMBED_ID is the
// calendar's widget id for the embedded booking form on the sales page.
const httpsOr = (v, fallback) => (/^https:\/\/[^\s"'<>]+$/.test((v || '').trim()) ? v.trim() : fallback);
const BOOKING_URL = httpsOr(process.env.BOOKING_URL, 'https://api.leadconnectorhq.com/widget/bookings/onboarding-call-5eikk');
const BOOKING_EMBED_ID = /^[A-Za-z0-9]{10,40}$/.test((process.env.BOOKING_EMBED_ID || '').trim()) ? process.env.BOOKING_EMBED_ID.trim() : 'HMN20Q0KNddduy8ACKv3';
// Meta (Facebook) pixel for the public sales pages. 'off' turns it off.
const META_PIXEL_ID = (() => {
  const v = (process.env.META_PIXEL_ID || '').trim();
  if (v.toLowerCase() === 'off') return '';
  return /^\d{6,20}$/.test(v) ? v : '2544535072700216';
})();

// Microsoft Clarity project id (free heatmaps and session replays on the sales pages).
// Env CLARITY_ID overrides it; 'off' turns Clarity off.
const CLARITY_ID = (() => {
  const v = (process.env.CLARITY_ID || '').trim().toLowerCase();
  if (v === 'off') return '';
  return /^[a-z0-9]{6,20}$/.test(v) ? v : 'zd4xv6iu61';
})();

module.exports = { PLANS, SUBSCRIPTION_TIERS, whopLink, BOOKING_URL, BOOKING_EMBED_ID, META_PIXEL_ID, CLARITY_ID };
