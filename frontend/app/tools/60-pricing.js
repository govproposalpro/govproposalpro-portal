  // ------------------------------------------------------------------ Profit Pricing Matrix (+ Fringe/G&A engine for Enterprise)

  const pct = (v) => num(v) / 100;
  const blankSheet = () => ({ overheadPct: 10, markupPct: 15, items: [{ item: '0001', description: '', unit: 'Each', quantity: '1', cost: '' }], extras: [],
    labor: [], fringePct: 30, laborOverheadPct: 40, gaPct: 10, feePct: 8 });

  /** Every number on the sheet, computed the same way for the screen, CSV and proposal hand-off. */
  function priceSheet(d) {
    const oh = pct(d.overheadPct);
    const mk = pct(d.markupPct);
    const lines = (d.items || []).map((it) => {
      const qty = num(it.quantity);
      const cost = num(it.cost);
      const unitPrice = Math.round(cost * (1 + oh) * (1 + mk) * 100) / 100;
      return { ...it, qty, costTotal: qty * cost, unitPrice, total: qty * unitPrice };
    });
    const wrap = (1 + pct(d.fringePct)) * (1 + pct(d.laborOverheadPct)) * (1 + pct(d.gaPct)) * (1 + pct(d.feePct));
    const labor = (d.labor || []).map((l) => {
      const hours = num(l.hours);
      const rate = num(l.rate);
      const fringe = rate * pct(d.fringePct);
      const overhead = (rate + fringe) * pct(d.laborOverheadPct);
      const ga = (rate + fringe + overhead) * pct(d.gaPct);
      const fee = (rate + fringe + overhead + ga) * pct(d.feePct);
      const loaded = Math.round((rate + fringe + overhead + ga + fee) * 100) / 100;
      return { ...l, hours, rate, fringe, overhead, ga, fee, loaded, costTotal: hours * (rate + fringe + overhead + ga), total: hours * loaded };
    });
    const extras = (d.extras || []).map((x) => ({ ...x, value: num(x.amount) }));
    const extrasTotal = extras.reduce((t, x) => t + x.value, 0);
    const price = lines.reduce((t, l) => t + l.total, 0) + labor.reduce((t, l) => t + l.total, 0) + extrasTotal;
    const cost = lines.reduce((t, l) => t + l.costTotal, 0) + labor.reduce((t, l) => t + l.costTotal, 0) + extrasTotal;
    return { lines, labor, extras, wrap, price: Math.round(price * 100) / 100, cost, profit: price - cost, margin: price ? (price - cost) / price : 0 };
  }

  async function viewPricingList(view) {
    const { items } = await api('/pricing');
    view.innerHTML = `
      ${pageHead('Profit Pricing Matrix', 'Turn supplier and subcontractor quotes into a winning price with your overhead and markup built in.',
        `<a href="/app/pricing/new" data-link class="btn-primary">${icon('plus', 'h-4 w-4')}New pricing sheet</a>`)}
      ${isEnterprise() ? '' : `<div class="mb-6">${lockedTeaser('Fringe/G&A Calculation Engine', 'Price labor the way DCAA expects: base rate plus fringe, overhead, G&A and fee, with the full wrap rate shown line by line.')}</div>`}
      ${items.length ? `<div class="card overflow-x-auto p-5"><table class="tbl"><thead><tr><th>Sheet</th><th class="text-right">Total price</th><th>Updated</th></tr></thead><tbody>${items.map((s) => `
        <tr><td><a href="/app/pricing/${s.id}" data-link class="font-medium text-white hover:text-brand-blueSoft">${esc(s.title)}</a></td>
          <td class="text-right text-white">${money2(s.total)}</td><td class="text-mist-400">${fmtDate(s.updatedAt)}</td></tr>`).join('')}</tbody></table></div>`
        : emptyState('No pricing sheets yet', 'Start with your sub or supplier quote. The matrix adds your overhead and profit and formats the price table for your proposal.', '<a href="/app/pricing/new" data-link class="btn-primary">Build a pricing sheet</a>')}`;
  }

  async function viewPricing(view, id) {
    const ent = isEnterprise();
    const [bids, { items: sheets }] = await Promise.all([loadBids(), id === 'new' ? { items: [] } : api('/pricing')]);
    let item = id === 'new' ? null : sheets.find((s) => s.id === String(id));
    if (id !== 'new' && !item) { view.innerHTML = emptyState('Pricing sheet not found', '', '<a href="/app/pricing" data-link class="btn-ghost">Back</a>'); return; }
    const d = Object.assign(blankSheet(), item ? item.data : {});
    const params = new URLSearchParams(location.search);
    let title = item ? item.title : 'Pricing sheet';
    let bidId = item ? item.bidId : params.get('bid');

    const itemRow = (it, i) => `<tr data-row="items" data-i="${i}">
      <td><input class="field !w-20 !px-3 !py-2" data-k="item" maxlength="20" value="${esc(it.item)}" /></td>
      <td><input class="field !min-w-[220px] !py-2" data-k="description" maxlength="300" placeholder="What you are providing" value="${esc(it.description)}" /></td>
      <td><input class="field !w-24 !px-3 !py-2" data-k="unit" maxlength="30" value="${esc(it.unit)}" /></td>
      <td><input class="field !w-20 !px-3 !py-2" data-k="quantity" inputmode="decimal" value="${esc(it.quantity)}" /></td>
      <td><input class="field !w-28 !px-3 !py-2" data-k="cost" inputmode="decimal" placeholder="0.00" value="${esc(it.cost)}" /></td>
      <td class="text-right text-mist-300" data-out="unit">-</td><td class="text-right font-medium text-white" data-out="total">-</td>
      <td><button type="button" class="btn-ghost !px-2.5 !py-2" data-del="items" aria-label="Remove line">&times;</button></td></tr>`;
    const laborRow = (l, i) => `<tr data-row="labor" data-i="${i}">
      <td><input class="field !min-w-[180px] !py-2" data-k="category" maxlength="120" placeholder="e.g. Project Manager" value="${esc(l.category)}" /></td>
      <td><input class="field !w-24 !px-3 !py-2" data-k="hours" inputmode="decimal" value="${esc(l.hours)}" /></td>
      <td><input class="field !w-28 !px-3 !py-2" data-k="rate" inputmode="decimal" placeholder="0.00" value="${esc(l.rate)}" /></td>
      <td class="text-right text-mist-400" data-out="fringe">-</td><td class="text-right text-mist-400" data-out="overhead">-</td>
      <td class="text-right text-mist-400" data-out="ga">-</td><td class="text-right text-mist-400" data-out="fee">-</td>
      <td class="text-right text-mist-200" data-out="loaded">-</td><td class="text-right font-medium text-white" data-out="total">-</td>
      <td><button type="button" class="btn-ghost !px-2.5 !py-2" data-del="labor" aria-label="Remove labor category">&times;</button></td></tr>`;
    const extraRow = (x, i) => `<div class="flex gap-2" data-row="extras" data-i="${i}"><input class="field !py-2" data-k="label" maxlength="100" placeholder="e.g. Freight" value="${esc(x.label)}" />
      <input class="field !w-36 !py-2" data-k="amount" inputmode="decimal" placeholder="0.00" value="${esc(x.amount)}" /><button type="button" class="btn-ghost !px-2.5" data-del="extras" aria-label="Remove charge">&times;</button></div>`;
    const rateField = (k, label, help) => `<div><label class="label" for="pr-${k}">${label}</label><div class="relative"><input id="pr-${k}" class="field !pr-9" data-rate="${k}" inputmode="decimal" value="${esc(d[k])}" /><span class="absolute right-4 top-1/2 -translate-y-1/2 text-mist-500">%</span></div>${help ? `<p class="mt-1 text-xs text-mist-500">${help}</p>` : ''}</div>`;

    view.innerHTML = `<div>
      <div class="no-print">${pageHead(esc(title), ent ? 'Materials and subs, plus fully loaded labor rates.' : 'Your cost, your overhead, your profit, and the price you bid.',
        `<button id="pr-csv" class="btn-ghost">CSV</button><button id="pr-print" class="btn-ghost">Print</button>
         <button id="pr-send" class="btn-ghost">${icon('spark', 'h-4 w-4')}Use in a proposal</button><button id="pr-save" class="btn-primary">Save</button>`)}</div>
      <div class="print-area space-y-6">
        <section class="card p-6">
          <div class="grid gap-4 sm:grid-cols-2">
            <div><label class="label" for="pr-title">Sheet name</label><input id="pr-title" class="field" maxlength="200" value="${esc(title)}" /></div>
            <div><label class="label" for="pr-bid">Opportunity</label><select id="pr-bid" class="field">${bidOptions(bids, bidId)}</select></div>
          </div>
        </section>
        <section class="card p-6">
          <h2 class="font-semibold text-white">Materials, supplies and subcontracts</h2>
          <p class="mt-1 text-sm text-mist-400">Enter each line at your cost (the supplier or sub quote). Overhead and profit are added on top.</p>
          <div class="mt-4 grid gap-4 sm:grid-cols-3">${rateField('overheadPct', 'Overhead on quotes', 'Your allowable indirect costs: insurance, bonding, admin.')}${rateField('markupPct', 'Profit markup', 'Most small-dollar bids land between 10% and 25%.')}</div>
          <div class="mt-5 overflow-x-auto"><table class="tbl min-w-[760px]"><thead><tr><th>Item</th><th>Description</th><th>Unit</th><th>Qty</th><th>Your unit cost</th><th class="text-right">Bid unit price</th><th class="text-right">Line total</th><th></th></tr></thead>
            <tbody id="pr-items"></tbody></table></div>
          <button type="button" class="btn-ghost no-print mt-3" data-add="items">${icon('plus', 'h-4 w-4')}Add line</button>
        </section>
        ${ent ? `<section class="card p-6">
          <div class="flex flex-wrap items-center justify-between gap-2"><h2 class="font-semibold text-white">Labor, fully loaded</h2><span class="edition-badge">Fringe/G&amp;A engine</span></div>
          <p class="mt-1 text-sm text-mist-400">Base hourly wage, then fringe on wages, overhead on wages and fringe, G&amp;A on the total cost, and fee last. This is the order DCAA expects.</p>
          <div class="mt-4 grid gap-4 sm:grid-cols-4">${rateField('fringePct', 'Fringe', 'Taxes, health, PTO, retirement.')}${rateField('laborOverheadPct', 'Overhead', 'Facilities, supervision, equipment.')}${rateField('gaPct', 'G&amp;A', 'Company-wide admin costs.')}${rateField('feePct', 'Fee / profit', '')}</div>
          <p class="mt-3 text-sm text-mist-300">Wrap rate <span id="pr-wrap" class="font-semibold text-white">-</span> <span class="text-mist-500">(every $1.00 of wages bills at this amount)</span></p>
          <div class="mt-4 overflow-x-auto"><table class="tbl min-w-[900px]"><thead><tr><th>Labor category</th><th>Hours</th><th>Base rate</th><th class="text-right">Fringe</th><th class="text-right">Overhead</th><th class="text-right">G&amp;A</th><th class="text-right">Fee</th><th class="text-right">Billed rate</th><th class="text-right">Total</th><th></th></tr></thead>
            <tbody id="pr-labor"></tbody></table></div>
          <button type="button" class="btn-ghost no-print mt-3" data-add="labor">${icon('plus', 'h-4 w-4')}Add labor category</button>
        </section>` : `<div class="no-print">${lockedTeaser('Fringe/G&A Calculation Engine', 'Enterprise prices labor with fringe, overhead, G&A and fee stacked the way DCAA expects, and shows your wrap rate.')}</div>`}
        <section class="card p-6">
          <h2 class="font-semibold text-white">Other charges at cost</h2>
          <div id="pr-extras" class="mt-3 space-y-2"></div>
          <button type="button" class="btn-ghost no-print mt-3" data-add="extras">${icon('plus', 'h-4 w-4')}Add a charge</button>
        </section>
        <section class="card grid gap-4 p-6 sm:grid-cols-4">
          <div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">Your cost</p><p id="pr-cost" class="mt-1 text-xl font-semibold text-white">-</p></div>
          <div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">Profit</p><p id="pr-profit" class="mt-1 text-xl font-semibold text-emerald-300">-</p></div>
          <div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">Margin</p><p id="pr-margin" class="mt-1 text-xl font-semibold text-white">-</p></div>
          <div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">Bid price</p><p id="pr-price" class="mt-1 text-2xl font-bold accent-text">-</p></div>
        </section>
      </div></div>`;
    const page = view.firstElementChild;

    const drawRows = () => {
      $('#pr-items').innerHTML = d.items.map(itemRow).join('');
      if (ent) $('#pr-labor').innerHTML = d.labor.map(laborRow).join('');
      $('#pr-extras').innerHTML = d.extras.map(extraRow).join('');
      recalc();
    };
    const recalc = () => {
      const r = priceSheet(d);
      $$('[data-row=items]', view).forEach((tr, i) => {
        const l = r.lines[i];
        $('[data-out=unit]', tr).textContent = l && l.cost !== '' ? money2(l.unitPrice) : '-';
        $('[data-out=total]', tr).textContent = l && l.cost !== '' ? money2(l.total) : '-';
      });
      if (ent) {
        $('#pr-wrap').textContent = '$' + r.wrap.toFixed(4);
        $$('[data-row=labor]', view).forEach((tr, i) => {
          const l = r.labor[i];
          ['fringe', 'overhead', 'ga', 'fee', 'loaded'].forEach((k) => { $(`[data-out=${k}]`, tr).textContent = l.rate ? money2(l[k]) : '-'; });
          $('[data-out=total]', tr).textContent = l.rate ? money2(l.total) : '-';
        });
      }
      $('#pr-cost').textContent = money2(r.cost);
      $('#pr-profit').textContent = money2(r.profit);
      $('#pr-margin').textContent = (r.margin * 100).toFixed(1) + '%';
      $('#pr-price').textContent = money2(r.price);
      return r;
    };
    drawRows();

    page.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'pr-title') title = t.value;
      else if (t.id === 'pr-bid') bidId = t.value;
      else if (t.dataset.rate) d[t.dataset.rate] = t.value;
      else if (t.dataset.k) { const row = t.closest('[data-row]'); d[row.dataset.row][Number(row.dataset.i)][t.dataset.k] = t.value; }
      else return;
      recalc();
    });
    $('#pr-bid').addEventListener('change', (e) => { bidId = e.target.value; });
    $('.print-area', view).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.add === 'items') d.items.push({ item: String(d.items.length + 1).padStart(4, '0'), description: '', unit: 'Each', quantity: '1', cost: '' });
      else if (b.dataset.add === 'labor') d.labor.push({ category: '', hours: '', rate: '' });
      else if (b.dataset.add === 'extras') d.extras.push({ label: '', amount: '' });
      else if (b.dataset.del) d[b.dataset.del].splice(Number(b.closest('[data-row]').dataset.i), 1);
      else return;
      drawRows();
    });

    const save = async () => {
      const r = priceSheet(d);
      const body = { title: title.trim() || 'Pricing sheet', bidId: bidId ? Number(bidId) : null, data: d, total: r.price };
      if (item) item = (await api('/pricing/' + item.id, { method: 'PATCH', body })).item;
      else {
        item = (await api('/pricing', { method: 'POST', body })).item;
        history.replaceState(null, '', '/app/pricing/' + item.id);
      }
      return item;
    };
    $('#pr-save').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try { await save(); toast('Pricing sheet saved.'); } catch (err) { toast(err.message, 'error'); }
      e.target.disabled = false;
    });
    $('#pr-print').addEventListener('click', () => window.print());
    $('#pr-csv').addEventListener('click', () => {
      const r = priceSheet(d);
      const rows = [['Item', 'Description', 'Unit', 'Quantity', 'Unit cost', 'Bid unit price', 'Line total']];
      r.lines.forEach((l) => rows.push([l.item, l.description, l.unit, l.qty, num(l.cost).toFixed(2), l.unitPrice.toFixed(2), l.total.toFixed(2)]));
      if (r.labor.length) {
        rows.push([], ['Labor category', 'Hours', 'Base rate', 'Fringe', 'Overhead', 'G&A', 'Fee', 'Billed rate', 'Total']);
        r.labor.forEach((l) => rows.push([l.category, l.hours, l.rate.toFixed(2), l.fringe.toFixed(2), l.overhead.toFixed(2), l.ga.toFixed(2), l.fee.toFixed(2), l.loaded.toFixed(2), l.total.toFixed(2)]));
      }
      r.extras.forEach((x) => rows.push([x.label, '', '', '', '', '', x.value.toFixed(2)]));
      rows.push([], ['Total cost', r.cost.toFixed(2)], ['Profit', r.profit.toFixed(2)], ['Bid price', r.price.toFixed(2)]);
      csvDownload((title || 'pricing').replace(/[^a-z0-9]+/gi, '-') + '.csv', rows);
    });
    $('#pr-send').addEventListener('click', async () => {
      const r = priceSheet(d);
      const items = [
        ...r.lines.filter((l) => l.description).map((l) => ({ item: l.item, description: l.description, unit: l.unit, quantity: String(l.qty), unitPrice: l.unitPrice.toFixed(2) })),
        ...r.labor.filter((l) => l.category).map((l, i) => ({ item: `L${String(i + 1).padStart(3, '0')}`, description: l.category, unit: 'Hour', quantity: String(l.hours), unitPrice: l.loaded.toFixed(2) })),
      ];
      if (!items.length) { toast('Add at least one line with a description first.', 'error'); return; }
      try { await save(); } catch (err) { toast(err.message, 'error'); return; }
      try {
        sessionStorage.setItem('gpp-pricing', JSON.stringify({ title, bidId, items, extras: r.extras.filter((x) => x.label && x.value).map((x) => ({ label: x.label, amount: x.value.toFixed(2) })) }));
      } catch { /* storage blocked: the member re-enters prices */ }
      navigate('/proposals/new');
    });
  }
