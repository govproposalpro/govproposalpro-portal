'use strict';

/**
 * Calendar feed (iCalendar) of a member's deadlines: proposal and questions due dates from the
 * Bid CRM, post-award milestones and the SAM.gov registration renewal. Google Calendar, Apple
 * Calendar and Outlook subscribe to it by URL and refresh it on their own schedule.
 */

const db = require('../db');

const OPEN_STAGES = ['prospecting', 'qualifying', 'sourcing', 'pricing', 'drafting', 'submitted'];

/** RFC 5545 text escaping and 75-octet line folding. */
const escText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest, 'utf8') > 73) {
    let cut = 73;
    while (Buffer.byteLength(rest.slice(0, cut), 'utf8') > 73) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}
const ymd = (d) => String(d).slice(0, 10).replace(/-/g, '');
const nextDay = (d) => { const x = new Date(`${String(d).slice(0, 10)}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

function event({ uid, date, title, description, url, alarmDays = 1 }) {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}@govproposalpro.com`,
    `DTSTAMP:${stamp()}`,
    `DTSTART;VALUE=DATE:${ymd(date)}`,
    `DTEND;VALUE=DATE:${ymd(nextDay(date))}`,
    `SUMMARY:${escText(title)}`,
    description ? `DESCRIPTION:${escText(description)}` : null,
    url ? `URL:${url}` : null,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escText(title)}`, `TRIGGER:-P${alarmDays}D`, 'END:VALARM',
    'END:VEVENT',
  ].filter(Boolean);
}

/** Builds the .ics text for one member. */
async function feedFor(userId, appUrl) {
  const [bids, milestones, user] = await Promise.all([
    db.query(
      `SELECT id, title, agency, solicitation_number, to_char(due_at, 'YYYY-MM-DD') AS due, to_char(questions_due_at, 'YYYY-MM-DD') AS questions
         FROM bids WHERE user_id = $1 AND stage = ANY($2) AND (due_at IS NOT NULL OR questions_due_at IS NOT NULL)
          AND COALESCE(due_at, questions_due_at) >= current_date - 30`,
      [userId, OPEN_STAGES]),
    db.query(
      `SELECT m.id, m.title, to_char(m.due_on, 'YYYY-MM-DD') AS due, b.title AS bid
         FROM milestones m JOIN bids b ON b.id = m.bid_id
        WHERE m.user_id = $1 AND m.status = 'open' AND m.due_on IS NOT NULL AND m.due_on >= current_date - 30`,
      [userId]),
    db.query(`SELECT to_char(sam_expires_on, 'YYYY-MM-DD') AS sam FROM "Users" WHERE id = $1`, [userId]),
  ]);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GovProposalPro//Deadlines//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:GovProposalPro deadlines', 'X-PUBLISHED-TTL:PT6H', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H'];
  for (const b of bids.rows) {
    const about = [b.agency, b.solicitation_number && `Solicitation ${b.solicitation_number}`].filter(Boolean).join(' · ');
    if (b.due) lines.push(...event({ uid: `bid-${b.id}-due`, date: b.due, title: `Proposal due: ${b.title}`, description: `${about}\nCheck the exact time and time zone in the solicitation.`, url: `${appUrl}/app/crm`, alarmDays: 3 }));
    if (b.questions) lines.push(...event({ uid: `bid-${b.id}-questions`, date: b.questions, title: `Questions due: ${b.title}`, description: about, url: `${appUrl}/app/crm` }));
  }
  for (const m of milestones.rows) {
    lines.push(...event({ uid: `milestone-${m.id}`, date: m.due, title: `${m.title} (${m.bid})`, url: `${appUrl}/app/milestones` }));
  }
  const sam = user.rows[0] && user.rows[0].sam;
  if (sam) lines.push(...event({ uid: `sam-${sam}`, date: sam, title: 'SAM.gov registration expires', description: 'Renew at least 30 days early. You cannot be awarded while it is lapsed.', url: 'https://sam.gov', alarmDays: 30 }));
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { feedFor, escText, fold };
