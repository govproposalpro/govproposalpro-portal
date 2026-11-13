'use strict';

/**
 * Whop REST API, used only to stop a member being billed twice: when a Core subscriber upgrades
 * to Enterprise, their Core membership is set to cancel at the end of the period they already
 * paid for. Needs WHOP_API_KEY (a company API key with the membership:cancel permission). Without
 * it the team gets a GoHighLevel task to cancel by hand, as before.
 */

// WHOP_API_BASE_URL only exists so tests can point at a local stand-in.
const BASE = (process.env.WHOP_API_BASE_URL || 'https://api.whop.com/api/v1').replace(/\/$/, '');

function enabled() {
  return Boolean((process.env.WHOP_API_KEY || '').trim());
}

/** Stops renewal of one membership (mem_...) and keeps access to the end of the paid period. */
async function cancelAtPeriodEnd(membershipId, reason) {
  if (!/^mem_[A-Za-z0-9]{4,60}$/.test(String(membershipId || ''))) throw new Error('not a membership id');
  const res = await fetch(`${BASE}/memberships/${membershipId}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHOP_API_KEY.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Idempotency-Key': `gpp-upgrade-${membershipId}`,
    },
    body: JSON.stringify({ cancel_at_period_end: true, reason: String(reason || '').slice(0, 200) }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Whop cancel ${membershipId} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

module.exports = { enabled, cancelAtPeriodEnd };
