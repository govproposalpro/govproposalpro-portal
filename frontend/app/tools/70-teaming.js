  // ------------------------------------------------------------------ Auto-Teaming Legal Engine (Enterprise)

  const LEGAL_KIND = { nda: 'Mutual NDA', teaming: 'Teaming Agreement' };

  function legalDefaults(kind, sub, bid) {
    const u = state.me.user;
    return {
      primeName: u.businessName || '', primeAddress: u.address || '', primeSigner: u.fullName || '', primeTitle: 'Owner',
      subName: sub ? sub.company : '', subAddress: sub ? sub.location || '' : '', subSigner: sub ? sub.contactName || '' : '', subTitle: '',
      effective: today(), governingState: '', termYears: kind === 'nda' ? '2' : '',
      solicitation: bid ? [bid.title, bid.solicitationNumber].filter(Boolean).join(', ') : '', agency: bid ? bid.agency || '' : '',
      purpose: bid ? `preparing a proposal for ${bid.title}` : 'evaluating and pursuing federal contract opportunities together',
      subScope: sub && sub.trade ? sub.trade : '', subShare: '', exclusive: true, setAside: Boolean(bid && bid.setAside),
    };
  }

  const F = (v, ph) => (String(v || '').trim() ? esc(v) : `<span class="cap-ph">[INSERT: ${ph}]</span>`);

  function ndaHtml(t) {
    return `<h1>Mutual Non-Disclosure Agreement</h1>
      <p>This Mutual Non-Disclosure Agreement (the "Agreement") is made effective ${F(t.effective && fmtDate(t.effective), 'date')} between <b>${F(t.primeName, 'your company')}</b>, located at ${F(t.primeAddress, 'address')}, and <b>${F(t.subName, 'other company')}</b>, located at ${F(t.subAddress, 'address')} (each a "Party").</p>
      <h2>1. Purpose</h2><p>The Parties wish to share information for the purpose of ${F(t.purpose, 'purpose')} (the "Purpose").</p>
      <h2>2. Confidential Information</h2><p>"Confidential Information" means any non-public business, technical, pricing, cost, customer or proposal information disclosed by one Party to the other, in any form, that is marked confidential or that a reasonable person would understand to be confidential. It does not include information that is or becomes public through no fault of the receiving Party, was already known to the receiving Party, is independently developed, or is received lawfully from a third party without restriction.</p>
      <h2>3. Obligations</h2><p>The receiving Party will use Confidential Information only for the Purpose, protect it with at least reasonable care, and share it only with employees and advisors who need it for the Purpose and are bound by similar obligations. A Party may disclose information required by law or court order after giving prompt notice, where lawful.</p>
      <h2>4. Pricing and proposal data</h2><p>Each Party's pricing, labor rates and proposal content are Confidential Information and will not be used to compete against the disclosing Party on the opportunity described in the Purpose.</p>
      <h2>5. Non-solicitation</h2><p>During the term, neither Party will use Confidential Information to solicit the other Party's government customer on the opportunity described above, or its employees, without written consent.</p>
      <h2>6. Term and return</h2><p>This Agreement lasts ${F(t.termYears, 'number')} years from the effective date. Obligations survive for two years after it ends. On request, each Party will return or destroy the other's Confidential Information.</p>
      <h2>7. No obligation</h2><p>This Agreement does not create a partnership, joint venture or obligation to enter into any further agreement. All information is provided "as is".</p>
      <h2>8. Governing law</h2><p>This Agreement is governed by the laws of the State of ${F(t.governingState, 'state')}.</p>
      ${sigBlock(t)}`;
  }

  function teamingHtml(t) {
    return `<h1>Teaming Agreement</h1>
      <p>This Teaming Agreement (the "Agreement") is made effective ${F(t.effective && fmtDate(t.effective), 'date')} between <b>${F(t.primeName, 'your company')}</b>, located at ${F(t.primeAddress, 'address')} ("Prime"), and <b>${F(t.subName, 'subcontractor')}</b>, located at ${F(t.subAddress, 'address')} ("Subcontractor"), under FAR Subpart 9.6, Contractor Team Arrangements.</p>
      <h2>1. Opportunity</h2><p>The Parties will team to pursue ${F(t.solicitation, 'solicitation title and number')}${t.agency ? ` issued by ${esc(t.agency)}` : ''} (the "Opportunity"). Prime will submit the proposal as prime contractor.</p>
      <h2>2. Responsibilities</h2><p>Prime will lead the proposal, own the customer relationship and price the bid. Subcontractor will provide the technical, pricing and past performance information Prime reasonably requests, on time, for the following scope: ${F(t.subScope, 'subcontractor scope of work')}.</p>
      <h2>3. Workshare</h2><p>If Prime is awarded the contract, Prime will offer Subcontractor a subcontract for the scope above, estimated at ${F(t.subShare, 'percent')}% of the contract value, subject to the customer's approval and final negotiation.${t.setAside ? ' Both Parties acknowledge that this Opportunity is set aside and that Prime must comply with the limitations on subcontracting in FAR 52.219-14 (or the clause stated in the solicitation), so the workshare will be adjusted as needed to keep Prime compliant.' : ''}</p>
      <h2>4. Exclusivity</h2><p>${t.exclusive ? 'Neither Party will join another team, or submit its own proposal, for the Opportunity while this Agreement is in effect.' : 'This Agreement is not exclusive. Each Party may participate in other proposals for the Opportunity, but will not share the other Party\'s information with them.'}</p>
      <h2>5. Proprietary information</h2><p>Information exchanged under this Agreement is confidential, will be marked as proprietary where appropriate, and will be used only for the Opportunity. Each Party bears its own proposal costs.</p>
      <h2>6. Term</h2><p>This Agreement ends on the earliest of: execution of the subcontract; the customer's award to another offeror or cancellation of the Opportunity; Prime's decision not to bid, given in writing; one year from the effective date; or mutual written agreement.</p>
      <h2>7. Compliance</h2><p>Each Party will comply with applicable law, including the Procurement Integrity Act, the Anti-Kickback Act and organizational conflict of interest rules, and will notify the other promptly if it is suspended, debarred or loses its SAM.gov registration.</p>
      <h2>8. Independent contractors</h2><p>The Parties are independent contractors. Nothing here creates a partnership, joint venture or agency.</p>
      <h2>9. Governing law</h2><p>This Agreement is governed by the laws of the State of ${F(t.governingState, 'state')}.</p>
      ${sigBlock(t)}`;
  }

  const sigBlock = (t) => `<h2>Signatures</h2><table><tr>
      <td><b>${F(t.primeName, 'your company')}</b><br><br>Signature: ______________________<br>Name: ${F(t.primeSigner, 'name')}<br>Title: ${F(t.primeTitle, 'title')}<br>Date: ____________</td>
      <td><b>${F(t.subName, 'other company')}</b><br><br>Signature: ______________________<br>Name: ${F(t.subSigner, 'name')}<br>Title: ${F(t.subTitle, 'title')}<br>Date: ____________</td></tr></table>`;

  const LEGAL_NOTE = 'A starting draft, not legal advice. Have an attorney review it before you sign.';

  async function viewTeaming(view) {
    const [{ items }, bids, subs] = await Promise.all([api('/legal'), loadBids(), loadSubs()]);
    view.innerHTML = `
      ${pageHead('Auto-Teaming Legal Engine', 'Mutual NDAs and FAR 9.6 teaming agreements, filled in from your profile, your sub and the opportunity.',
        `<button id="lg-new" class="btn-primary">${icon('plus', 'h-4 w-4')}New agreement</button>`)}
      ${items.length ? `<div class="card overflow-x-auto p-5"><table class="tbl"><thead><tr><th>Agreement</th><th>Type</th><th>Updated</th></tr></thead><tbody>${items.map((x) => `
        <tr><td><a href="/app/teaming/${x.id}" data-link class="font-medium text-white hover:text-brand-blueSoft">${esc(x.title)}</a></td><td class="text-mist-300">${LEGAL_KIND[x.kind]}</td><td class="text-mist-400">${fmtDate(x.updatedAt)}</td></tr>`).join('')}</tbody></table></div>`
        : emptyState('No agreements yet', 'Sign an NDA before you share pricing with a sub, then a teaming agreement before you submit together.', '<button id="lg-new2" class="btn-primary">Draft your first agreement</button>')}
      <p class="mt-4 text-xs text-mist-500">${LEGAL_NOTE}</p>`;
    const open = () => {
      openModal(`
        <h2 class="text-lg font-semibold text-white">New agreement</h2>
        <form id="lg-form" class="mt-5 space-y-4">
          <div class="seg" role="radiogroup">${Object.entries(LEGAL_KIND).map(([k, l], i) => `<label class="cursor-pointer"><input type="radio" name="kind" value="${k}" class="sr-only" ${i ? '' : 'checked'} /><span>${l}</span></label>`).join('')}</div>
          <div><label class="label" for="lg-sub">Other company (from your subcontractors)</label>
            <select id="lg-sub" name="sub" class="field"><option value="">Type it in on the next page</option>${subs.map((s) => `<option value="${s.id}">${esc(s.company)}</option>`).join('')}</select></div>
          <div><label class="label" for="lg-bid">Opportunity</label><select id="lg-bid" name="bid" class="field">${bidOptions(bids, null)}</select></div>
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" data-close>Cancel</button><button class="btn-primary">Draft it</button></div>
        </form>`);
      $('#lg-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target.elements;
        const kind = $('[name=kind]:checked', e.target).value;
        const sub = subs.find((s) => String(s.id) === f.sub.value);
        const bid = bids.find((b) => String(b.id) === f.bid.value);
        try {
          const { item } = await api('/legal', { method: 'POST', body: {
            kind, bidId: bid ? bid.id : null, data: legalDefaults(kind, sub, bid),
            title: `${LEGAL_KIND[kind]}${sub ? ' with ' + sub.company : ''}`.slice(0, 200) } });
          $('[data-close]').click();
          navigate('/teaming/' + item.id);
        } catch (err) { toast(err.message, 'error'); }
      });
    };
    $$('#lg-new, #lg-new2', view).forEach((b) => b.addEventListener('click', open));
  }

  async function viewLegalDoc(view, id) {
    const { items } = await api('/legal');
    const doc = items.find((x) => x.id === String(id));
    if (!doc) { view.innerHTML = emptyState('Agreement not found', '', '<a href="/app/teaming" data-link class="btn-ghost">Back</a>'); return; }
    const t = Object.assign(legalDefaults(doc.kind), doc.data);
    const html = () => (doc.kind === 'nda' ? ndaHtml(t) : teamingHtml(t));
    const inp = (k, label, o = {}) => `<div class="${o.wide ? 'sm:col-span-2' : ''}"><label class="label" for="lg-${k}">${label}</label><input id="lg-${k}" data-k="${k}" class="field !py-2" ${o.type ? `type="${o.type}"` : ''} maxlength="300" value="${esc(t[k])}" /></div>`;
    view.innerHTML = `<div>
      <div class="no-print">${pageHead(esc(doc.title), LEGAL_NOTE,
        `<a href="/app/teaming" data-link class="btn-ghost">All agreements</a><button id="lg-word" class="btn-ghost">Download Word</button><button id="lg-print" class="btn-ghost">Print / PDF</button><button id="lg-save" class="btn-primary">Save</button>`)}</div>
      <div class="grid gap-6 xl:grid-cols-[380px,1fr]">
        <form id="lg-edit" class="no-print card space-y-4 p-6" novalidate>
          <h2 class="font-semibold text-white">Your company</h2>
          <div class="grid gap-3 sm:grid-cols-2">${inp('primeName', 'Company', { wide: true })}${inp('primeAddress', 'Address', { wide: true })}${inp('primeSigner', 'Signer')}${inp('primeTitle', 'Title')}</div>
          <h2 class="pt-2 font-semibold text-white">${doc.kind === 'nda' ? 'Other company' : 'Subcontractor'}</h2>
          <div class="grid gap-3 sm:grid-cols-2">${inp('subName', 'Company', { wide: true })}${inp('subAddress', 'Address', { wide: true })}${inp('subSigner', 'Signer')}${inp('subTitle', 'Title')}</div>
          <h2 class="pt-2 font-semibold text-white">Terms</h2>
          <div class="grid gap-3 sm:grid-cols-2">${inp('effective', 'Effective date', { type: 'date' })}${inp('governingState', 'Governing state')}
            ${doc.kind === 'nda' ? `${inp('termYears', 'Term (years)')}${inp('purpose', 'Purpose', { wide: true })}`
              : `${inp('solicitation', 'Solicitation', { wide: true })}${inp('agency', 'Agency', { wide: true })}${inp('subScope', 'Subcontractor scope', { wide: true })}${inp('subShare', 'Workshare %')}
                <label class="flex items-center gap-2 text-sm text-mist-200"><input type="checkbox" data-k="exclusive" ${t.exclusive ? 'checked' : ''} />Exclusive</label>
                <label class="flex items-center gap-2 text-sm text-mist-200 sm:col-span-2"><input type="checkbox" data-k="setAside" ${t.setAside ? 'checked' : ''} />Set-aside (adds the FAR 52.219-14 limit)</label>`}
          </div>
        </form>
        <article class="card print-area p-6 sm:p-10"><div id="lg-doc" class="doc"></div></article>
      </div></div>`;
    const draw = () => { $('#lg-doc').innerHTML = html(); };
    draw();
    $('#lg-edit').addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      t[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      draw();
    });
    $('#lg-print').addEventListener('click', () => window.print());
    $('#lg-word').addEventListener('click', () => wordDoc(doc.title, html().replace(/<span class="cap-ph">/g, '<span style="background:#FFE4E8">')));
    $('#lg-save').addEventListener('click', async () => {
      try { await api('/legal/' + doc.id, { method: 'PATCH', body: { data: t } }); toast('Saved.'); } catch (err) { toast(err.message, 'error'); }
    });
  }
