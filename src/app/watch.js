'use strict';

/**
 * Scheduled SAM.gov watches.
 *
 * Amendment Watch (every member): once a day, each saved bid with a solicitation number in an open
 * stage is looked up on SAM.gov. Amendments post as new notices under the same solicitation
 * number; a new one is stored with a plain-English, rules-based list of what changed (no AI), the
 * CRM due date follows a moved deadline, and the member gets one email.
 *
 * Compliance Watchdog (Enterprise): weekly re-check of every saved subcontractor with a UEI against
 * SAM.gov registrations and exclusions, the member's own registration refreshed from the Entity
 * API, and reminders before a sub's insurance certificate or licence expires.
 *
 * The scheduled runs only use members' own SAM.gov keys (the shared platform key is kept for
 * interactive lookups) and cap how many lookups one member spends a day, because a SAM.gov key
 * with no role allows only 10 calls a day. "Check now" buttons may fall back to the platform key.
 */

const db = require('../db');
const sam = require('./sam');
const samkey = require('./samkey');
const intel = require('./intel');
const mailer = require('../services/mailer');
const { buildAlertEmail } = require('../services/email');
const { baseUrl } = require('../tokens');
const { normalizeTier, hasFeature } = require('./tiers');

const OPEN_STAGES = ['prospecting', 'qualifying', 'sourcing', 'pricing', 'drafting'];
const AMEND_PER_USER_DAY = 6;
const AMEND_PER_RUN = 60;
const SUBS_PER_USER_RUN = 3;
const SUBS_PER_RUN = 40;
const RECHECK_DAYS = 7;
const DOC_MILESTONES = [30, 7, 0];

const day = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null);
const fmtDay = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');
/** "Dec 4, 2026 2:00 PM (-05:00)" from SAM.gov's "2026-12-04T14:00:00-05:00", without shifting zones. */
function fmtDeadline(raw) {
  const s = String(raw || '');
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::\d{2})?(Z|[+-]\d{2}:?\d{2})?)?/);
  if (!m) return s;
  if (!m[2]) return fmtDay(m[1]);
  const h = Number(m[2]);
  const time = `${((h + 11) % 12) + 1}:${m[3]} ${h < 12 ? 'AM' : 'PM'}`;
  return `${fmtDay(m[1])} ${time}${m[4] ? ` (UTC${m[4] === 'Z' ? '' : m[4]})` : ''}`;
}

// ---------------------------------------------------------------- Amendment Watch

const pick = (n) => (n ? {
  noticeId: n.noticeId, type: n.type || '', title: n.title || '', postedDate: n.postedDate || '',
  responseDeadline: n.responseDeadline || '', setAside: n.setAside || '', resourceCount: n.resourceCount || 0, url: n.url || '',
} : null);

/** What changed between the previous latest notice and a new one, in plain English. Pure. */
function describeChanges(prev, next) {
  const out = [];
  if (/award/i.test(next.type || '') && !/award/i.test((prev && prev.type) || '')) {
    out.push({ kind: 'award', text: 'An award notice was posted: the contract has been awarded.' });
    return out;
  }
  if (/cancel/i.test(`${next.type} ${next.title}`)) out.push({ kind: 'cancelled', text: 'This notice looks like a cancellation. Read it before you spend more time on the bid.' });
  if (prev) {
    if (next.responseDeadline && prev.responseDeadline && next.responseDeadline !== prev.responseDeadline) {
      out.push({ kind: 'deadline', text: `Response due moved from ${fmtDeadline(prev.responseDeadline)} to ${fmtDeadline(next.responseDeadline)}.` });
    } else if (next.responseDeadline && !prev.responseDeadline) {
      out.push({ kind: 'deadline', text: `A response deadline was set: ${fmtDeadline(next.responseDeadline)}.` });
    }
    if ((next.setAside || '') !== (prev.setAside || '')) {
      out.push({ kind: 'set_aside', text: `Set-aside changed from ${prev.setAside || 'none'} to ${next.setAside || 'none (full and open)'}.` });
    }
    if (next.title && prev.title && next.title !== prev.title) out.push({ kind: 'title', text: `Title changed to "${next.title.slice(0, 160)}".` });
    if (next.type && prev.type && next.type !== prev.type) out.push({ kind: 'type', text: `Notice type changed from ${prev.type} to ${next.type}.` });
    const added = (next.resourceCount || 0) - (prev.resourceCount || 0);
    if (added > 0) out.push({ kind: 'files', text: `${added} new attachment${added === 1 ? '' : 's'}. Amendments often change the SOW, wage determination or pricing sheet.` });
  }
  out.push({ kind: 'acknowledge', text: 'Acknowledge this amendment in your offer (sign the SF 30 or list it on the SF 1449), then re-run Preflight on your proposal.' });
  return out;
}

