'use strict';

/**
 * Enterprise GovCon Autopilot. When the member presses Run it:
 *   1. reads vendor quote replies in the member's inbox,
 *   2. finds open solicitations that fit the business on SAM.gov (member's own API key),
 *   3. reads each one with its attachments and runs the Go/No-Go check (no-go is skipped),
 *   4. pulls what the government actually paid for similar work (USAspending),
 *   5. finds subcontractors and suppliers in SAM.gov and emails them for quotes,
 *   6. estimates cost per line item and prices it at the member's overhead and profit margin,
 *   7. writes the full proposal,
 * until the member's daily quota of finished bids is reached. Nothing runs on a timer.
 * Every Claude call is billed to the member's own Anthropic key, so it costs the platform nothing.
 */

const mammoth = require('mammoth');
const db = require('../db');
const ai = require('./ai');
const sam = require('./sam');
const intel = require('./intel');
const market = require('./market');
const mailbox = require('./mailbox');
const secrets = require('./secrets');
const { aiProfile } = require('./profile');
const { hasFeature } = require('./tiers');
const { documentContext, voiceContext } = require('./routes/profile');

const MAX_CANDIDATES_PER_BID = 4;       // solicitations read per finished bid before giving up for the day
const MAX_ATTACHMENTS = 4;
const MAX_DOC_BYTES = 24 * 1024 * 1024;
const SUBS_PER_BID = 5;
const QUOTE_TAG = /\[GPP-Q(\d+)\.(\d+)\]/;
const BIDDABLE = /^(solicitation|combined synopsis\/solicitation)$/i;

class AutopilotError extends Error {}

const round2 = (n) => Math.round(n * 100) / 100;
const clip = (v, max) => (typeof v === 'string' && v && !/^not stated$/i.test(v) ? v.slice(0, max) : null);
const markupFor = (marginPct) => {
  const m = Math.min(0.9, Math.max(0, Number(marginPct) / 100));
  return round2((m / (1 - m)) * 100);
};

/** The decrypted secrets and plain settings for one run. Throws a member-facing error when a key is missing. */
async function loadContext(userId) {
  const [u, s] = await Promise.all([
    db.query('SELECT * FROM "Users" WHERE id = $1', [userId]),
    db.query('SELECT * FROM autopilot_settings WHERE user_id = $1', [userId]),
  ]);
  const user = u.rows[0];
  const settings = s.rows[0];
  if (!user || !settings) throw new AutopilotError('Finish the Autopilot setup first.');
  const samKey = secrets.decrypt(settings.sam_key_enc);
  const aiKey = secrets.decrypt(settings.ai_key_enc);
  if (!samKey) throw new AutopilotError('Add your SAM.gov API key in Autopilot settings.');
  if (!aiKey) throw new AutopilotError('Add your Anthropic API key in Autopilot settings.');
  const pass = secrets.decrypt(settings.smtp_pass_enc);
  const box = settings.smtp_host && settings.smtp_user && pass ? {
    host: settings.smtp_host, port: settings.smtp_port, user: settings.smtp_user, pass,
    imapHost: settings.imap_host, imapPort: settings.imap_port, fromName: settings.from_name || user.business_name,
  } : null;
  return { user, settings, samKey, aiKey, box };
}

