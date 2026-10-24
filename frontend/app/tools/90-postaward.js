  // ------------------------------------------------------------------ Post-Award Milestone Tracker and Simplified Invoicing Engine

  const STANDARD_MILESTONES = [
    ['Post-award kickoff with the contracting officer', 5],
    ['Send insurance certificates and any bonds', 10],
    ['Register in the payment system named in the contract (PIEE/WAWF or IPP)', 10],
    ['Subcontract signed and sub notified to proceed', 7],
    ['Mid-point quality check with the COR', 30],
    ['Final delivery or completion of work', 60],
    ['Final invoice and release of claims', 65],
  ];

  async function viewMilestones(view) {
    const [{ items }, bids, subs] = await Promise.all([api('/milestones'), loadBids(), loadSubs()]);
    const contracts = bids.filter((b) => ['won', 'awarded', 'active'].includes(b.stage) || items.some((m) => m.bidId === b.id));
    const pick = contracts.length ? contracts : bids;
    let showDone = false;
    view.innerHTML = '<div></div>';
    const root = view.firstElementChild;
    const subName = (sid) => (subs.find((s) => s.id === sid) || {}).company;
    const draw = () => {
      const groups = pick.map((b) => ({ b, list: items.filter((m) => m.bidId === b.id && (showDone || m.status === 'open')) })).filter((g) => g.list.length || items.every((m) => m.bidId !== g.b.id));
      const open = items.filter((m) => m.status === 'open');
      const late = open.filter((m) => m.dueOn && daysUntil(m.dueOn) < 0).length;
      root.innerHTML = `
        ${pageHead('Post-Award Milestone Tracker', 'Every deliverable, sub check-in and invoice date for the contracts you have won.',
          `<a href="/app/invoices" data-link class="btn-ghost">${icon('receipt', 'h-4 w-4')}Invoices</a><button id="ms-new" class="btn-primary" ${bids.length ? '' : 'disabled'}>${icon('plus', 'h-4 w-4')}Add milestone</button>`)}
        ${bids.length ? `
        <div class="mb-6 grid gap-3 sm:grid-cols-3">
          <div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">Open</p><p class="mt-1 text-2xl font-semibold text-white">${open.length}</p></div>
          <div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">Overdue</p><p class="mt-1 text-2xl font-semibold ${late ? 'text-brand-redSoft' : 'text-white'}">${late}</p></div>
          <div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">Still to bill</p><p class="mt-1 text-2xl font-semibold text-white">${money2(open.reduce((t, m) => t + (m.amount || 0), 0))}</p></div>
        </div>
        <label class="mb-4 flex items-center gap-2 text-sm text-mist-300"><input type="checkbox" id="ms-done" ${showDone ? 'checked' : ''} />Show completed</label>
        <div class="space-y-6">${groups.map(({ b, list }) => `
          <section class="card p-6">
            <div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-semibold text-white">${esc(b.title)}</h2>
              <button class="btn-ghost !py-2" data-std="${b.id}">Add standard milestones</button></div>
            ${list.length ? `<ul class="mt-4 divide-y divide-white/[0.06]">${list.map((m) => {
              const d = m.dueOn ? daysUntil(m.dueOn) : null;
              return `<li class="flex flex-wrap items-center gap-3 py-3">
                <button class="rounded-full border ${m.status === 'done' ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300' : 'border-white/20 text-transparent hover:border-white/50'} p-1" data-toggle="${m.id}" aria-label="${m.status === 'done' ? 'Mark open' : 'Mark done'}">${icon('check', 'h-3.5 w-3.5')}</button>
                <div class="min-w-0 flex-1"><p class="${m.status === 'done' ? 'text-mist-500 line-through' : 'text-white'}">${esc(m.title)}</p>
                  <p class="text-xs text-mist-500">${[m.dueOn && (m.status === 'done' ? `Done ${fmtDate(m.doneOn)}` : `<span class="${d < 0 ? 'text-brand-redSoft' : d <= 3 ? 'text-amber-200' : ''}">Due ${fmtDate(m.dueOn)} (${d < 0 ? `${-d} days late` : daysLabel(d)})</span>`),
                    m.subContactId && subName(m.subContactId) && `Sub: ${esc(subName(m.subContactId))}`, m.amount && money2(m.amount)].filter(Boolean).join(' · ')}</p></div>
                ${m.amount && m.status === 'done' ? `<a href="/app/invoices/new?bid=${b.id}&milestone=${m.id}" data-link class="btn-ghost !py-1.5 !text-xs">Invoice it</a>` : ''}
                <button class="btn-ghost !px-2.5 !py-1.5" data-del="${m.id}" aria-label="Delete">&times;</button></li>`;
            }).join('')}</ul>` : '<p class="mt-3 text-sm text-mist-500">No open milestones.</p>'}
          </section>`).join('')}</div>`
        : emptyState('Win one first', 'Milestones hang off the opportunities in your Bid CRM. Add the contract there and move it to Won.', '<a href="/app/crm" data-link class="btn-primary">Open Bid CRM</a>')}`;
    };
    draw();
    const msModal = () => {
      openModal(`<h2 class="text-lg font-semibold text-white">Add milestone</h2>
        <form id="ms-form" class="mt-5 grid gap-4 sm:grid-cols-2" novalidate>
          <div class="sm:col-span-2"><label class="label" for="ms-bid">Contract</label><select id="ms-bid" name="bidId" class="field">${bidOptions(pick, pick[0] && pick[0].id, 'Choose')}</select></div>
          <div class="sm:col-span-2"><label class="label" for="ms-title">Milestone</label><input id="ms-title" name="title" class="field" maxlength="200" placeholder="e.g. Deliver 40 patio umbrellas" /></div>
          <div><label class="label" for="ms-due">Due</label><input id="ms-due" name="dueOn" type="date" class="field" /></div>
          <div><label class="label" for="ms-amt">Amount to bill when done (optional)</label><input id="ms-amt" name="amount" class="field" inputmode="decimal" /></div>
          <div class="sm:col-span-2"><label class="label" for="ms-sub">Subcontractor responsible (optional)</label><select id="ms-sub" name="subContactId" class="field"><option value="">None</option>${subs.map((s) => `<option value="${s.id}">${esc(s.company)}</option>`).join('')}</select></div>
          <p id="ms-err" class="hidden text-sm text-brand-redSoft sm:col-span-2" role="alert"></p>
          <div class="flex justify-end gap-2 sm:col-span-2"><button type="button" class="btn-ghost" data-close>Cancel</button><button class="btn-primary">Add</button></div>
        </form>`);
      $('#ms-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target.elements;
        try {
          const { item } = await api('/milestones', { method: 'POST', body: { bidId: f.bidId.value ? Number(f.bidId.value) : null, title: f.title.value, dueOn: f.dueOn.value || null,
            amount: f.amount.value || null, subContactId: f.subContactId.value ? Number(f.subContactId.value) : null } });
          items.push(item);
          $('[data-close]').click();
          draw();
        } catch (err) { const el = $('#ms-err'); el.textContent = err.message; el.classList.remove('hidden'); }
      });
    };
    root.addEventListener('change', (e) => { if (e.target.id === 'ms-done') { showDone = e.target.checked; draw(); } });
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      try {
        if (b.id === 'ms-new') msModal();
        else if (d.std) {
          b.disabled = true;
          const start = today();
          const have = new Set(items.filter((m) => m.bidId === d.std).map((m) => m.title));
          for (const [title, days] of STANDARD_MILESTONES.filter(([t]) => !have.has(t))) {
            items.push((await api('/milestones', { method: 'POST', body: { bidId: Number(d.std), title, dueOn: addBusinessDays(start, Math.round(days * 5 / 7)) } })).item);
          }
          toast('Standard milestones added. Adjust the dates to your contract.');
          draw();
        } else if (d.toggle) {
          const m = items.find((x) => x.id === String(d.toggle));
          const done = m.status !== 'done';
          Object.assign(m, (await api('/milestones/' + m.id, { method: 'PATCH', body: { status: done ? 'done' : 'open', doneOn: done ? today() : null } })).item);
          draw();
        } else if (d.del && confirm('Delete this milestone?')) {
          await api('/milestones/' + d.del, { method: 'DELETE' });
          items.splice(items.findIndex((x) => x.id === String(d.del)), 1);
          draw();
        }
      } catch (err) { b.disabled = false; toast(err.message, 'error'); }
    });
  }

  const INV_PILL = {
    draft: '<span class="pill bg-white/[0.06] text-mist-300">Draft</span>',
    submitted: '<span class="pill bg-brand-blue/15 text-brand-blueSoft">Submitted</span>',
    paid: '<span class="pill bg-emerald-500/15 text-emerald-300">Paid</span>',
  };

  async function viewInvoices(view) {
    const [{ items }, bids] = await Promise.all([api('/invoices'), loadBids()]);
    const bidTitle = (id) => (bids.find((b) => b.id === id) || {}).title || '';
    const outstanding = items.filter((i) => i.status === 'submitted');
    view.innerHTML = `
      ${pageHead('Simplified Invoicing Engine', 'Public vouchers (SF-1034, with SF-1035 continuation) ready to upload to the payment system in your contract.',
        `<a href="/app/invoices/new" data-link class="btn-primary">${icon('plus', 'h-4 w-4')}New voucher</a>`)}
      <div class="mb-6 grid gap-3 sm:grid-cols-3">
        <div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">Waiting on payment</p><p class="mt-1 text-2xl font-semibold text-white">${money2(outstanding.reduce((t, i) => t + i.total, 0))}</p></div>
        <div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">Paid</p><p class="mt-1 text-2xl font-semibold text-emerald-300">${money2(items.filter((i) => i.status === 'paid').reduce((t, i) => t + i.total, 0))}</p></div>
        <div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">Drafts</p><p class="mt-1 text-2xl font-semibold text-white">${items.filter((i) => i.status === 'draft').length}</p></div>
      </div>
      ${items.length ? `<div class="card overflow-x-auto p-5"><table class="tbl"><thead><tr><th>Voucher</th><th>Contract</th><th class="text-right">Amount</th><th>Status</th><th>Payment due</th></tr></thead><tbody>${items.map((i) => {
        const sub = i.data && i.data.submittedOn;
        const due = sub ? new Date(Date.parse(sub + 'T12:00:00') + 30 * 86400000).toISOString().slice(0, 10) : null;
        return `<tr><td><a href="/app/invoices/${i.id}" data-link class="font-medium text-white hover:text-brand-blueSoft">${esc(i.number)}</a></td><td class="text-mist-300">${esc(bidTitle(i.bidId) || (i.data && i.data.contractNumber) || '')}</td>
          <td class="text-right text-white">${money2(i.total)}</td><td>${INV_PILL[i.status]}</td>
          <td class="${due && i.status === 'submitted' && daysUntil(due) < 0 ? 'text-brand-redSoft' : 'text-mist-400'}">${due && i.status === 'submitted' ? fmtDate(due) : ''}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="mt-3 text-xs text-mist-500">Under the Prompt Payment Act the government generally owes payment 30 days after it receives a proper invoice, with interest when it pays late.</p>`
        : emptyState('No vouchers yet', 'Finish a milestone, then invoice it here. The voucher fills in your company details and the contract for you.', '<a href="/app/invoices/new" data-link class="btn-primary">Create a voucher</a>')}`;
  }

  async function viewInvoice(view, id) {
    const params = new URLSearchParams(location.search);
    const [{ items }, bids, { items: ms }] = await Promise.all([api('/invoices'), loadBids(), api('/milestones')]);
    let inv = id === 'new' ? null : items.find((i) => i.id === String(id));
    if (id !== 'new' && !inv) { view.innerHTML = emptyState('Voucher not found', '', '<a href="/app/invoices" data-link class="btn-ghost">Back</a>'); return; }
    const u = state.me.user;
    const year = new Date().getFullYear();
    const bid = bids.find((b) => String(b.id) === String(inv ? inv.bidId : params.get('bid')));
    const milestone = ms.find((m) => String(m.id) === params.get('milestone'));
    const d = Object.assign({
      date: today(), contractNumber: bid ? bid.solicitationNumber || '' : '', orderNumber: '', agency: bid ? bid.agency || '' : '', payingOffice: '',
      periodFrom: '', periodTo: '', payeeName: u.businessName || '', payeeAddress: u.address || '', uei: u.uei || '', cage: u.cageCode || '',
      lines: milestone ? [{ date: milestone.doneOn || today(), description: milestone.title, quantity: '1', unit: 'Lot', unitPrice: String(milestone.amount || '') }]
        : [{ date: today(), description: '', quantity: '1', unit: 'Each', unitPrice: '' }],
    }, inv ? inv.data : {});
    let number = inv ? inv.number : `${year}-${String(items.filter((i) => i.number.startsWith(String(year))).length + 1).padStart(3, '0')}`;
    let bidId = bid ? bid.id : null;
    let status = inv ? inv.status : 'draft';
    const total = () => d.lines.reduce((t, l) => t + num(l.quantity) * num(l.unitPrice), 0);

    const inp = (k, label, o = {}) => `<div class="${o.cls || ''}"><label class="label" for="iv-${k}">${label}</label><input id="iv-${k}" data-f="${k}" class="field !py-2" ${o.type ? `type="${o.type}"` : ''} maxlength="300" value="${esc(d[k])}" /></div>`;
    const lineRow = (l, i) => `<tr data-i="${i}"><td><input type="date" class="field !w-40 !px-3 !py-2" data-l="date" value="${esc(l.date)}" /></td>
      <td><input class="field !min-w-[220px] !py-2" data-l="description" maxlength="300" value="${esc(l.description)}" /></td>
      <td><input class="field !w-20 !px-3 !py-2" data-l="quantity" inputmode="decimal" value="${esc(l.quantity)}" /></td>
      <td><input class="field !w-20 !px-3 !py-2" data-l="unit" maxlength="20" value="${esc(l.unit)}" /></td>
      <td><input class="field !w-28 !px-3 !py-2" data-l="unitPrice" inputmode="decimal" value="${esc(l.unitPrice)}" /></td>
      <td class="text-right text-white" data-amt>-</td><td><button type="button" class="btn-ghost !px-2.5 !py-2" data-rm="${i}" aria-label="Remove line">&times;</button></td></tr>`;

    // The printed public voucher. Lines past the eighth go on an SF-1035 continuation sheet.
    const voucher = () => {
      const lines = d.lines.filter((l) => l.description);
      const row = (l) => `<tr><td>${esc(l.date ? fmtDate(l.date) : '')}</td><td>${esc(l.description)}</td><td class="r">${esc(l.quantity)}</td><td>${esc(l.unit)}</td><td class="r">${money2(num(l.unitPrice))}</td><td class="r">${money2(num(l.quantity) * num(l.unitPrice))}</td></tr>`;
      const head = '<tr><th>Date of delivery or service</th><th>Articles or services</th><th>Quantity</th><th>Unit</th><th>Unit price</th><th>Amount</th></tr>';
      return `<div class="sf">
        <div class="sf-top"><div><p class="sf-form">Standard Form 1034</p><h1>Public Voucher for Purchases and Services Other Than Personal</h1></div><div class="sf-no">Voucher no.<br><b>${esc(number)}</b></div></div>
        <table class="sf-grid"><tr><td><span>U.S. department, bureau or establishment</span>${F(d.agency, 'agency')}</td><td><span>Date voucher prepared</span>${esc(fmtDate(d.date))}</td><td><span>Contract number and date</span>${F(d.contractNumber, 'contract number')}</td></tr>
          <tr><td><span>Paying office</span>${F(d.payingOffice, 'paying office from the contract')}</td><td><span>Requisition or order number</span>${esc(d.orderNumber) || '&nbsp;'}</td><td><span>Period of service</span>${d.periodFrom ? `${esc(fmtDate(d.periodFrom))} to ${esc(fmtDate(d.periodTo))}` : '&nbsp;'}</td></tr>
          <tr><td colspan="2"><span>Payee's name and address</span><b>${F(d.payeeName, 'company')}</b><br>${F(d.payeeAddress, 'address')}</td><td><span>UEI / CAGE</span>${F(d.uei, 'UEI')} / ${esc(d.cage) || '-'}</td></tr></table>
        <table class="sf-lines">${head}${lines.slice(0, 8).map(row).join('')}<tr class="sf-total"><td colspan="5">${lines.length > 8 ? 'Total (including SF-1035 continuation)' : 'Total'}</td><td class="r">${money2(total())}</td></tr></table>
        <p class="sf-cert">Pursuant to authority vested in me, I certify that this voucher is correct and proper for payment.</p>
        <table class="sf-grid"><tr><td><span>Payee signature</span>&nbsp;<br>&nbsp;</td><td><span>Name and title</span>${F(u.fullName, 'name')}</td><td><span>Date</span>&nbsp;</td></tr></table>
        ${lines.length > 8 ? `<div class="sf-break"></div><div class="sf-top"><div><p class="sf-form">Standard Form 1035</p><h1>Public Voucher for Purchases and Services Other Than Personal, Continuation Sheet</h1></div><div class="sf-no">Voucher no.<br><b>${esc(number)}</b></div></div>
          <table class="sf-lines">${head}${lines.slice(8).map(row).join('')}</table>` : ''}
      </div>`;
    };

    view.innerHTML = `<div>
      <div class="no-print">${pageHead(`Voucher ${esc(number)}`, 'Fill it in, print or save as PDF, then upload it to the payment system your contract names (usually PIEE/WAWF or IPP).',
        `<a href="/app/invoices" data-link class="btn-ghost">All vouchers</a><button id="iv-print" class="btn-ghost">Print / PDF</button><button id="iv-save" class="btn-primary">Save</button>`)}
      <div class="grid gap-6">
        <section class="card p-6"><div class="grid gap-4 sm:grid-cols-3">
          <div><label class="label" for="iv-number">Voucher number</label><input id="iv-number" class="field !py-2" maxlength="40" value="${esc(number)}" /></div>
          <div><label class="label" for="iv-bid">Contract in your CRM</label><select id="iv-bid" class="field !py-2">${bidOptions(bids, bidId)}</select></div>
          <div><label class="label" for="iv-status">Status</label><select id="iv-status" class="field !py-2">${Object.keys(INV_PILL).map((s) => `<option value="${s}" ${s === status ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></div>
          ${inp('date', 'Date prepared', { type: 'date' })}${inp('contractNumber', 'Contract number')}${inp('orderNumber', 'Order or requisition number')}
          ${inp('agency', 'Agency')}${inp('payingOffice', 'Paying office')}<div class="grid grid-cols-2 gap-2">${inp('periodFrom', 'Service from', { type: 'date' })}${inp('periodTo', 'to', { type: 'date' })}</div>
          ${inp('payeeName', 'Payee')}${inp('payeeAddress', 'Payee address', { cls: 'sm:col-span-2' })}${inp('uei', 'UEI')}${inp('cage', 'CAGE')}
        </div></section>
        <section class="card p-6"><h2 class="font-semibold text-white">Articles or services</h2>
          <div class="mt-3 overflow-x-auto"><table class="tbl min-w-[760px]"><thead><tr><th>Date</th><th>Description</th><th>Qty</th><th>Unit</th><th>Unit price</th><th class="text-right">Amount</th><th></th></tr></thead><tbody id="iv-lines"></tbody></table></div>
          <div class="mt-3 flex flex-wrap items-center justify-between gap-3"><button type="button" id="iv-add" class="btn-ghost">${icon('plus', 'h-4 w-4')}Add line</button><p class="text-lg font-semibold text-white">Total <span id="iv-total" class="accent-text">-</span></p></div>
        </section>
      </div></div>
      <article class="print-area mt-6 hidden print:block"><div id="iv-voucher"></div></article></div>`;
    const page = view.firstElementChild;
    const drawLines = () => { $('#iv-lines').innerHTML = d.lines.map(lineRow).join(''); recalc(); };
    const recalc = () => {
      $$('#iv-lines tr').forEach((tr, i) => { const l = d.lines[i]; $('[data-amt]', tr).textContent = l.unitPrice !== '' ? money2(num(l.quantity) * num(l.unitPrice)) : '-'; });
      $('#iv-total').textContent = money2(total());
    };
    drawLines();
    page.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.f) d[t.dataset.f] = t.value;
      else if (t.dataset.l) d.lines[Number(t.closest('tr').dataset.i)][t.dataset.l] = t.value;
      else if (t.id === 'iv-number') number = t.value;
      recalc();
    });
    $('#iv-bid').addEventListener('change', (e) => {
      bidId = e.target.value || null;
      const b = bids.find((x) => x.id === String(bidId));
      if (b && !d.agency) { d.agency = b.agency || ''; $('#iv-agency').value = d.agency; }
    });
    $('#iv-status').addEventListener('change', (e) => { status = e.target.value; });
    $('#iv-add').addEventListener('click', () => { d.lines.push({ date: today(), description: '', quantity: '1', unit: 'Each', unitPrice: '' }); drawLines(); });
    $('#iv-lines').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { d.lines.splice(Number(b.dataset.rm), 1); drawLines(); } });
    $('#iv-print').addEventListener('click', () => { $('#iv-voucher').innerHTML = voucher(); window.print(); });
    $('#iv-save').addEventListener('click', async (e) => {
      if (status === 'submitted' && !d.submittedOn) d.submittedOn = today();
      if (status === 'draft') delete d.submittedOn;
      const body = { number: number.trim(), bidId, status, data: d, total: Math.round(total() * 100) / 100 };
      e.target.disabled = true;
      try {
        if (inv) inv = (await api('/invoices/' + inv.id, { method: 'PATCH', body })).item;
        else { inv = (await api('/invoices', { method: 'POST', body })).item; history.replaceState(null, '', '/app/invoices/' + inv.id); }
        toast('Voucher saved.');
      } catch (err) { toast(err.message, 'error'); }
      e.target.disabled = false;
    });
  }
