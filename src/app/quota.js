'use strict';

/**
 * Monthly AI Proposal Engine caps (calendar month, UTC). A proposal counts from the moment it
 * starts unless it fails, so a member can't exceed the cap by firing requests in parallel, and
 * a failed generation hands the credit back.
 */

const db = require('../db');
const { TIERS, normalizeTier } = require('./tiers');

const COUNT_SQL = `SELECT count(*)::int AS used FROM proposals
                    WHERE user_id = $1 AND status <> 'failed' AND NOT own_key
                      AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;

function resetsAt() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

async function proposalUsage(userId, tier) {
  const limit = TIERS[normalizeTier(tier)].monthlyProposals;
  const { rows } = await db.query(COUNT_SQL, [userId]);
  return { used: rows[0].used, limit, resetsAt: resetsAt() };
}

/**
 * Atomically checks the cap and inserts a 'working' proposal row. Returns the new row id, or
 * null when the member is at their limit. The advisory lock serialises one member's requests.
 */
async function reserveProposal(userId, tier, { title, bidId, rfpSummaryId }) {
  const limit = TIERS[normalizeTier(tier)].monthlyProposals;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(7340001, $1::int)', [userId]);
    const { rows } = await client.query(COUNT_SQL, [userId]);
    if (rows[0].used >= limit) {
      await client.query('ROLLBACK');
      return null;
    }
    const inserted = await client.query(
      `INSERT INTO proposals (user_id, bid_id, rfp_summary_id, title) VALUES ($1, $2, $3, $4) RETURNING id`,
      [userId, bidId || null, rfpSummaryId || null, title]
    );
    await client.query('COMMIT');
    return inserted.rows[0].id;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { proposalUsage, reserveProposal };
