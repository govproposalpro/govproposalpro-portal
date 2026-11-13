'use strict';

/**
 * Cash-Flow Autopilot (Enterprise): for every contract the member has won, which portal to bill
 * in, whether each invoice is ready to submit, when the government should pay (Prompt Payment
 * Act: 30 days after a proper invoice, FAR 32.904 and 5 CFR 1315), what the member owes their subs
 * and when, and the biggest cash gap between the two. Rules only, no AI.
 */

const db = require('../db');

const DOD = /\b(defense|army|navy|air force|marine|space force|dla|disa|dcma|dtra|darpa|corps of engineers|usace|socom|tricare|national guard|missile defense)\b/i;
const PORTALS = {
  wawf: { key: 'wawf', name: 'WAWF in PIEE', url: 'https://piee.eb.mil', note: 'DoD contracts are billed in Wide Area WorkFlow (DFARS 252.232-7006). Your contract names the document type (often a 2-in-1 for services or a combo for supplies) and the DoDAAC codes to use.' },
  va: { key: 'va', name: 'VA e-invoicing portal', url: '', note: 'VA contracts are billed electronically under VAAR 852.232-72. The contract names the portal and the payment office; use exactly what it says.' },
  ipp: { key: 'ipp', name: 'Invoice Processing Platform (IPP)', url: 'https://www.ipp.gov', note: 'Most civilian agencies use the Treasury\'s IPP. Check the invoicing clause in your contract: a few agencies use their own portal.' },
};

function portalFor(agency) {
  const a = String(agency || '');
  if (DOD.test(a)) return PORTALS.wawf;
  if (/veterans affairs|\bVA\b/i.test(a)) return PORTALS.va;
  return PORTALS.ipp;
}

const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);
const days = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

/** What would get this invoice rejected. Pure. */
function invoiceChecks(inv, bid) {
  const d = inv.data || {};
  const out = [];
  if (!(Number(inv.total) > 0)) out.push('The total is zero or missing.');
  if (!String(d.contractNumber || '').trim()) out.push('No contract number: payment offices reject invoices without it.');
  if (!String(inv.number || '').trim()) out.push('No invoice number.');
  const lines = Array.isArray(d.lines) ? d.lines : Array.isArray(d.items) ? d.items : null;
  if (lines && !lines.length) out.push('No line items: bill against the CLINs in your contract.');
  if (bid && bid.est_value && Number(inv.total) > Number(bid.est_value) * 1.0001) out.push('This invoice is more than the contract value in your CRM.');
  return out;
}

async function plan(userId) {
  const [bidsRes, invRes, msRes] = await Promise.all([
    db.query(`SELECT id, title, agency, stage, est_value::float AS est_value FROM bids WHERE user_id = $1`, [userId]),
    db.query(`SELECT id, bid_id, number, data, total::float AS total, status FROM invoices WHERE user_id = $1 ORDER BY created_at`, [userId]),
    db.query(`SELECT m.id, m.bid_id, m.title, to_char(m.due_on, 'YYYY-MM-DD') AS due_on, m.amount::float AS amount, m.status, s.company AS sub
                FROM milestones m LEFT JOIN sub_contacts s ON s.id = m.sub_contact_id WHERE m.user_id = $1`, [userId]),
  ]);
  const bids = new Map(bidsRes.rows.map((b) => [String(b.id), b]));
  const contracts = new Map();
  const contract = (bidId) => {
    const key = bidId ? String(bidId) : 'none';
    if (!contracts.has(key)) {
      const b = bids.get(key);
      contracts.set(key, {
        bidId: b ? b.id : null, title: b ? b.title : 'Invoices not linked to a contract', agency: b ? b.agency : '',
        portal: portalFor(b && b.agency), invoices: [], subPayments: [],
      });
    }
    return contracts.get(key);
  };
  for (const b of bidsRes.rows) if (b.stage === 'won') contract(b.id);

  const now = today();
  const events = [];
  for (const inv of invRes.rows) {
    const c = contract(inv.bid_id);
    const submitted = inv.data && /^\d{4}-\d{2}-\d{2}$/.test(inv.data.submittedOn || '') ? inv.data.submittedOn : null;
    const row = { id: inv.id, number: inv.number, total: inv.total || 0, status: inv.status, submittedOn: submitted, checks: inv.status === 'paid' ? [] : invoiceChecks(inv, bids.get(String(inv.bid_id))) };
    if (inv.status === 'submitted') {
      row.expectedPay = addDays(submitted || now, 30);
      const late = days(row.expectedPay, now);
      if (late > 0) row.late = { days: late, note: `Past the 30-day Prompt Payment date by ${late} day${late === 1 ? '' : 's'}. The government owes interest automatically; call the payment office named in your contract and ask for the status.` };
      events.push({ date: late > 0 ? now : row.expectedPay, amount: row.total, kind: 'in', label: `Invoice ${inv.number}` });
    } else if (inv.status === 'draft') {
      row.expectedPay = addDays(now, 30);
      row.note = 'Submit it today and payment is due around ' + row.expectedPay + '.';
      events.push({ date: row.expectedPay, amount: row.total, kind: 'in', label: `Invoice ${inv.number} (if sent today)` });
    }
    c.invoices.push(row);
  }
  for (const m of msRes.rows) {
    if (m.status !== 'open' || !m.sub || !(m.amount > 0)) continue;
    const c = contract(m.bid_id);
    // Subs are usually paid when their work is done, often net 15 to 30; we assume their due date.
    const due = m.due_on || now;
    c.subPayments.push({ id: m.id, title: m.title, sub: m.sub, amount: m.amount, due });
    events.push({ date: due < now ? now : due, amount: m.amount, kind: 'out', label: `${m.sub}: ${m.title}` });
  }

  // Running cash position from today: when do sub payments run ahead of government payments?
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'out' ? -1 : 1));
  let balance = 0;
  let worst = { amount: 0, date: null };
  const timeline = events.map((e) => {
    balance += e.kind === 'in' ? e.amount : -e.amount;
    if (balance < worst.amount) worst = { amount: balance, date: e.date };
    return { ...e, balance: Math.round(balance * 100) / 100 };
  });
  const sum = (list, pred) => list.filter(pred).reduce((t, e) => t + e.amount, 0);
  const in30 = addDays(now, 30);
  return {
    today: now,
    summary: {
      expectedIn30: sum(events, (e) => e.kind === 'in' && e.date <= in30),
      owedToSubs30: sum(events, (e) => e.kind === 'out' && e.date <= in30),
      outstanding: sum(events, (e) => e.kind === 'in' && !/if sent today/.test(e.label)),
      gap: worst.amount < 0 ? { amount: -worst.amount, date: worst.date } : null,
    },
    contracts: [...contracts.values()].filter((c) => c.bidId || c.invoices.length),
    timeline: timeline.slice(0, 60),
  };
}

module.exports = { plan, portalFor, invoiceChecks, PORTALS };
