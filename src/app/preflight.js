'use strict';

/**
 * Submission Preflight: the last check before a member sends a proposal. Reads the decrypted
 * solicitation (Section L instructions, due date, amendments, clauses that need a response) and
 * the finished draft, and returns a pass / warn / fail checklist. Rules only, no AI calls.
 * Items that can't be checked automatically (signatures, forms attached) are manual ticks the
 * member records in proposals.preflight.
 */

const WORDS_PER_PAGE = 500; // single-spaced 12-point text with headings, roughly
const DAY = 86400000;

const text = (v) => (Array.isArray(v) ? v.join('\n') : String(v || ''));
const stated = (v) => typeof v === 'string' && v.trim() && !/^not stated$/i.test(v.trim());

/** Page limit stated in the instructions, e.g. "not to exceed 15 pages" or "limited to 10 pages". */
function pageLimit(instructions) {
  const t = text(instructions);
  const m = t.match(/(?:not (?:to )?exceed|no more than|maximum of|limited to|limit(?:ed)? of|max(?:imum)?\.?)\s*(\d{1,3})\s*(?:\(\d+\)\s*)?(?:single[- ]sided\s+)?pages?/i)
    || t.match(/(\d{1,3})\s*(?:\(\d+\)\s*)?pages?\s*(?:maximum|max|limit)/i);
  const n = m ? Number.parseInt(m[1], 10) : NaN;
  return Number.isFinite(n) && n > 0 && n < 500 ? n : null;
}

/** "12-point", "Times New Roman 12", "1-inch margins" and similar format rules worth confirming. */
function formatRules(instructions) {
  const t = text(instructions);
  const rules = [];
  const font = t.match(/(\d{1,2})[- ]?(?:point|pt)\b[^.,;\n]{0,30}/i);
  if (font) rules.push(`Font: ${font[0].trim()}`);
  const face = t.match(/\b(Times New Roman|Arial|Calibri|Helvetica|Courier)\b/i);
  if (face && !(font && font[0].includes(face[0]))) rules.push(`Typeface: ${face[0]}`);
  const margin = t.match(/(\d(?:\.\d+)?|one)[- ]inch margins?|margins? of (?:at least )?(\d(?:\.\d+)?|one)[- ]inch/i);
  if (margin) rules.push(`Margins: ${margin[0].trim()}`);
  if (/single[- ]spac/i.test(t)) rules.push('Single-spaced');
  if (/double[- ]spac/i.test(t)) rules.push('Double-spaced');
  return rules;
}

/** How the offer is delivered: email, a portal (PIEE, eBuy, SAM), or hard copy. */
function deliveryOf(instructions, co) {
  const t = text(instructions);
  const out = [];
  if (/e-?mail/i.test(t) || (co && stated(co.email))) out.push('email');
  if (/PIEE|solicitation module/i.test(t)) out.push('PIEE');
  if (/eBuy/i.test(t)) out.push('GSA eBuy');
  if (/hard ?cop(y|ies)|mail(ed)? to|deliver(ed)? to|courier/i.test(t)) out.push('hard copy');
  return out;
}

const sizeLimit = (instructions) => {
  const m = text(instructions).match(/(\d{1,3})\s*(MB|megabytes?)/i);
  return m ? `${m[1]} MB` : null;
};

/** The due date if the decryptor captured a parseable one, plus the raw text with its time zone. */
function dueOf(summary) {
  const raw = stated(summary && summary.response_due) ? summary.response_due : '';
  const parsed = raw ? Date.parse(raw.replace(/\b(ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT|local time)\b/gi, '').replace(/\bat\b/i, ' ').trim()) : NaN;
  const zone = (raw.match(/\b(ET|EST|EDT|Eastern|CT|CST|CDT|Central|MT|MST|MDT|Mountain|PT|PST|PDT|Pacific|local time|Zulu|UTC)\b/i) || [])[0] || '';
  return { raw, time: Number.isFinite(parsed) ? parsed : null, zone };
}

