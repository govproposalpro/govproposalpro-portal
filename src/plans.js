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
  coreMonthly: planId('WHOP_CORE_MONTHLY_PLAN_ID', 'plan_3fn88Y0V7nDy8'),
  enterpriseMonthly: planId('WHOP_ENTERPRISE_MONTHLY_PLAN_ID', 'plan_dodFFyk8v95Fv'),
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

module.exports = { PLANS, SUBSCRIPTION_TIERS, whopLink };
