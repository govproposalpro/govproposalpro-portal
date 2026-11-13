'use strict';

/**
 * Deadline alerts. The dashboard reads upcomingAlerts(); the hourly job emails each member once
 * per milestone (7, 3 and 1 days before a proposal or questions deadline, and 60/30/7 days before
 * their SAM.gov registration expires). alert_log makes every reminder go out exactly once, and an
 * advisory lock keeps two server instances from running the job at the same time.
 */

const db = require('../db');
const mailer = require('../services/mailer');
const { buildAlertEmail } = require('../services/email');
const { baseUrl } = require('../tokens');

const BID_MILESTONES = [7, 3, 1];
const SAM_MILESTONES = [60, 30, 7];
// The member's own SAM.gov API key (90-day lifetime): before it expires, and nudges to add one.
const KEY_MILESTONES = [14, 7, 1];
const KEY_MISSING_NUDGES = [2, 10]; // days after company setup, while no key is saved
const OPEN_STAGES = ['prospecting', 'qualifying', 'sourcing', 'pricing', 'drafting'];

const fmt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Everything due in the next `days` days for one member (or all members when userId is null). */
async function collect(userId, days) {
  const params = [days, OPEN_STAGES];
  const userFilter = userId ? `AND b.user_id = $${params.push(userId)}` : '';
  const bids = await db.query(
    `SELECT b.user_id, b.id, b.title, kind, to_char(d, 'YYYY-MM-DD') AS date, (d - current_date) AS days_left
       FROM bids b
       CROSS JOIN LATERAL (VALUES ('due', b.due_at), ('questions', b.questions_due_at)) AS x(kind, d)
      WHERE d IS NOT NULL AND d >= current_date AND d <= current_date + $1::int
        AND b.stage = ANY($2) ${userFilter}`,
    params
  );
  const samParams = [Math.max(days, 60)];
  const samFilter = userId ? `AND id = $${samParams.push(userId)}` : '';
  const samRows = await db.query(
    `SELECT id AS user_id, to_char(sam_expires_on, 'YYYY-MM-DD') AS date, (sam_expires_on - current_date) AS days_left
       FROM "Users" WHERE sam_expires_on IS NOT NULL AND sam_expires_on >= current_date
        AND sam_expires_on <= current_date + $1::int ${samFilter}`,
    samParams
  );
  const keyParams = [Math.max(days, 14)];
  const keyFilter = userId ? `AND user_id = $${keyParams.push(userId)}` : '';
  const keyRows = await db.query(
    `SELECT user_id, to_char(sam_key_expires_on, 'YYYY-MM-DD') AS date, (sam_key_expires_on - current_date) AS days_left,
            to_char(sam_key_rejected_at, 'YYYY-MM-DD') AS rejected_on
       FROM autopilot_settings
      WHERE sam_key_enc IS NOT NULL
        AND (sam_key_rejected_at IS NOT NULL
             OR (sam_key_expires_on IS NOT NULL AND sam_key_expires_on >= current_date - 30 AND sam_key_expires_on <= current_date + $1::int)) ${keyFilter}`,
    keyParams
  );
  return { bids: bids.rows, sam: samRows.rows, keys: keyRows.rows };
}

/** Members who finished company setup but never added a SAM.gov key, with how long ago. */
async function membersWithoutKey() {
  const { rows } = await db.query(
    `SELECT u.id AS user_id, (current_date - u.onboarded_at::date) AS days_since
       FROM "Users" u LEFT JOIN autopilot_settings s ON s.user_id = u.id
      WHERE u.onboarded_at IS NOT NULL AND s.sam_key_enc IS NULL
        AND u.onboarded_at < now() - make_interval(days => $1) AND u.onboarded_at > now() - interval '120 days'`,
    [KEY_MISSING_NUDGES[0]]
  );
  return rows;
}