async function lookup(userId, solnum, maxAgeMs) {
  const key = `sam:sol:v1:${solnum.toUpperCase()}`;
  return samkey.withKey(userId, (apiKey) => intel.cached(key, maxAgeMs, () => sam.noticesForSolicitation(solnum, apiKey)));
}

/**
 * Looks one bid up on SAM.gov and records anything new. The first look only takes a baseline.
 * @returns {Promise<{snapshot: object, added: object[]}>}
 */
async function checkBid(bid, { maxAgeMs = 6 * 3600_000 } = {}) {
  const solnum = String(bid.solicitation_number || '').trim();
  const prevSnap = bid.amend_watch || null;
  const now = new Date().toISOString();
  if (!(await samkey.available(bid.user_id))) {
    const snapshot = { ...(prevSnap || {}), checkedAt: now, error: 'no_key' };
    await db.query('UPDATE bids SET amend_watch = $2 WHERE id = $1', [bid.id, snapshot]);
    return { snapshot, added: [] };
  }
  let notices;
  try {
    notices = await lookup(bid.user_id, solnum, maxAgeMs);
  } catch (err) {
    const snapshot = { ...(prevSnap || {}), checkedAt: now, error: err.userMessage || 'SAM.gov did not respond' };
    await db.query('UPDATE bids SET amend_watch = $2 WHERE id = $1', [bid.id, snapshot]);
    throw err;
  }
  const ids = notices.map((n) => n.noticeId).filter(Boolean);
  const latest = pick(notices[notices.length - 1]);
  const added = [];
  if (prevSnap && Array.isArray(prevSnap.ids)) {
    const known = new Set(prevSnap.ids);
    let prev = prevSnap.latest || null;
    for (const n of notices) {
      if (!n.noticeId || known.has(n.noticeId)) continue;
      const next = pick(n);
      const changes = describeChanges(prev, next);
      // The CRM due date follows a moved deadline, unless the member set their own date.
      const newDue = day(next.responseDeadline);
      const oldDue = prev && day(prev.responseDeadline);
      if (newDue && newDue !== oldDue && (!bid.due || bid.due === oldDue)) {
        await db.query('UPDATE bids SET due_at = $2, updated_at = now() WHERE id = $1', [bid.id, newDue]);
        bid.due = newDue;
        changes.splice(changes.length - 1, 0, { kind: 'crm', text: `Your Bid CRM due date was updated to ${fmtDay(newDue)}.` });
      }
      const { rows } = await db.query(
        `INSERT INTO bid_amendments (user_id, bid_id, notice_id, notice_type, title, posted_date, url, changes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (bid_id, notice_id) DO NOTHING RETURNING id`,
        [bid.user_id, bid.id, next.noticeId.slice(0, 100), next.type.slice(0, 80), next.title.slice(0, 300), String(next.postedDate).slice(0, 40), next.url.slice(0, 500), JSON.stringify(changes)]
      );
      if (rows[0]) added.push({ id: rows[0].id, bidId: bid.id, bidTitle: bid.title, ...next, changes });
      prev = next;
    }
  }
  const snapshot = { checkedAt: now, solnum, ids: ids.slice(-100), count: ids.length, latest };
  await db.query('UPDATE bids SET amend_watch = $2 WHERE id = $1', [bid.id, snapshot]);
  return { snapshot, added };
}