async function bidsToday(userId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM autopilot_items
      WHERE user_id = $1 AND stage IN ('pricing', 'writing', 'ready', 'submitted')
        AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`, [userId]);
  return rows[0].n;
}

// ---------------------------------------------------------------- quotes

/** Pulls a dollar total out of a plain reply ("Our price is $4,250.00") without spending AI. */
function quickQuote(text) {
  const body = String(text).split(/\n(?:on .+ wrote:|-{2,} ?original message)/i)[0];
  const amounts = [...body.matchAll(/\$\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/g)]
    .map((m) => Number(m[1].replace(/,/g, ''))).filter((n) => n > 0);
  if (!amounts.length) return null;
  const total = body.match(/total[^$\n]{0,30}\$\s?([0-9,]+(?:\.[0-9]{2})?)/i);
  if (total) return { total: Number(total[1].replace(/,/g, '')), lines: [] };
  if (amounts.length === 1) return { total: amounts[0], lines: [] };
  return null;
}

/** Reads quote replies from the member's inbox and files them under their opportunity. */
async function collectQuotes(ctx, log) {
  if (!ctx.box || !ctx.box.imapHost) return 0;
  let replies;
  try {
    replies = await mailbox.readReplies(ctx.box, QUOTE_TAG);
  } catch (err) {
    await log(`Could not check your inbox for quotes: ${err.message}`);
    return 0;
  }
  let added = 0;
  for (const r of replies) {
    const [, itemId, contactId] = r.subject.match(QUOTE_TAG) || [];
    if (!itemId) continue;
    const item = await db.query('SELECT id, quotes, title FROM autopilot_items WHERE id = $1 AND user_id = $2', [itemId, ctx.user.id]);
    if (!item.rows[0]) continue;
    const quotes = item.rows[0].quotes || [];
    if (quotes.some((q) => q.from === r.from && q.subject === r.subject)) continue;
    let parsed = quickQuote(r.text);
    if (!parsed) {
      try {
        const q = await ai.withMemberKey(ctx.aiKey, () => ai.parseQuoteReply({ text: r.text }));
        parsed = q.is_quote ? { total: q.total, lines: q.lines, leadTime: q.lead_time, notes: q.notes } : null;
      } catch { parsed = null; }
    }
    if (!parsed || !parsed.total) continue;
    quotes.push({ from: r.from, subject: r.subject, total: round2(parsed.total), lines: parsed.lines || [], leadTime: parsed.leadTime || '', notes: parsed.notes || '', receivedAt: r.date, subContactId: contactId });
    await db.query('UPDATE autopilot_items SET quotes = $2, updated_at = now() WHERE id = $1', [item.rows[0].id, JSON.stringify(quotes)]);
    if (contactId) await db.query('UPDATE sub_contacts SET quote = $3 WHERE id = $1 AND user_id = $2', [contactId, ctx.user.id, round2(parsed.total)]);
    await log(`Quote received: $${round2(parsed.total).toLocaleString('en-US')} from ${r.from} for "${item.rows[0].title}".`);
    added += 1;
  }
  return added;
}

function quoteEmail(ctx, item, sub, summary) {
  const u = ctx.user;
  const lines = (summary.line_items || []).slice(0, 25).map((l) => `  - ${l.item ? `${l.item}: ` : ''}${l.description} (${l.quantity} ${l.unit})`).join('\n');
  const scope = (summary.scope_of_work || []).slice(0, 8).map((s) => `  - ${s}`).join('\n');
  return {
    subject: `Request for quote: ${String(summary.title || item.title).slice(0, 120)} [GPP-Q${item.id}.${sub.id}]`,
    text: `Hello${sub.contact_name ? ` ${sub.contact_name.split(' ')[0]}` : ''},

${u.business_name || 'We'} ${u.business_name ? 'is' : 'are'} preparing a bid for a federal requirement and would like your quote as a supplier or subcontractor.

Solicitation: ${summary.solicitation_number || item.sol_number || 'see link'}
Agency: ${summary.agency || item.agency || ''}
Place of performance: ${summary.place_of_performance || ''}
Responses due to the government: ${summary.response_due || ''}
${scope ? `\nScope:\n${scope}\n` : ''}${lines ? `\nItems to price:\n${lines}\n` : ''}
Full notice: ${item.url}

Please reply to this email with your price (total and per item if you can), lead time and any conditions. Keep the reference in the subject line so it reaches the right bid.

Thank you,
${u.full_name || ''}${u.contact_title ? `, ${u.contact_title}` : ''}
${u.business_name || ''}
${[u.phone, u.email].filter(Boolean).join(' | ')}`,
  };
}

/** Sends the stored quote requests for one item through the member's mailbox. */
async function sendQuoteRequests(ctx, itemId, log = async () => {}) {
  if (!ctx.box) throw new AutopilotError('Connect your email in Autopilot settings to send quote requests.');
  const { rows: [item] } = await db.query('SELECT * FROM autopilot_items WHERE id = $1 AND user_id = $2', [itemId, ctx.user.id]);
  if (!item) throw new AutopilotError('Not found.');
  const summary = item.rfp_summary_id
    ? (await db.query('SELECT summary FROM rfp_summaries WHERE id = $1', [item.rfp_summary_id])).rows[0]?.summary || {}
    : {};
  const subs = await db.query(
    `SELECT id, company, contact_name, email, outreach FROM sub_contacts
      WHERE user_id = $1 AND bid_id = $2 AND email IS NOT NULL AND NOT (outreach ? 'quote_request')`,
    [ctx.user.id, item.bid_id]);
  let sent = 0;
  for (const sub of subs.rows) {
    const mail = quoteEmail(ctx, item, sub, summary);
    try {
      await mailbox.send(ctx.box, { to: sub.email, subject: mail.subject, text: mail.text });
      await db.query(`UPDATE sub_contacts SET outreach = outreach || jsonb_build_object('quote_request', to_char(now(), 'YYYY-MM-DD')) WHERE id = $1`, [sub.id]);
      sent += 1;
    } catch (err) {
      await log(`Could not email ${sub.company}: ${err.message}`);
      if (err instanceof mailbox.MailboxError && /sign-in|app password/.test(err.message)) break;
    }
  }
  if (sent) await log(`Emailed ${sent} vendor${sent === 1 ? '' : 's'} for quotes on "${item.title}".`);
  return sent;
}

// ---------------------------------------------------------------- one opportunity

async function solicitationFiles(o, samKey) {
  const files = [];
  let bytes = 0;
  const text = await sam.noticeDescription(o.descriptionUrl, samKey).catch(() => '');
  for (const link of o.resourceLinks || []) {
    if (files.length >= MAX_ATTACHMENTS) break;
    const f = await sam.downloadAttachment(link).catch(() => null);
    if (!f || bytes + f.bytes.length > MAX_DOC_BYTES) continue;
    bytes += f.bytes.length;
    if (f.kind === 'pdf') files.push({ name: f.name, kind: 'pdf', data: f.bytes.toString('base64') });
    else {
      const { value } = await mammoth.extractRawText({ buffer: f.bytes }).catch(() => ({ value: '' }));
      if (value.trim()) files.push({ name: f.name, kind: 'text', data: value.slice(0, 400_000) });
    }
  }
  const header = [`Title: ${o.title}`, `Notice ID: ${o.noticeId}`, `Solicitation number: ${o.solicitationNumber || ''}`, `Agency: ${o.agency}`,
    `Office: ${o.office || ''}`, `Notice type: ${o.type}`, `NAICS: ${o.naics}`, `Set-aside: ${o.setAside || 'None'}`,
    `Place of performance: ${[o.city, o.state].filter(Boolean).join(', ')}`, `Response deadline: ${o.responseDeadline || 'Not stated'}`,
    `Point of contact: ${o.contact || ''}`, `Link: ${o.url}`].join('\n');
  return { files, text: `${header}\n\n${text || '(No description text was posted with this notice.)'}` };
}

/** Finds subcontractors and suppliers on SAM.gov near the work and saves them to the member's list. */
async function findSubs(ctx, item, o, summary) {
  const state = o.state || (String(summary.place_of_performance || '').match(/\b([A-Z]{2})\b(?:\s+\d{5})?\s*$/) || [])[1];
  if (!state) return [];
  const code = String(summary.naics || o.naics || '').match(/\d{6}/);
  if (!code) return [];
  let result;
  try {
    result = await intel.cached(`sam:ent:${code[0]}:${state}`, 7 * 86400_000, () => sam.searchEntities({ naics: code[0], state }, ctx.samKey));
  } catch {
    return [];
  }
  const own = String(ctx.user.uei || '').toUpperCase();
  const picked = (result.entities || []).filter((e) => e.company && e.uei !== own).slice(0, SUBS_PER_BID);
  const saved = [];
  for (const e of picked) {
    const { rows } = await db.query(
      `INSERT INTO sub_contacts (user_id, bid_id, company, contact_name, email, phone, trade, location, website, uei, cage, source, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'sam', $12) RETURNING id, company, contact_name, email`,
      [ctx.user.id, item.bid_id, e.company.slice(0, 200), clip(e.contactName, 120), /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email) ? e.email.slice(0, 254) : null,
        clip(e.phone, 40), `NAICS ${code[0]}`, clip(e.location, 200), clip(e.website, 200), clip(e.uei, 12), clip(e.cage, 5),
        `Found by Autopilot for ${String(item.title).slice(0, 120)}`]);
    saved.push(rows[0]);
  }
  return saved;
}

/** Builds the pricing sheet at the member's overhead and margin, and the price table for the proposal. */
async function buildPricing(ctx, item, summary, estimate) {
  const overheadPct = Number(ctx.settings.overhead_pct);
  const markupPct = markupFor(ctx.settings.margin_pct);
  const items = (estimate.items || []).slice(0, 60).map((it, i) => ({
    item: String(it.item || String(i + 1).padStart(4, '0')).slice(0, 20),
    description: String(it.description || '').slice(0, 300),
    unit: String(it.unit || 'EA').slice(0, 30),
    quantity: String(Number(it.quantity) > 0 ? Number(it.quantity) : 1),
    cost: String(round2(Math.max(0, Number(it.cost) || 0))),
    basis: String(it.basis || '').slice(0, 300),
  }));
  const data = { overheadPct, markupPct, items, extras: [], labor: [], fringePct: 30, laborOverheadPct: 40, gaPct: 10, feePct: 8,
    autopilot: { marginPct: Number(ctx.settings.margin_pct), assumptions: estimate.assumptions || [], confidence: estimate.confidence } };
  const line = items.map((it) => {
    const unitPrice = round2(Number(it.cost) * (1 + overheadPct / 100) * (1 + markupPct / 100));
    const quantity = Number(it.quantity);
    return { item: it.item, description: it.description, unit: it.unit, quantity, unit_price: unitPrice, total: round2(unitPrice * quantity) };
  });
  const total = round2(line.reduce((t, l) => t + l.total, 0));
  const { rows } = await db.query(
    `INSERT INTO pricing_sheets (user_id, bid_id, title, data, total) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [ctx.user.id, item.bid_id, `Autopilot: ${String(summary.title || item.title).slice(0, 180)}`, JSON.stringify(data), total]);
  return {
    sheetId: rows[0].id,
    pricing: {
      line_items: line,
      subtotal: total,
      other_charges: [],
      total,
      note: `Costs are estimates (${estimate.confidence} confidence) built from comparable federal awards and stated assumptions. The member confirms them with vendor quotes before submitting.`,
    },
  };
}