async function upcomingAlerts(userId, days) {
  const { bids, sam, keys } = await collect(userId, days);
  const out = bids.map((b) => ({
    kind: b.kind === 'due' ? 'proposal_due' : 'questions_due',
    title: b.title,
    bidId: b.id,
    date: b.date,
    daysLeft: b.days_left,
  }));
  for (const s of sam) out.push({ kind: 'sam_expiring', title: 'SAM.gov registration renewal', date: s.date, daysLeft: s.days_left });
  for (const k of keys) {
    if (k.rejected_on || k.days_left < 0) out.push({ kind: 'sam_key', title: 'SAM.gov API key: add a new one', date: k.rejected_on || k.date, daysLeft: 0 });
    else if (k.days_left <= days) out.push({ kind: 'sam_key', title: 'SAM.gov API key expires', date: k.date, daysLeft: k.days_left });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

async function runAlertJob() {
  if (!mailer.canSend()) return;
  const client = await db.pool.connect();
  try {
    const lock = await client.query('SELECT pg_try_advisory_lock(7340002) AS ok');
    if (!lock.rows[0].ok) return;
    try {
      const { bids, sam, keys } = await collect(null, Math.max(...BID_MILESTONES));
      const byUser = new Map();
      const add = (userId, key, item) => {
        if (!byUser.has(userId)) byUser.set(userId, []);
        byUser.get(userId).push({ key, ...item });
      };
      for (const b of bids) {
        // Fire the closest milestone the deadline has reached (so a bid added 2 days out still gets the 3-day alert).
        const m = BID_MILESTONES.filter((x) => b.days_left <= x).sort((x, y) => x - y)[0];
        if (m === undefined) continue;
        add(b.user_id, `bid:${b.id}:${b.kind}:${m}`, {
          title: b.title,
          when: `${b.kind === 'due' ? 'Proposal due' : 'Questions due'} ${fmt(b.date)}`,
          detail: b.days_left === 0 ? 'today' : `${b.days_left} day${b.days_left === 1 ? '' : 's'} left`,
        });
      }
      for (const s of sam) {
        const m = SAM_MILESTONES.filter((x) => s.days_left <= x).sort((x, y) => x - y)[0];
        if (m === undefined) continue;
        add(s.user_id, `sam:${s.date}:${m}`, {
          title: 'SAM.gov registration renewal',
          when: `Expires ${fmt(s.date)}`,
          detail: 'renew early: it can take weeks, and you cannot be awarded while it is lapsed',
        });
      }
      const keyItem = (detail) => ({ title: 'Your SAM.gov API key', kind: 'sam_key', detail });
      for (const k of keys) {
        if (k.rejected_on) {
          add(k.user_id, `samkey:rejected:${k.rejected_on}`, { ...keyItem('paste a new key so bid matching, vendor search and vetting keep working'), when: 'SAM.gov stopped accepting it' });
        } else if (k.days_left < 0) {
          add(k.user_id, `samkey:${k.date}:expired`, { ...keyItem('get a new key in SAM.gov under Account Details and paste it in GovProposalPro'), when: `Expired ${fmt(k.date)}` });
        } else {
          const m = KEY_MILESTONES.filter((x) => k.days_left <= x).sort((x, y) => x - y)[0];
          if (m === undefined) continue;
          add(k.user_id, `samkey:${k.date}:${m}`, { ...keyItem('SAM.gov keys last 90 days: get a new one under Account Details and paste it in GovProposalPro'), when: `Expires ${fmt(k.date)}` });
        }
      }
      for (const u of await membersWithoutKey()) {
        const n = KEY_MISSING_NUDGES.filter((d) => u.days_since >= d).length;
        if (!n) continue;
        add(u.user_id, `samkey:missing:${n}`, { ...keyItem('it is free and takes 2 minutes: SAM.gov, Account Details, Public API Key'), when: 'Not added yet' });
      }
      for (const [userId, items] of byUser) {
        const u = await client.query(
          `SELECT email, ghl_contact_id, email_alerts, status FROM "Users" WHERE id = $1`, [userId]);
        const user = u.rows[0];
        if (!user || !user.email_alerts || user.status === 'disabled') continue;
        const sent = await client.query(
          'SELECT alert_key FROM alert_log WHERE user_id = $1 AND alert_key = ANY($2)', [userId, items.map((i) => i.key)]);
        const already = new Set(sent.rows.map((r) => r.alert_key));
        const fresh = items.filter((i) => !already.has(i.key));
        if (!fresh.length) continue;
        const keyOnly = fresh.every((i) => i.kind === 'sam_key');
        const msg = buildAlertEmail(keyOnly ? {
          heading: 'Your SAM.gov API key needs attention',
          intro: 'GovProposalPro uses your own free SAM.gov API key to find bids, search subcontractors and vet them. SAM.gov keys expire every 90 days, so here is your reminder.',
          items: fresh,
          href: `${baseUrl()}/app/sam-key`,
          eyebrow: 'SAM.gov API key',
          cta: 'Update your SAM.gov key',
        } : {
          heading: fresh.length === 1 ? `Deadline coming up: ${fresh[0].title}` : `${fresh.length} deadlines coming up`,
          intro: 'Here is what needs your attention in GovProposalPro. You can turn these emails off in your profile.',
          items: fresh,
          href: `${baseUrl()}/app`,
        });
        try {
          await mailer.send({ to: user.email, contactId: user.ghl_contact_id || undefined, ...msg });
          for (const i of fresh) {
            await client.query('INSERT INTO alert_log (user_id, alert_key) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, i.key]);
          }
        } catch (err) {
          console.error(`[alerts] email to user ${userId} failed:`, err.message);
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(7340002)');
    }
  } finally {
    client.release();
  }
}

module.exports = { upcomingAlerts, runAlertJob };