async function emailAmendments(userId, added) {
  if (!added.length || !mailer.canSend()) return;
  const u = await db.query(`SELECT email, ghl_contact_id, email_alerts, status FROM "Users" WHERE id = $1`, [userId]);
  const user = u.rows[0];
  if (!user || !user.email_alerts || user.status === 'disabled') return;
  const fresh = [];
  for (const a of added) {
    const r = await db.query('INSERT INTO alert_log (user_id, alert_key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1', [userId, `amend:${a.bidId}:${a.noticeId}`.slice(0, 80)]);
    if (r.rowCount) fresh.push(a);
  }
  if (!fresh.length) return;
  const msg = buildAlertEmail({
    heading: fresh.length === 1 ? `Amendment posted: ${fresh[0].bidTitle}` : `${fresh.length} amendments posted on your bids`,
    intro: 'SAM.gov posted something new on a solicitation you are tracking. A missed amendment can get an offer thrown out, so read it and acknowledge it in your offer.',
    items: fresh.map((a) => ({ title: a.bidTitle, when: a.changes[0].text, detail: a.type })),
    href: `${baseUrl()}/app/amendments`,
    eyebrow: 'Amendment Watch',
    cta: 'See what changed',
  });
  try {
    await mailer.send({ to: user.email, contactId: user.ghl_contact_id || undefined, ...msg });
  } catch (err) {
    console.error(`[amendments] email to user ${userId} failed:`, err.message);
  }
}

/** Bids due for a daily look, oldest check first, respecting each member's daily cap. */
async function dueBids() {
  const { rows } = await db.query(
    `SELECT b.id, b.user_id, b.title, b.solicitation_number, to_char(b.due_at, 'YYYY-MM-DD') AS due, b.amend_watch
       FROM bids b JOIN "Users" u ON u.id = b.user_id
       JOIN autopilot_settings k ON k.user_id = b.user_id AND k.sam_key_enc IS NOT NULL AND k.sam_key_rejected_at IS NULL
      WHERE length(trim(coalesce(b.solicitation_number, ''))) >= 4
        AND b.stage = ANY($1) AND (b.due_at IS NULL OR b.due_at >= current_date - 1)
        AND u.status IS DISTINCT FROM 'disabled'
        AND (b.amend_watch IS NULL OR (b.amend_watch->>'checkedAt')::timestamptz < now() - interval '20 hours')
        AND (SELECT count(*) FROM bids x WHERE x.user_id = b.user_id
               AND (x.amend_watch->>'checkedAt')::timestamptz > now() - interval '24 hours') < $2
      ORDER BY (b.amend_watch->>'checkedAt') NULLS FIRST
      LIMIT $3`,
    [OPEN_STAGES, AMEND_PER_USER_DAY, AMEND_PER_RUN]
  );
  const perUser = new Map();
  return rows.filter((b) => {
    const n = perUser.get(b.user_id) || 0;
    perUser.set(b.user_id, n + 1);
    return n < 2; // spread a member's bids across runs
  });
}