async function processOpportunity(ctx, run, o, log) {
  const { user, settings } = ctx;
  const ins = await db.query(
    `INSERT INTO autopilot_items (user_id, run_id, notice_id, title, agency, sol_number, due_at, url, score, stage, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'reading', $10)
     ON CONFLICT (user_id, notice_id) DO NOTHING RETURNING *`,
    [user.id, run.id, String(o.noticeId).slice(0, 100), String(o.title || 'Untitled').slice(0, 300), clip(o.agency, 300), clip(o.solicitationNumber, 100),
      Number.isFinite(Date.parse(o.responseDeadline)) ? new Date(o.responseDeadline) : null, String(o.url).slice(0, 500), o.score, (o.reasons || []).join(' · ').slice(0, 400)]);
  const item = ins.rows[0];
  if (!item) return 'seen';
  const stage = (s, extra = {}) => {
    const keys = Object.keys(extra);
    return db.query(`UPDATE autopilot_items SET stage = $2, updated_at = now()${keys.map((k, i) => `, ${k} = $${i + 3}`).join('')} WHERE id = $1`,
      [item.id, s, ...keys.map((k) => extra[k])]);
  };
  try {
    await log(`Reading "${item.title}" (${o.agency}).`);
    const docs = await solicitationFiles(o, ctx.samKey);
    const sumRow = await db.query('INSERT INTO rfp_summaries (user_id, file_name) VALUES ($1, $2) RETURNING id',
      [user.id, (docs.files.map((f) => f.name).join(', ') || 'SAM.gov notice').slice(0, 200)]);
    const summaryId = sumRow.rows[0].id;
    await stage('reading', { rfp_summary_id: summaryId });
    const profile = aiProfile(user);
    let summary;
    try {
      summary = await ai.withMemberKey(ctx.aiKey, () => ai.decryptRfp({ files: docs.files, text: docs.text, profile }));
      await db.query(`UPDATE rfp_summaries SET status = 'ready', summary = $2, completed_at = now() WHERE id = $1`, [summaryId, summary]);
    } catch (err) {
      await db.query(`UPDATE rfp_summaries SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`, [summaryId, String(err.message).slice(0, 300)]);
      throw err;
    }
    const g = summary.go_no_go || {};
    if (g.verdict === 'no_go') {
      await stage('skipped', { reason: `No-go: ${String(g.headline || (g.disqualifiers || []).join('; ')).slice(0, 380)}` });
      await log(`Skipped "${item.title}": ${g.headline || 'you are not eligible'}.`);
      return 'skipped';
    }

    const bid = await db.query(
      `INSERT INTO bids (user_id, title, agency, solicitation_number, naics, set_aside, place_of_performance, due_at, notes, stage, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pricing', (SELECT COALESCE(max(position) + 1, 0) FROM bids WHERE user_id = $1 AND stage = 'pricing'))
       RETURNING id`,
      [user.id, (clip(summary.title, 200) || item.title.slice(0, 200)), clip(summary.agency, 200) || clip(o.agency, 200), clip(summary.solicitation_number, 100) || item.sol_number,
        (clip(summary.naics, 20) || o.naics || '').slice(0, 20) || null, clip(summary.set_aside, 60), clip(summary.place_of_performance, 200),
        item.due_at, [`Found by Autopilot. ${o.url}`, clip(summary.response_due, 200) && `Response due: ${summary.response_due}`, clip(summary.executive_summary, 3000)].filter(Boolean).join('\n\n')]);
    item.bid_id = bid.rows[0].id;
    await db.query('UPDATE rfp_summaries SET bid_id = $2 WHERE id = $1', [summaryId, item.bid_id]);
    await stage('quoting', { bid_id: item.bid_id });

    const comps = await market.comparables({ naics: summary.naics || o.naics, title: summary.title || o.title, agency: summary.agency || o.agency })
      .catch(() => ({ basis: 'Award data unavailable', count: 0, awards: [] }));
    await stage('quoting', { market: JSON.stringify(comps) });
    if (comps.count) await log(`Market check: ${comps.count} similar awards (${comps.basis}), median $${Number(comps.median).toLocaleString('en-US')}.`);

    const subs = await findSubs(ctx, item, o, summary);
    if (subs.length) {
      await log(`Found ${subs.length} possible subcontractors or suppliers on SAM.gov.`);
      if (ctx.box && settings.auto_email) await sendQuoteRequests(ctx, item.id, log);
    }

    await stage('pricing');
    const estimate = await ai.withMemberKey(ctx.aiKey, () => ai.estimatePricing({ summary, market: comps, quotes: [], profile }));
    const { sheetId, pricing } = await buildPricing(ctx, item, summary, estimate);
    await stage('writing', { pricing_sheet_id: sheetId });
    await log(`Priced at $${pricing.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} with ${Number(settings.overhead_pct)}% overhead and a ${Number(settings.margin_pct)}% profit margin.`);

    const title = `Proposal: ${String(summary.title || item.title)}`.slice(0, 200);
    const prop = await db.query(
      `INSERT INTO proposals (user_id, bid_id, rfp_summary_id, title, own_key) VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [user.id, item.bid_id, summaryId, title]);
    const proposalId = prop.rows[0].id;
    await stage('writing', { proposal_id: proposalId });
    await db.query(`UPDATE bids SET stage = 'drafting' WHERE id = $1`, [item.bid_id]);
    try {
      const documents = await documentContext(user.id);
      const voice = hasFeature(user.tier, 'winning_voice') ? await voiceContext(user.id, JSON.stringify([summary.title, summary.scope_of_work])) : [];
      const md = await ai.withMemberKey(ctx.aiKey, () => ai.writeProposal({
        bid: null, summary, profile, documents, voice, title, pricing,
        contract: { type: clip(summary.contract_type, 80) || 'Not stated', delivery_and_lead_time: 'Not stated' },
        instructions: `Written by the GovCon Autopilot. The member's role: ${settings.role}. Prices come from <pricing>; keep the note that they must be confirmed before submission.`,
      }));
      await db.query(`UPDATE proposals SET status = 'ready', content_md = $2, completed_at = now() WHERE id = $1`, [proposalId, md]);
    } catch (err) {
      await db.query(`UPDATE proposals SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`, [proposalId, String(err.message).slice(0, 300)]);
      throw err;
    }
    await stage('ready');
    await log(`Ready for your review: "${item.title}".`);
    return 'ready';
  } catch (err) {
    const msg = err instanceof sam.SamError ? err.userMessage || 'SAM.gov did not answer.'
      : err instanceof ai.AiError || err instanceof AutopilotError ? err.message : 'Something went wrong on this one.';
    if (!(err instanceof ai.AiError)) console.error(`[autopilot] item ${item.id} failed:`, err.message);
    await stage('failed', { reason: msg.slice(0, 400) });
    await log(`Stopped on "${item.title}": ${msg}`);
    if (err instanceof ai.AiError && /credit|billing|api key|authentication|permission/i.test(err.message)) throw err;
    return 'failed';
  }
}

