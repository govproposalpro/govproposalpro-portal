'use strict';

/**
 * Activation milestones: the first time a member decrypts a solicitation, saves a bid or gets a
 * finished proposal. Each is stored once on the member and sent to GoHighLevel as a tag
 * (gpp-activated-<milestone>), so the onboarding emails can skip members who already got going
 * and the team can call the ones who have not before the 7-day guarantee runs out.
 */

const db = require('../db');
const ghl = require('../services/ghl');

const MILESTONES = ['first_decrypt', 'first_bid', 'first_proposal'];

/** Records a milestone; does nothing after the first time. Never throws. */
async function markActivated(userId, milestone) {
  if (!MILESTONES.includes(milestone)) return;
  try {
    const { rows } = await db.query(
      `UPDATE "Users" SET activation = activation || jsonb_build_object($2::text, to_char(now(), 'YYYY-MM-DD'))
        WHERE id = $1 AND NOT (activation ? $2::text) RETURNING email`,
      [userId, milestone]
    );
    if (!rows[0] || !ghl.enabled()) return;
    await ghl.tagContact({ email: rows[0].email, tags: [`gpp-activated-${milestone.replace(/_/g, '-')}`] });
  } catch (err) {
    console.error(`[activation] ${milestone} failed:`, err.message);
  }
}

module.exports = { markActivated, MILESTONES };