async function runAmendmentWatch() {
  const client = await db.pool.connect();
  try {
    const lock = await client.query('SELECT pg_try_advisory_lock(7340003) AS ok');
    if (!lock.rows[0].ok) return;
    try {
      const byUser = new Map();
      for (const bid of await dueBids()) {
        try {
          const { added } = await checkBid(bid);
          if (added.length) byUser.set(bid.user_id, [...(byUser.get(bid.user_id) || []), ...added]);
        } catch (err) {
          console.error(`[amendments] bid ${bid.id} failed:`, err.message);
        }
      }
      for (const [userId, added] of byUser) await emailAmendments(userId, added);
    } finally {
      await client.query('SELECT pg_advisory_unlock(7340003)');
    }
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------- Compliance Watchdog

const daysUntil = (d) => (d ? Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86400000) : null);

/** Re-vets one saved sub by UEI and stores the result. Returns the new watch record. */
async function recheckSub(userId, sub) {
  const result = await samkey.withKey(userId, (key) => sam.vet(sub.uei, key));
  const ent = result.entities[0] || {};
  const prev = sub.watch || null;
  const watch = {
    verdict: result.verdict,
    status: ent.status || '',
    expires: day(ent.expires),
    exclusions: result.exclusions.filter((x) => x.active).length,
    checkedAt: result.checkedAt,
    prevVerdict: prev ? prev.verdict : null,
    changedAt: prev && prev.verdict !== result.verdict ? result.checkedAt : (prev && prev.changedAt) || null,
  };
  await db.query('UPDATE sub_contacts SET watch = $3 WHERE id = $1 AND user_id = $2', [sub.id, userId, watch]);
  return watch;
}

/** Refreshes the member's own SAM.gov registration (status, CAGE, expiry) from their UEI. */
async function refreshOwnRegistration(user) {
  const result = await samkey.withKey(user.id, (key) => sam.registration(user.uei, key));
  const checked = { ...result, uei: user.uei };
  const expires = day(result.expires);
  const cage = /^[A-Z0-9]{5}$/.test(result.cage || '') ? result.cage : null;
  await db.query(
    `UPDATE "Users" SET sam_checked = $2, cage_code = COALESCE(cage_code, $3),
            sam_expires_on = CASE WHEN $4::date IS NOT NULL THEN $4::date ELSE sam_expires_on END,
            sam_status = CASE WHEN $5 THEN 'active' ELSE sam_status END
      WHERE id = $1`,
    [user.id, checked, cage, expires, result.active]
  );
  return checked;
}

/** Green / yellow / red for one sub, with the reasons. Pure. */
function subLevel(s) {
  const reasons = [];
  let level = 'green';
  const bump = (l, why) => {
    reasons.push(why);
    if (l === 'red' || (l === 'yellow' && level === 'green')) level = l;
  };
  const w = s.watch;
  if (!s.uei) bump('yellow', 'No UEI saved, so SAM.gov cannot be re-checked');
  else if (!w) bump('yellow', 'Not checked yet');
  else if (w.verdict === 'excluded') bump('red', 'Active federal exclusion: do not pay or team with them');
  else if (w.verdict === 'not_registered') bump('red', 'No active SAM.gov registration found');
  else if (w.verdict === 'review') bump('yellow', 'SAM.gov registration needs a look');
  if (w && w.expires) {
    const d = daysUntil(w.expires);
    if (d < 0) bump('red', `SAM.gov registration expired ${fmtDay(w.expires)}`);
    else if (d <= 30) bump('yellow', `SAM.gov registration expires in ${d} day${d === 1 ? '' : 's'}`);
  }
  for (const [label, date] of [['Insurance certificate', s.coiExpires], ['Licence', s.licenseExpires]]) {
    if (!date) continue;
    const d = daysUntil(date);
    if (d < 0) bump('red', `${label} expired ${fmtDay(date)}`);
    else if (d <= 30) bump('yellow', `${label} expires in ${d} day${d === 1 ? '' : 's'}`);
  }
  return { level, reasons };
}

const SUB_SELECT = `id, company, uei, cage, trade, location, watch,
  to_char(coi_expires, 'YYYY-MM-DD') AS "coiExpires", to_char(license_expires, 'YYYY-MM-DD') AS "licenseExpires"`;

/** Everything the Compliance Watchdog page shows. */
async function watchdogSummary(user) {
  const subs = (await db.query(`SELECT ${SUB_SELECT} FROM sub_contacts WHERE user_id = $1 ORDER BY company LIMIT 300`, [user.id])).rows
    .map((s) => ({ ...s, ...subLevel(s) }));
  const u = (await db.query(`SELECT uei, sam_checked, to_char(sam_expires_on, 'YYYY-MM-DD') AS expires FROM "Users" WHERE id = $1`, [user.id])).rows[0] || {};
  const own = { uei: u.uei || '', expires: u.expires || null, checked: u.sam_checked || null, reasons: [] };
  own.level = 'green';
  if (!own.uei) { own.level = 'yellow'; own.reasons.push('Add your UEI to your profile so we can watch your registration'); }
  else if (own.checked && own.checked.uei === own.uei && own.checked.found === false) { own.level = 'red'; own.reasons.push('SAM.gov has no registration for your UEI'); }
  else if (own.checked && own.checked.uei === own.uei && own.checked.found && !own.checked.active) { own.level = 'red'; own.reasons.push(`Registration status: ${own.checked.status || 'not active'}`); }
  const d = daysUntil(own.expires);
  if (d !== null) {
    own.daysLeft = d;
    if (d < 0) { own.level = 'red'; own.reasons.push('Your SAM.gov registration has expired: you cannot be awarded until it is renewed'); }
    else if (d <= 60) { if (own.level === 'green') own.level = 'yellow'; own.reasons.push(`Renew now: it expires in ${d} days and renewals can take weeks`); }
  }
  const key = await samkey.status(user.id);
  const keyLevel = key.state === 'ok' ? 'green' : key.state === 'expiring' || key.state === 'none' ? 'yellow' : 'red';
  const levels = [own.level, keyLevel, ...subs.map((s) => s.level)];
  const overall = levels.includes('red') ? 'red' : levels.includes('yellow') ? 'yellow' : 'green';
  return { overall, own, samKey: { ...key, level: keyLevel }, subs };
}

async function watchdogMembers() {
  const { rows } = await db.query(
    `SELECT u.id, u.uei, u.sam_checked, COALESCE(ap.tier, u.tier) AS tier
       FROM "Users" u LEFT JOIN authorized_purchasers ap ON lower(ap.email) = lower(u.email)
      WHERE u.status IS DISTINCT FROM 'disabled' AND (ap.id IS NULL OR ap.revoked_at IS NULL)
        AND (EXISTS (SELECT 1 FROM sub_contacts s WHERE s.user_id = u.id AND (s.uei IS NOT NULL OR s.coi_expires IS NOT NULL OR s.license_expires IS NOT NULL))
             OR u.uei IS NOT NULL)`
  );
  return rows.filter((r) => hasFeature(normalizeTier(r.tier), 'compliance_watchdog'));
}

async function runWatchdog() {
  const client = await db.pool.connect();
  try {
    const lock = await client.query('SELECT pg_try_advisory_lock(7340004) AS ok');
    if (!lock.rows[0].ok) return;
    try {
      let budget = SUBS_PER_RUN;
      for (const m of await watchdogMembers()) {
        const items = [];
        // Scheduled checks only spend the member's own key, never the shared platform key.
        const hasKey = Boolean(await samkey.keyFor(m.id));
        // 1. The member's own registration, weekly.
        const last = m.sam_checked;
        if (hasKey && m.uei && /^[A-Z0-9]{12}$/.test(m.uei) && budget > 0
          && !(last && last.uei === m.uei && Date.now() - Date.parse(last.checkedAt) < RECHECK_DAYS * 86400000)) {
          budget -= 1;
          try {
            const r = await refreshOwnRegistration(m);
            if (r.found && !r.active) items.push({ key: `own:${m.uei}:${r.status}`, title: 'Your SAM.gov registration', when: `Status: ${r.status || 'not active'}`, detail: 'you cannot be awarded until it is active' });
          } catch (err) { console.error(`[watchdog] own registration for ${m.id} failed:`, err.message); }
        }
        // 2. Subs with a UEI, weekly, a few per run.
        if (hasKey && budget > 0) {
          const { rows: subs } = await db.query(
            `SELECT id, company, uei, watch FROM sub_contacts
              WHERE user_id = $1 AND uei ~ '^[A-Z0-9]{12}$'
                AND (watch IS NULL OR (watch->>'checkedAt')::timestamptz < now() - make_interval(days => $2))
              ORDER BY (watch->>'checkedAt') NULLS FIRST LIMIT $3`,
            [m.id, RECHECK_DAYS, Math.min(SUBS_PER_USER_RUN, budget)]
          );
          for (const s of subs) {
            budget -= 1;
            try {
              const w = await recheckSub(m.id, s);
              const worse = w.verdict === 'excluded' || w.verdict === 'not_registered';
              if (worse && (!s.watch || s.watch.verdict !== w.verdict)) {
                items.push({
                  key: `watch:${s.id}:${w.verdict}`,
                  title: s.company,
                  when: w.verdict === 'excluded' ? 'Now on the federal exclusions list' : 'No active SAM.gov registration',
                  detail: w.verdict === 'excluded' ? 'do not team with or pay them on a federal contract' : 'ask them to renew before you rely on them',
                });
              }
            } catch (err) { console.error(`[watchdog] sub ${s.id} failed:`, err.message); }
          }
        }
        // 3. Insurance certificates and licences.
        const { rows: docs } = await db.query(
          `SELECT id, company, kind, to_char(d, 'YYYY-MM-DD') AS date, (d - current_date) AS days_left
             FROM sub_contacts CROSS JOIN LATERAL (VALUES ('coi', coi_expires), ('license', license_expires)) AS x(kind, d)
            WHERE user_id = $1 AND d IS NOT NULL AND d >= current_date - 1 AND d <= current_date + $2::int`,
          [m.id, Math.max(...DOC_MILESTONES)]
        );
        for (const doc of docs) {
          const ms = DOC_MILESTONES.filter((x) => doc.days_left <= x).sort((a, b) => a - b)[0];
          if (ms === undefined) continue;
          const label = doc.kind === 'coi' ? 'Insurance certificate' : 'Licence';
          items.push({
            key: `${doc.kind}:${doc.id}:${doc.date}:${ms}`,
            title: doc.company,
            when: `${label} ${doc.days_left < 0 ? 'expired' : 'expires'} ${fmtDay(doc.date)}`,
            detail: 'ask them for a current copy before they work on your contract',
          });
        }
        if (items.length) await emailWatchdog(m.id, items);
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(7340004)');
    }
  } finally {
    client.release();
  }
}

async function emailWatchdog(userId, items) {
  if (!mailer.canSend()) return;
  const u = await db.query(`SELECT email, ghl_contact_id, email_alerts, status FROM "Users" WHERE id = $1`, [userId]);
  const user = u.rows[0];
  if (!user || !user.email_alerts || user.status === 'disabled') return;
  const fresh = [];
  for (const i of items) {
    const r = await db.query('INSERT INTO alert_log (user_id, alert_key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1', [userId, i.key.slice(0, 80)]);
    if (r.rowCount) fresh.push(i);
  }
  if (!fresh.length) return;
  const msg = buildAlertEmail({
    heading: fresh.length === 1 ? `Compliance alert: ${fresh[0].title}` : `${fresh.length} compliance alerts`,
    intro: 'Your Compliance Watchdog found something that needs your attention.',
    items: fresh,
    href: `${baseUrl()}/app/watchdog`,
    eyebrow: 'Compliance Watchdog',
    cta: 'Open the Watchdog',
  });
  try {
    await mailer.send({ to: user.email, contactId: user.ghl_contact_id || undefined, ...msg });
  } catch (err) {
    console.error(`[watchdog] email to user ${userId} failed:`, err.message);
  }
}

module.exports = {
  describeChanges, fmtDeadline, checkBid, runAmendmentWatch, OPEN_STAGES,
  subLevel, recheckSub, refreshOwnRegistration, watchdogSummary, runWatchdog, SUB_SELECT,
};
