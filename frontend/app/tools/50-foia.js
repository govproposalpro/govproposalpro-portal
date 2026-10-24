  // ------------------------------------------------------------------ FOIA Automator

  const FOIA_AGENCIES = [
    'Department of Veterans Affairs', 'Department of Defense', 'Department of the Army', 'Department of the Navy', 'Department of the Air Force',
    'Defense Logistics Agency', 'General Services Administration', 'Department of Homeland Security', 'Department of Health and Human Services',
    'Department of Agriculture', 'Department of the Interior', 'Department of Energy', 'Department of Justice', 'Department of Transportation',
    'Department of Commerce', 'Department of State', 'Department of the Treasury', 'Department of Labor', 'Department of Education',
    'Department of Housing and Urban Development', 'Environmental Protection Agency', 'National Aeronautics and Space Administration',
    'Small Business Administration', 'Social Security Administration', 'U.S. Army Corps of Engineers', 'Federal Bureau of Prisons',
    'National Park Service', 'U.S. Forest Service', 'Indian Health Service', 'U.S. Coast Guard',
  ];

  const FOIA_WANTS = {
    award: 'A copy of the awarded contract, including the price schedule (Section B) and any modifications',
    proposal: 'The winning offeror\'s price proposal and technical proposal, with exempt material redacted',
    abstract: 'The price abstract or bid tabulation listing every offeror\'s total price',
    evaluation: 'The source selection decision document and the evaluation of the winning offer',
  };

  const STATUS_PILL = {
    draft: '<span class="pill bg-white/[0.06] text-mist-300">Draft</span>',
    sent: '<span class="pill bg-brand-blue/15 text-brand-blueSoft">Sent</span>',
    received: '<span class="pill bg-emerald-500/15 text-emerald-300">Received</span>',
  };

  function foiaLetter(f) {
    const u = state.me.user;
    const wants = (f.wants || []).map((k) => `- ${FOIA_WANTS[k]}`).join('\n');
    return `${fmtDate(today())}

FOIA Officer
${f.agency}${f.office ? `\n${f.office}` : ''}

Re: Freedom of Information Act Request, ${f.subject}

Dear FOIA Officer:

Under the Freedom of Information Act, 5 U.S.C. § 552, I request copies of the following records relating to ${f.contractNumber ? `contract number ${f.contractNumber}` : 'the contract described below'}${f.solicitationNumber ? `, awarded under solicitation ${f.solicitationNumber}` : ''}${f.awardee ? `, awarded to ${f.awardee}` : ''}:

${wants || '- [INSERT: the records you want]'}
${f.extra ? `\nAdditional detail: ${f.extra}\n` : ''}
I understand that information protected under Exemption 4 (trade secrets and confidential commercial information) may be withheld. Please release all reasonably segregable portions, including unit and total prices, which are routinely released once a contract is awarded.

I am a small business requesting these records for commercial use, and I agree to pay fees up to $${num(f.feeLimit) || 50}. Please contact me before incurring fees above that amount. I prefer to receive the records electronically by email.

If you deny any part of this request, please cite the specific exemption and tell me how to appeal.

Thank you for your help.

Sincerely,

${memberName()}
${memberCompany()}
${[u.address].filter(Boolean).join('\n')}
${[u.phone, u.email].filter(Boolean).join(' · ')}`;
  }

  function foiaModal(item, bids, onSaved) {
    const f = Object.assign({ wants: ['award', 'abstract'], feeLimit: 50 }, item ? item.data : {}, item ? { agency: item.agency, subject: item.subject } : {});
    openModal(`
      <h2 class="text-lg font-semibold text-white">${item ? 'Edit FOIA request' : 'New FOIA request'}</h2>
      <p class="mt-1 text-sm text-mist-400">Ask for the winning price on a past contract so you know the price to beat next time.</p>
      <form id="foia-form" class="mt-5 space-y-4" novalidate>
        <div class="grid gap-4 sm:grid-cols-2">
          <div><label class="label" for="ff-agency">Agency</label><input id="ff-agency" name="agency" class="field" list="ff-agencies" maxlength="200" required value="${esc(f.agency)}" />
            <datalist id="ff-agencies">${FOIA_AGENCIES.map((a) => `<option value="${esc(a)}"></option>`).join('')}</datalist></div>
          <div><label class="label" for="ff-office">Office or contracting activity (optional)</label><input id="ff-office" name="office" class="field" maxlength="200" value="${esc(f.office)}" /></div>
          <div class="sm:col-span-2"><label class="label" for="ff-subject">What contract is this about?</label><input id="ff-subject" name="subject" class="field" maxlength="300" required placeholder="e.g. Grounds maintenance, VA Medical Center Tampa" value="${esc(f.subject)}" /></div>
          <div><label class="label" for="ff-contract">Contract or award number</label><input id="ff-contract" name="contractNumber" class="field" maxlength="80" value="${esc(f.contractNumber)}" /></div>
          <div><label class="label" for="ff-sol">Solicitation number</label><input id="ff-sol" name="solicitationNumber" class="field" maxlength="80" value="${esc(f.solicitationNumber)}" /></div>
          <div><label class="label" for="ff-awardee">Awardee (if known)</label><input id="ff-awardee" name="awardee" class="field" maxlength="200" value="${esc(f.awardee)}" /></div>
          <div><label class="label" for="ff-bid">Link to opportunity</label><select id="ff-bid" name="bidId" class="field">${bidOptions(bids, item && item.bidId)}</select></div>
        </div>
        <fieldset><legend class="label">Records to request</legend><div class="grid gap-2">${Object.entries(FOIA_WANTS).map(([k, l]) =>
          `<label class="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-mist-200"><input type="checkbox" name="wants" value="${k}" class="mt-0.5" ${f.wants.includes(k) ? 'checked' : ''} />${esc(l)}</label>`).join('')}</div></fieldset>
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="sm:col-span-2"><label class="label" for="ff-extra">Anything else (optional)</label><input id="ff-extra" name="extra" class="field" maxlength="500" value="${esc(f.extra)}" /></div>
          <div><label class="label" for="ff-fee">Fee limit ($)</label><input id="ff-fee" name="feeLimit" class="field" inputmode="decimal" value="${esc(f.feeLimit)}" /></div>
        </div>
        <p id="ff-error" class="hidden text-sm text-brand-redSoft" role="alert"></p>
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" data-close>Cancel</button><button type="submit" class="btn-primary">Write the letter</button></div>
      </form>`);
    const form = $('#foia-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = (n) => form.elements[n].value.trim();
      const data = { office: v('office'), contractNumber: v('contractNumber'), solicitationNumber: v('solicitationNumber'), awardee: v('awardee'),
        extra: v('extra'), feeLimit: v('feeLimit'), wants: $$('[name=wants]:checked', form).map((c) => c.value) };
      const body = { agency: v('agency'), subject: v('subject'), bidId: v('bidId') ? Number(v('bidId')) : null, data,
        letter: foiaLetter({ ...data, agency: v('agency'), subject: v('subject') }) };
      try {
        const saved = item ? await api('/foia/' + item.id, { method: 'PATCH', body }) : await api('/foia', { method: 'POST', body });
        $('[data-close]').click();
        onSaved(saved.item);
      } catch (err) { const el = $('#ff-error'); el.textContent = err.message; el.classList.remove('hidden'); }
    });
  }

  async function viewFoia(view) {
    const [{ items }, bids] = await Promise.all([api('/foia'), loadBids()]);
    let openId = null;
    // Rendered into a fresh element so its click handler goes away with the page.
    view.innerHTML = '<div></div>';
    const root = view.firstElementChild;
    const draw = () => {
      root.innerHTML = `
        ${pageHead('FOIA Automator', 'Request the winning price on past contracts. Agencies must answer within 20 business days.',
          `<a href="https://www.foia.gov/agency-search.html" target="_blank" rel="noopener noreferrer" class="btn-ghost">Find an agency's FOIA office</a>
           <button id="foia-new" class="btn-primary">${icon('plus', 'h-4 w-4')}New request</button>`)}
        ${items.length ? `<div class="grid gap-3">${items.map((r) => {
          const due = r.sentOn ? addBusinessDays(r.sentOn, 20) : null;
          const late = due && r.status === 'sent' && daysUntil(due) < 0;
          return `<article class="card p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0"><p class="flex flex-wrap items-center gap-2 font-semibold text-white">${esc(r.subject)} ${STATUS_PILL[r.status] || ''}</p>
                <p class="mt-1 text-sm text-mist-400">${esc(r.agency)}${r.sentOn ? ` · sent ${fmtDate(r.sentOn)}` : ''}${due && r.status === 'sent' ? ` · <span class="${late ? 'text-brand-redSoft' : ''}">answer due ${fmtDate(due)}${late ? ' (overdue, follow up)' : ''}</span>` : ''}</p></div>
              <div class="flex flex-wrap gap-2">
                <button class="btn-ghost !py-2" data-view="${r.id}">${openId === r.id ? 'Hide letter' : 'Letter'}</button>
                <button class="btn-ghost !py-2" data-edit="${r.id}">Edit</button>
                ${r.status === 'draft' ? `<button class="btn-primary !py-2" data-sent="${r.id}">Mark sent</button>` : r.status === 'sent' ? `<button class="btn-primary !py-2" data-got="${r.id}">Records received</button>` : ''}
                <button class="btn-ghost !py-2" data-del="${r.id}" aria-label="Delete">&times;</button>
              </div>
            </div>
            ${openId === r.id ? `<div class="mt-4"><pre class="whitespace-pre-wrap rounded-2xl border border-white/[0.06] bg-ink-900 p-5 font-sans text-sm leading-relaxed text-mist-200">${esc(r.letter)}</pre>
              <div class="mt-3 flex flex-wrap gap-2"><button class="btn-ghost" data-copy="${r.id}">Copy</button><button class="btn-ghost" data-word="${r.id}">Download Word</button>
              <button class="btn-ghost" data-mail="${r.id}">${icon('mail', 'h-4 w-4')}Open in email</button></div>
              <p class="mt-2 text-xs text-mist-500">Most agencies take requests by email or through their online portal. Find the address with the agency's FOIA office link above.</p></div>` : ''}
          </article>`;
        }).join('')}</div>`
          : emptyState('No FOIA requests yet', 'Pick a contract like the ones you bid on and request its winning price. Knowing the price to beat is the fastest way to win.', '<button id="foia-new2" class="btn-primary">Write your first request</button>')}`;
    };
    draw();
    const find = (id) => items.find((r) => r.id === String(id));
    const saved = (it) => { const i = items.findIndex((r) => r.id === it.id); if (i >= 0) items[i] = it; else items.unshift(it); openId = it.id; draw(); };
    root.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      const d = t.dataset;
      try {
        if (t.id === 'foia-new' || t.id === 'foia-new2') foiaModal(null, bids, saved);
        else if (d.view) { openId = openId === d.view ? null : d.view; draw(); }
        else if (d.edit) foiaModal(find(d.edit), bids, saved);
        else if (d.sent) saved((await api('/foia/' + d.sent, { method: 'PATCH', body: { status: 'sent', sentOn: today() } })).item);
        else if (d.got) saved((await api('/foia/' + d.got, { method: 'PATCH', body: { status: 'received' } })).item);
        else if (d.copy) copyText(find(d.copy).letter);
        else if (d.word) { const r = find(d.word); wordDoc('FOIA request ' + r.subject, `<pre style="font-family:Calibri,Arial,sans-serif;white-space:pre-wrap">${esc(r.letter)}</pre>`); }
        else if (d.mail) { const r = find(d.mail); mailto({ subject: `FOIA Request: ${r.subject}`, body: r.letter }); }
        else if (d.del && confirm('Delete this FOIA request?')) { await api('/foia/' + d.del, { method: 'DELETE' }); items.splice(items.findIndex((r) => r.id === String(d.del)), 1); draw(); }
      } catch (err) { toast(err.message, 'error'); }
    });
  }