// ---------------------------------------------------------------- the run

async function run(userId, runId, requested) {
  const logs = [];
  const log = async (msg) => {
    logs.push({ at: new Date().toISOString(), msg: String(msg).slice(0, 400) });
    await db.query('UPDATE autopilot_runs SET log = $2 WHERE id = $1', [runId, JSON.stringify(logs)]);
  };
  try {
    const ctx = await loadContext(userId);
    const runRow = { id: runId };
    await collectQuotes(ctx, log);

    const remaining = Math.max(0, Math.min(requested, ctx.settings.daily_quota - await bidsToday(userId)));
    if (!remaining) {
      await log(`Today's quota of ${ctx.settings.daily_quota} bid${ctx.settings.daily_quota === 1 ? '' : 's'} is done. Raise it in settings or run again tomorrow.`);
    } else {
      const codes = intel.naicsList(ctx.settings.naics || ctx.user.naics);
      if (!codes.length) throw new AutopilotError('Add at least one NAICS code in Autopilot settings.');
      await log(`Searching SAM.gov for NAICS ${codes.join(', ')}.`);
      const lists = [];
      for (const code of codes) {
        try { lists.push(await intel.opportunitiesFor(code, ctx.samKey)); } catch (err) {
          if (err instanceof sam.SamError) throw new AutopilotError(err.userMessage || 'SAM.gov did not answer. Try again later.');
          throw err;
        }
      }
      const states = String(ctx.settings.states || '').toUpperCase().match(/\b[A-Z]{2}\b/g) || [];
      const words = String(ctx.settings.keywords || '').toLowerCase().split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
      const minDays = Number(ctx.settings.min_days_left) || 0;
      const seen = new Set((await db.query('SELECT notice_id FROM autopilot_items WHERE user_id = $1', [userId])).rows.map((r) => r.notice_id));
      const candidates = intel.scoreOpportunities(ctx.user, codes, lists.flat())
        .filter((o) => BIDDABLE.test(o.type || '') && !seen.has(String(o.noticeId)))
        .filter((o) => !states.length || !o.state || states.includes(o.state))
        .filter((o) => !minDays || !o.responseDeadline || Date.parse(o.responseDeadline) - Date.now() >= minDays * 86400000)
        .map((o) => {
          const hits = words.filter((w) => String(o.title).toLowerCase().includes(w));
          return hits.length ? { ...o, score: Math.min(99, o.score + 8 * hits.length), reasons: [...o.reasons, `Mentions ${hits.join(', ')}`] } : o;
        })
        .sort((a, b) => b.score - a.score);
      await log(candidates.length ? `Found ${candidates.length} open solicitation${candidates.length === 1 ? '' : 's'} that fit. Working on the best ${Math.min(remaining, candidates.length)}.` : 'No new open solicitations fit your settings today.');
      let done = 0;
      let tried = 0;
      for (const o of candidates) {
        if (done >= remaining || tried >= remaining * MAX_CANDIDATES_PER_BID) break;
        tried += 1;
        const outcome = await processOpportunity(ctx, runRow, o, log);
        if (outcome === 'ready') done += 1;
      }
      await log(done ? `Done: ${done} bid${done === 1 ? '' : 's'} ready for your review.` : 'Finished without a bid ready today.');
    }
    await db.query(`UPDATE autopilot_runs SET status = 'done', completed_at = now() WHERE id = $1`, [runId]);
  } catch (err) {
    const msg = err instanceof AutopilotError || err instanceof ai.AiError ? err.message : 'The run stopped unexpectedly. Please try again.';
    if (!(err instanceof AutopilotError)) console.error(`[autopilot] run ${runId} failed:`, err.message);
    await log(msg).catch(() => {});
    await db.query(`UPDATE autopilot_runs SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`, [runId, msg.slice(0, 300)]);
  }
}

/** Runs and items cut off by a restart or deploy. A run can take a while, so allow three hours. */
async function failInterruptedRuns() {
  await db.query(`UPDATE autopilot_runs SET status = 'failed', error = 'Interrupted by a system update. Run it again.', completed_at = now()
                   WHERE status = 'working' AND created_at < now() - interval '3 hours'`);
  await db.query(`UPDATE autopilot_items SET stage = 'failed', reason = 'Interrupted by a system update.', updated_at = now()
                   WHERE stage IN ('reading', 'quoting', 'pricing', 'writing') AND updated_at < now() - interval '3 hours'`);
}

module.exports = { run, loadContext, collectQuotes, sendQuoteRequests, failInterruptedRuns, quickQuote, markupFor, AutopilotError };