const MANUAL = [
  { key: 'signed_forms', title: 'Required forms are signed and attached', body: 'For example the SF 1449 or SF 33 (blocks 17 and 30), SF 30 for each amendment, and any pricing sheet or attachment the solicitation lists.' },
  { key: 'reps_certs', title: 'Representations and certifications are current', body: 'FAR 52.212-3 answers live in your SAM.gov registration. Fill in any provision the solicitation says to complete in the offer.' },
  { key: 'file_names', title: 'Files are named and formatted the way Section L asks', body: 'Use the volume names, file types (usually PDF) and naming the instructions give. Open each file once after you export it.' },
  { key: 'sent_early', title: 'Plan to submit a day early', body: 'Email gateways and portals reject or delay large files. Ask the contracting officer to confirm receipt.' },
];
const MANUAL_KEYS = MANUAL.map((m) => m.key);

/**
 * @param {{ proposal: { title: string, content_md: string, preflight?: object }, summary: object|null, now?: number }} input
 * @returns {{ items: object[], score: number, ready: boolean, facts: object }}
 */
function check({ proposal, summary, now = Date.now() }) {
  const md = String(proposal.content_md || '');
  const words = (md.match(/[A-Za-z0-9$%][\w'$%.,/-]*/g) || []).length;
  const estPages = Math.max(1, Math.ceil(words / WORDS_PER_PAGE));
  const s = summary || {};
  const instructions = s.submission_instructions || [];
  const items = [];
  const add = (key, status, title, body) => items.push({ key, status, title, body });

  if (!summary) {
    add('summary', 'warn', 'No decrypted solicitation linked', 'Decrypt the solicitation and link it to this proposal so the preflight can check Section L, the due date, amendments and clause statements.');
  }

  // Unfilled placeholders: the commonest reason a submission looks unfinished.
  const placeholders = [...new Set((md.match(/\[(?:INSERT|TBD|TODO|ADD|FILL)[^\]]{0,80}\]/gi) || []).map((p) => p.slice(0, 90)))];
  if (placeholders.length) add('placeholders', 'fail', `${placeholders.length} placeholder${placeholders.length === 1 ? '' : 's'} still to fill in`, placeholders.slice(0, 8).join(' · '));
  else add('placeholders', 'pass', 'No unfilled placeholders', 'Every [INSERT ...] placeholder has been replaced.');

  // Page limit.
  const limit = pageLimit(instructions);
  if (limit) {
    const status = estPages > limit ? 'fail' : estPages > limit * 0.9 ? 'warn' : 'pass';
    add('pages', status, `Page limit: ${limit} pages`, `This draft is about ${estPages} page${estPages === 1 ? '' : 's'} (${words.toLocaleString('en-US')} words). ${status === 'pass' ? 'Within the limit.' : 'Check the exported PDF: pages over the limit are usually not read.'} Confirm whether cover, resumes or pricing count toward it.`);
  } else if (summary) {
    add('pages', 'pass', 'No page limit found', `About ${estPages} page${estPages === 1 ? '' : 's'}. The decrypted instructions do not state a limit; double-check Section L.`);
  }

  // Format rules.
  const rules = formatRules(instructions);
  if (rules.length) add('format', 'warn', 'Format rules to confirm in the exported file', rules.join(' · '));

  // Due date and time zone.
  if (summary) {
    const due = dueOf(s);
    if (!due.raw) add('due', 'warn', 'Due date not captured', 'The decryptor did not find a response date. Find it on SAM.gov or in the cover page before you plan your submission.');
    else if (due.time && due.time < now) add('due', 'fail', 'The due date has passed', `${due.raw}. Late offers are rejected unless an amendment extended the date.`);
    else {
      const days = due.time ? Math.ceil((due.time - now) / DAY) : null;
      const zoneNote = due.zone ? `Times are in ${due.zone}: convert to your own time zone.` : 'No time zone is stated: assume the contracting office\'s local time and confirm it.';
      add('due', days !== null && days <= 2 ? 'warn' : 'pass', `Due ${due.raw}`, `${days !== null ? `${days} day${days === 1 ? '' : 's'} left. ` : ''}${zoneNote}`);
    }
  }

  // Amendments.
  const amendments = Array.isArray(s.amendments) ? s.amendments.filter(stated) : [];
  if (amendments.length) {
    const ack = /amendment|SF[- ]?30/i.test(md);
    add('amendments', ack ? 'pass' : 'fail', `${amendments.length} amendment${amendments.length === 1 ? '' : 's'} to acknowledge`, `${amendments.slice(0, 4).join(' · ')}. ${ack ? 'The draft mentions amendments; make sure each one is acknowledged (signed SF 30 or block 14 of the SF 1449).' : 'The draft does not acknowledge them. Sign and include each SF 30, or list them on the SF 1449.'} Also check SAM.gov for any newer amendment.`);
  } else if (summary) {
    add('amendments', 'pass', 'No amendments in the decrypted file', 'Check the SAM.gov notice the day before you submit in case one was posted after you decrypted it.');
  }

  // Clauses that need a statement, certification or fill-in.
  const clauses = Array.isArray(s.far_clauses) ? s.far_clauses.filter((c) => c && stated(c.offeror_action) && !/^none/i.test(c.offeror_action.trim())) : [];
  if (clauses.length) {
    const missing = clauses.filter((c) => c.number && !md.includes(String(c.number).trim()));
    add('clauses', missing.length ? 'warn' : 'pass', `${clauses.length} clause${clauses.length === 1 ? '' : 's'} need${clauses.length === 1 ? 's' : ''} a response`,
      missing.length ? `Not mentioned in the draft: ${missing.slice(0, 8).map((c) => `${c.number} (${String(c.offeror_action).slice(0, 80)})`).join(' · ')}` : 'Every clause that needs a response is mentioned in the draft.');
  }

  // Delivery method and size.
  const delivery = deliveryOf(instructions, s.contracting_officer);
  if (summary) {
    const co = s.contracting_officer || {};
    const where = delivery.length ? delivery.join(' and ') : 'not clear from the decrypted instructions';
    const size = sizeLimit(instructions);
    add('delivery', delivery.length ? 'pass' : 'warn', `Submit by: ${where}`,
      [stated(co.email) ? `Send to ${co.name && stated(co.name) ? `${co.name}, ` : ''}${co.email}.` : '', size ? `File size limit: ${size}. Split volumes if needed.` : 'Most government email gateways reject attachments over 10 to 25 MB.'].filter(Boolean).join(' '));
  }

  // Pricing present.
  const hasPrice = /\$\s?\d/.test(md);
  add('pricing', hasPrice ? 'pass' : 'warn', hasPrice ? 'Pricing is in the draft' : 'No prices found in the draft',
    hasPrice ? 'Check every line item has a unit price and extended total, and that the totals add up.' : 'Add your price schedule or attach the government\'s pricing sheet before you submit.');

  // Signature / point of contact.
  const signed = /_{6,}|signature|authorized (?:official|representative)/i.test(md);
  add('signature', signed ? 'pass' : 'warn', signed ? 'Signature block present' : 'No signature block found', signed ? 'Sign it (wet or digital) before you export.' : 'Add a signature block for your authorized official on the cover letter.');

  const ticks = proposal.preflight && typeof proposal.preflight === 'object' ? proposal.preflight : {};
  for (const m of MANUAL) items.push({ ...m, status: ticks[m.key] ? 'pass' : 'todo', manual: true, doneOn: ticks[m.key] || null });

  const weights = { pass: 1, warn: 0.5, todo: 0, fail: 0 };
  const score = Math.round((items.reduce((n, i) => n + weights[i.status], 0) / items.length) * 100);
  const ready = !items.some((i) => i.status === 'fail' || i.status === 'todo');
  return { items, score, ready, facts: { words, estPages, pageLimit: limit, delivery } };
}

module.exports = { check, pageLimit, formatRules, MANUAL_KEYS };
