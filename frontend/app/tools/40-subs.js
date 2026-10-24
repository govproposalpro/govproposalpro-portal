  // ------------------------------------------------------------------ Smart Vendor Scraper and saved subcontractors

  const US_STATES = Object.keys(STATE_NAMES);

  function subModal(sub, bids, onSaved) {
    const s = sub || {};
    const f = (name, label, value, attrs = '') => `<div><label class="label" for="sm-${name}">${label}</label><input id="sm-${name}" name="${name}" class="field" value="${esc(value ?? '')}" ${attrs} /></div>`;
    const m = openModal(`
      <form id="sub-form" novalidate>
        <div class="mb-5 flex items-start justify-between"><h2 class="text-xl font-semibold text-white">${sub ? 'Subcontractor' : 'Add a subcontractor'}</h2>
          <button type="button" data-close class="text-2xl leading-none text-mist-400 hover:text-white" aria-label="Close">&times;</button></div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">${f('company', 'Company *', s.company, 'maxlength="200"')}</div>
          ${f('contactName', 'Contact name', s.contactName, 'maxlength="120"')}${f('trade', 'Trade or service', s.trade, 'maxlength="120" placeholder="e.g. Janitorial"')}
          ${f('email', 'Email', s.email, 'type="email" maxlength="254"')}${f('phone', 'Phone', s.phone, 'maxlength="40"')}
          ${f('location', 'Location', s.location, 'maxlength="200"')}${f('website', 'Website', s.website, 'maxlength="200"')}
          ${f('uei', 'UEI', s.uei, 'maxlength="12"')}${f('quote', 'Their quote ($)', s.quote, 'inputmode="decimal"')}
          <div class="sm:col-span-2"><label class="label" for="sm-bid">For opportunity</label><select id="sm-bid" name="bidId" class="field">${bidOptions(bids, s.bidId)}</select></div>
          <div class="sm:col-span-2"><label class="label" for="sm-notes">Notes</label><textarea id="sm-notes" name="notes" rows="3" class="field">${esc(s.notes || '')}</textarea></div>
        </div>
        ${errBox('sub-error')}
        <div class="mt-6 flex flex-wrap justify-between gap-2">
          <div>${sub ? '<button type="button" id="sub-del" class="btn-danger">Delete</button>' : ''}</div>
          <div class="flex gap-2"><button type="button" data-close class="btn-ghost">Cancel</button><button type="submit" class="btn-primary">Save</button></div>
        </div>
      </form>`);
    const form = $('#sub-form', m.el);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form));
      body.bidId = body.bidId || null;
      try {
        if (sub) await api('/subs/' + sub.id, { method: 'PATCH', body });
        else await api('/subs', { method: 'POST', body: { ...body, source: 'manual' } });
        m.close();
        onSaved();
      } catch (err) { showMsg('sub-error', err.message); }
    });
    const del = $('#sub-del', m.el);
    if (del) del.addEventListener('click', async () => {
      if (!confirm(`Delete ${sub.company}?`)) return;
      try { await api('/subs/' + sub.id, { method: 'DELETE' }); m.close(); onSaved(); } catch (err) { toast(err.message, 'error'); }
    });
  }

  const subRow = (s, bids) => {
    const bid = bids.find((b) => b.id === s.bidId);
    return `<tr data-sub="${s.id}" class="cursor-pointer hover:bg-white/[0.03]">
      <td><p class="font-medium text-white">${esc(s.company)}</p><p class="text-xs text-mist-500">${esc([s.contactName, s.trade].filter(Boolean).join(' · '))}</p></td>
      <td class="text-mist-300">${esc([s.email, s.phone].filter(Boolean).join(' · ') || '—')}</td>
      <td class="text-mist-300">${esc(s.location || '—')}</td>
      <td class="text-mist-300">${bid ? esc(bid.title) : '—'}</td>
      <td class="text-right text-white">${s.quote ? money2(s.quote) : '—'}</td></tr>`;
  };

  async function viewVendors(view) {
    const [bids, subs] = await Promise.all([loadBids(), loadSubs()]);
    const myNaics = (state.me.user.naics || '').match(/\d{6}/g) || [];
    const ent = hasTool('sub_vetting');
    const homeState = US_STATES.find((c) => new RegExp(`\\b${c}\\b`).test(state.me.user.address || '')) || '';
    view.innerHTML = `
      ${pageHead('Smart Vendor Scraper', 'Find subcontractors for the job by NAICS code and location, then save them to quote, team and track.',
        `<button id="add-sub" class="btn-ghost">${icon('plus', 'h-4 w-4')}Add manually</button>`)}
      <div class="grid items-start gap-6 xl:grid-cols-5">
        <section class="card p-6 xl:col-span-3">
          <h2 class="font-semibold text-white">SAM.gov registered businesses</h2>
          <p class="mt-1 text-sm text-mist-400">Active registrants ready to work on federal contracts, with UEI and CAGE for your teaming paperwork.</p>
          <form id="sam-search" class="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" novalidate>
            <div><label class="label" for="vs-naics">NAICS code</label><input id="vs-naics" class="field" list="vs-naics-list" inputmode="numeric" maxlength="6" value="${esc(myNaics[0] || '')}" placeholder="e.g. 561720" />
              <datalist id="vs-naics-list">${myNaics.map((n) => `<option value="${n}">`).join('')}</datalist></div>
            <div><label class="label" for="vs-state">State where the work is</label><select id="vs-state" class="field"><option value="">Choose</option>${US_STATES.map((c) => `<option value="${c}" ${c === homeState ? 'selected' : ''}>${STATE_NAMES[c]}</option>`).join('')}</select></div>
            <div class="flex items-end"><button class="btn-primary w-full" type="submit">${icon('users', 'h-4 w-4')}Search</button></div>
          </form>
          <div id="sam-results" class="mt-5"></div>
        </section>
        <div class="xl:col-span-2">
          ${ent ? `<section class="card p-6">
              <h2 class="font-semibold text-white">Top-rated local businesses</h2>
              <p class="mt-1 text-sm text-mist-400">Highly reviewed private companies near the job, with phone and website. Many are not in SAM.gov yet and make great subs.</p>
              <form id="places-search" class="mt-4 space-y-3" novalidate>
                <div><label class="label" for="ps-trade">Trade or service</label><input id="ps-trade" class="field" maxlength="80" placeholder="e.g. commercial janitorial" /></div>
                <div><label class="label" for="ps-where">City and state, or ZIP code</label><input id="ps-where" class="field" maxlength="120" placeholder="e.g. Dallas, TX" /></div>
                <button class="btn-primary w-full" type="submit">${icon('target', 'h-4 w-4')}Find top-rated subs</button>
              </form>
              <div id="places-results" class="mt-5"></div>
            </section>`
            : lockedTeaser('Top-rated local subcontractors', 'Enterprise adds the best-reviewed private businesses near the job, with phone numbers and websites, ranked by rating.')}
        </div>
      </div>
      <section class="card mt-6 p-6">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 class="font-semibold text-white">Your subcontractors (${subs.length})</h2>
          <div class="flex gap-2">${subs.length ? '<button id="subs-csv" class="btn-ghost !py-1.5 !text-xs">Export CSV</button>' : ''}<a href="/app/outreach" data-link class="btn-ghost !py-1.5 !text-xs">${icon('mail', 'h-3.5 w-3.5')}Request quotes</a></div></div>
        ${subs.length ? `<div class="overflow-x-auto"><table class="tbl min-w-[760px]"><thead><tr><th>Company</th><th>Contact</th><th>Location</th><th>Opportunity</th><th class="text-right">Quote</th></tr></thead>
          <tbody>${subs.map((s) => subRow(s, bids)).join('')}</tbody></table></div>`
          : '<p class="text-sm text-mist-500">Search above and save the ones you like, or add a sub you already know.</p>'}
      </section>`;

    $('#add-sub').addEventListener('click', () => subModal(null, bids, render));
    $$('[data-sub]', view).forEach((tr) => tr.addEventListener('click', () => subModal(subs.find((s) => String(s.id) === tr.dataset.sub), bids, render)));
    const csv = $('#subs-csv');
    if (csv) csv.addEventListener('click', () => csvDownload('subcontractors.csv', [['Company', 'Contact', 'Email', 'Phone', 'Trade', 'Location', 'Website', 'UEI', 'CAGE', 'Quote', 'Source'],
      ...subs.map((s) => [s.company, s.contactName, s.email, s.phone, s.trade, s.location, s.website, s.uei, s.cage, s.quote, s.source])]));

    const save = async (btn, body) => {
      btn.disabled = true;
      try { await api('/subs', { method: 'POST', body }); btn.textContent = 'Saved'; toast(`${body.company} saved to your subcontractors.`); } catch (err) { btn.disabled = false; toast(err.message, 'error'); }
    };

    $('#sam-search').addEventListener('submit', async (e) => {
      e.preventDefault();
      const out = $('#sam-results');
      const naics = $('#vs-naics').value.trim();
      const st = $('#vs-state').value;
      out.innerHTML = '<div class="flex items-center gap-2 text-sm text-mist-400"><span class="spinner"></span>Searching SAM.gov</div>';
      try {
        const r = await api(`/vendors/search?naics=${encodeURIComponent(naics)}&state=${encodeURIComponent(st)}`);
        if (!r.configured) { out.innerHTML = '<p class="text-sm text-amber-200">SAM.gov search is being switched on. Try again shortly.</p>'; return; }
        if (!r.entities.length) { out.innerHTML = '<p class="text-sm text-mist-500">No active registrants for that NAICS code in that state. Try a related code or a neighboring state.</p>'; return; }
        out.innerHTML = `<p class="mb-2 text-xs text-mist-500">Showing ${r.entities.length} of ${r.total.toLocaleString()} active registrants.</p>
          <ul class="space-y-2">${r.entities.map((x, i) => `<li class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <span class="min-w-0"><span class="block font-medium text-white">${esc(x.company)}</span>
              <span class="text-xs text-mist-500">${esc([x.location, x.uei && 'UEI ' + x.uei, x.cage && 'CAGE ' + x.cage, x.contactName].filter(Boolean).join(' · '))}</span></span>
            <span class="flex gap-2">${x.website ? `<a class="btn-ghost !px-3 !py-1.5 !text-xs" href="${esc(/^https?:/.test(x.website) ? x.website : 'https://' + x.website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}
              <button type="button" class="btn-primary !px-3 !py-1.5 !text-xs" data-save-sam="${i}">Save</button></span></li>`).join('')}</ul>`;
        $$('[data-save-sam]', out).forEach((b) => b.addEventListener('click', () => {
          const x = r.entities[Number(b.dataset.saveSam)];
          save(b, { company: x.company, contactName: x.contactName || null, uei: x.uei || null, cage: x.cage || null, location: x.location || null,
            website: x.website || null, trade: `NAICS ${naics}`, source: 'sam' });
        }));
      } catch (err) { out.innerHTML = `<p class="text-sm text-brand-redSoft">${esc(err.message)}</p>`; }
    });

    const ps = $('#places-search');
    if (ps) ps.addEventListener('submit', async (e) => {
      e.preventDefault();
      const out = $('#places-results');
      out.innerHTML = '<div class="flex items-center gap-2 text-sm text-mist-400"><span class="spinner"></span>Finding top-rated businesses</div>';
      try {
        const trade = $('#ps-trade').value.trim();
        const r = await api(`/vendors/top-rated?trade=${encodeURIComponent(trade)}&where=${encodeURIComponent($('#ps-where').value.trim())}`);
        if (!r.configured) { out.innerHTML = '<p class="text-sm text-amber-200">Top-rated search is being switched on. Try again shortly.</p>'; return; }
        if (!r.places.length) { out.innerHTML = '<p class="text-sm text-mist-500">No businesses found. Try a broader trade or a nearby city.</p>'; return; }
        out.innerHTML = `<ul class="space-y-2">${r.places.map((p, i) => `<li class="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div class="flex items-start justify-between gap-3"><span class="min-w-0"><span class="block font-medium text-white">${esc(p.company)}</span>
            <span class="text-xs text-amber-200">${p.rating ? `★ ${p.rating.toFixed(1)}` : 'No rating'} <span class="text-mist-500">(${p.reviews} reviews)</span></span>
            <span class="block text-xs text-mist-500">${esc(p.location)}</span>
            ${p.phone ? `<span class="block text-xs text-mist-300">${esc(p.phone)}</span>` : ''}</span>
            <button type="button" class="btn-primary shrink-0 !px-3 !py-1.5 !text-xs" data-save-pl="${i}">Save</button></div>
          <div class="mt-2 flex gap-3 text-xs">${p.website ? `<a class="accent-text hover:text-white" href="${esc(p.website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}${p.mapsUrl ? `<a class="accent-text hover:text-white" href="${esc(p.mapsUrl)}" target="_blank" rel="noopener noreferrer">Map and reviews</a>` : ''}</div></li>`).join('')}</ul>
          <p class="mt-3 text-[11px] text-mist-500">Business listings from Google. Ask each sub for their email when you call.</p>`;
        $$('[data-save-pl]', out).forEach((b) => b.addEventListener('click', () => {
          const p = r.places[Number(b.dataset.savePl)];
          save(b, { company: p.company, phone: p.phone || null, website: p.website || null, location: p.location || null, rating: p.rating, trade, source: 'places' });
        }));
      } catch (err) { out.innerHTML = `<p class="text-sm text-brand-redSoft">${esc(err.message)}</p>`; }
    });
  }

  // ------------------------------------------------------------------ 1-Click Outreach Sequences

  const OUTREACH_STEPS = [
    { key: 'rfq', label: 'Request for quote', day: 0 },
    { key: 'follow', label: 'Follow-up', day: 3 },
    { key: 'last', label: 'Last call', day: 6 },
  ];

  function outreachEmail(stepKey, sub, bid) {
    const u = state.me.user;
    const hi = sub && sub.contactName ? `Hi ${sub.contactName.split(' ')[0]},` : 'Hello,';
    const job = bid ? bid.title : '[INSERT: project name]';
    const where = bid && bid.placeOfPerformance ? ` in ${bid.placeOfPerformance}` : '';
    const quoteBy = bid && bid.dueAt ? fmtDate(addBusinessDays(new Date(Date.parse(bid.dueAt) - 5 * 86400000).toISOString().slice(0, 10), 0)) : '[INSERT: quote deadline]';
    const sol = bid && bid.solicitationNumber ? ` (solicitation ${bid.solicitationNumber})` : '';
    const agency = bid && bid.agency ? ` for ${bid.agency}` : '';
    const sig = [memberName(), u.contactTitle, memberCompany(), u.phone, u.email].filter(Boolean).join('\n');
    if (stepKey === 'rfq') return {
      subject: `Quote request: ${job}${sol}`,
      body: `${hi}

${memberCompany()} is preparing a bid on a government contract${agency}: ${job}${sol}${where}. We are looking for a qualified ${sub && sub.trade ? sub.trade.replace(/^NAICS /, 'NAICS ') + ' ' : ''}partner to perform the work as our subcontractor, and your company stood out.

Could you send us a quote by ${quoteBy}? Please include:
• Your price (unit prices or a lump sum) and what it covers
• Your availability and start date
• Proof of insurance and any licenses or certifications required
• Your UEI if you are registered in SAM.gov (not required to quote)

I'm happy to send the scope of work and drawings, or set up a quick call.

Thank you,
${sig}`,
    };
    if (stepKey === 'follow') return {
      subject: `Following up: quote for ${job}`,
      body: `${hi}

Following up on my note about ${job}${sol}${where}. We would still like to include your company in our bid. Could you send a quote, or let me know if you need anything from us, by ${quoteBy}?

Thank you,
${sig}`,
    };
    return {
      subject: `Last call: quote for ${job}`,
      body: `${hi}

We are finalizing pricing for ${job}${sol} and need quotes by ${quoteBy}. If you would like to be considered, please reply with your price and availability. If now is not a good time, no problem; we will keep you in mind for the next one.

Thank you,
${sig}`,
    };
  }

  async function viewOutreach(view) {
    const [bids, subs] = await Promise.all([loadBids(), loadSubs()]);
    const params = new URLSearchParams(location.search);
    let bidId = params.get('bid') || (bids.find((b) => !['won', 'lost', 'submitted'].includes(b.stage)) || {}).id || '';
    const draw = () => {
      const bid = bids.find((b) => String(b.id) === String(bidId)) || null;
      const list = subs.filter((s) => !bid || !s.bidId || s.bidId === bid.id);
      view.innerHTML = `
        ${pageHead('1-Click Outreach Sequences', 'Three-step quote requests, filled in with the contract and each subcontractor. Send from your own email so replies come to you.')}
        <div class="card mb-6 grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div><label class="label" for="ob-bid">Opportunity</label><select id="ob-bid" class="field">${bidOptions(bids, bidId, 'General (no opportunity)')}</select></div>
          <button id="ob-all" class="btn-primary" ${list.some((s) => s.email) ? '' : 'disabled'}>${icon('mail', 'h-4 w-4')}Email all with an address (BCC)</button>
        </div>
        ${list.length ? `<div class="grid gap-3">${list.map((s) => {
          const sent = s.outreach || {};
          const next = OUTREACH_STEPS.find((st) => !sent[st.key]);
          const firstSent = sent.rfq;
          return `<article class="card p-5" data-sub="${s.id}">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0"><p class="font-semibold text-white">${esc(s.company)}</p>
                <p class="text-sm text-mist-400">${esc([s.contactName, s.email || 'No email yet', s.phone].filter(Boolean).join(' · '))}</p></div>
              ${s.quote ? `<span class="pill bg-emerald-500/15 text-emerald-300">Quoted ${money2(s.quote)}</span>` : next ? `<span class="pill bg-white/[0.06] text-mist-300">Next: ${next.label}${firstSent && next.day ? ` · ${fmtDate(addBusinessDays(firstSent, next.day))}` : ''}</span>` : '<span class="pill bg-white/[0.06] text-mist-400">Sequence done</span>'}
            </div>
            <ol class="mt-4 grid gap-2 sm:grid-cols-3">${OUTREACH_STEPS.map((st) => `
              <li class="rounded-2xl border ${sent[st.key] ? 'border-emerald-400/20 bg-emerald-500/5' : 'border-white/[0.06] bg-white/[0.02]'} p-3">
                <p class="text-xs font-semibold uppercase tracking-wider ${sent[st.key] ? 'text-emerald-300' : 'text-mist-500'}">Day ${st.day} · ${st.label}</p>
                <p class="mt-1 text-xs text-mist-500">${sent[st.key] ? `Sent ${fmtDate(sent[st.key])}` : 'Not sent'}</p>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" class="btn-ghost !px-2.5 !py-1 !text-xs" data-send="${st.key}" ${s.email ? '' : 'disabled title="Add their email first"'}>Open email</button>
                  <button type="button" class="btn-ghost !px-2.5 !py-1 !text-xs" data-copy="${st.key}">Copy</button>
                  <button type="button" class="btn-ghost !px-2.5 !py-1 !text-xs" data-mark="${st.key}">${sent[st.key] ? 'Undo' : 'Mark sent'}</button>
                </div></li>`).join('')}</ol>
            <div class="mt-3 flex items-center gap-2"><label class="text-xs text-mist-500" for="q-${s.id}">Quote received ($)</label>
              <input id="q-${s.id}" class="field !w-40 !py-1.5 !text-sm" inputmode="decimal" value="${esc(s.quote ?? '')}" data-quote /></div>
          </article>`;
        }).join('')}</div>`
          : emptyState('No subcontractors yet', 'Find subs with the Smart Vendor Scraper or add one you know, then come back to request quotes.', '<a href="/app/vendors" data-link class="btn-primary">Find subcontractors</a>')}`;

      $('#ob-bid').addEventListener('change', (e) => { bidId = e.target.value; draw(); });
      const patchOutreach = async (s, key, on) => {
        const next = { ...(s.outreach || {}) };
        if (on) next[key] = today(); else delete next[key];
        await api('/subs/' + s.id, { method: 'PATCH', body: { outreach: next } });
        s.outreach = next;
      };
      $$('[data-sub]', view).forEach((card) => {
        const s = subs.find((x) => String(x.id) === card.dataset.sub);
        $$('[data-send]', card).forEach((b) => b.addEventListener('click', async () => {
          const mail = outreachEmail(b.dataset.send, s, bid);
          mailto({ to: s.email, ...mail });
          try { await patchOutreach(s, b.dataset.send, true); setTimeout(draw, 400); } catch (err) { toast(err.message, 'error'); }
        }));
        $$('[data-copy]', card).forEach((b) => b.addEventListener('click', () => {
          const mail = outreachEmail(b.dataset.copy, s, bid);
          copyText(`Subject: ${mail.subject}\n\n${mail.body}`, 'Email copied. Paste it into your email app.');
        }));
        $$('[data-mark]', card).forEach((b) => b.addEventListener('click', async () => {
          try { await patchOutreach(s, b.dataset.mark, !(s.outreach || {})[b.dataset.mark]); draw(); } catch (err) { toast(err.message, 'error'); }
        }));
        $('[data-quote]', card).addEventListener('change', async (e) => {
          try { await api('/subs/' + s.id, { method: 'PATCH', body: { quote: e.target.value } }); s.quote = e.target.value ? num(e.target.value) : null; toast('Quote saved.'); draw(); } catch (err) { toast(err.message, 'error'); }
        });
      });
      $('#ob-all').addEventListener('click', async () => {
        const targets = list.filter((s) => s.email && !(s.outreach || {}).rfq);
        const pool = targets.length ? targets : list.filter((s) => s.email);
        const mail = outreachEmail('rfq', null, bid);
        mailto({ bcc: pool.map((s) => s.email).join(','), ...mail });
        try { await Promise.all(pool.map((s) => patchOutreach(s, 'rfq', true))); setTimeout(draw, 400); } catch (err) { toast(err.message, 'error'); }
      });
    };
    draw();
  }
