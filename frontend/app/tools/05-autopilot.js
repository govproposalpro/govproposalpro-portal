  // ------------------------------------------------------------------ GovCon Autopilot (Enterprise)

  const AP_STAGES = [
    ['reading', 'Reading', 'Solicitation, attachments and Go/No-Go'],
    ['quoting', 'Sourcing', 'Market prices and vendor quotes'],
    ['pricing', 'Pricing', 'Cost, overhead and your margin'],
    ['writing', 'Writing', 'The full proposal'],
    ['ready', 'Ready', 'Waiting for your review'],
    ['submitted', 'Submitted', 'Sent to the government'],
  ];
  const AP_ORDER = ['found', ...AP_STAGES.map((s) => s[0])];
  const apStagePill = (s) => ({
    ready: '<span class="pill bg-emerald-500/15 text-emerald-300">Ready for review</span>',
    submitted: '<span class="pill bg-white/[0.08] text-mist-300">Submitted</span>',
    skipped: '<span class="pill bg-white/[0.06] text-mist-400">Skipped</span>',
    failed: '<span class="pill bg-brand-red/15 text-brand-redSoft">Stopped</span>',
  }[s] || `<span class="pill bg-brand-blue/20 text-brand-blueSoft"><span class="spinner !h-3 !w-3"></span>${esc((AP_STAGES.find((x) => x[0] === s) || [s, 'Working'])[1])}</span>`);

  const keyState = (k) => (k.broken ? '<span class="pill bg-brand-red/15 text-brand-redSoft">Re-enter</span>'
    : k.set ? `<span class="pill bg-emerald-500/15 text-emerald-300">Saved ····${esc(k.last4)}</span>` : '<span class="pill bg-white/[0.06] text-mist-400">Not set</span>');

  async function viewAutopilot(view) {
    const data = await api('/autopilot');
    const s = data.settings;
    const ready = s.configured && s.samKey.set && !s.samKey.broken && s.aiKey.set && !s.aiKey.broken && s.naics;
    if (!ready || new URLSearchParams(location.search).get('setup')) return viewAutopilotSetup(view, data);

    const run = data.lastRun;
    const working = run && run.status === 'working';
    const left = Math.max(0, s.dailyQuota - data.today);
    const active = data.items.filter((i) => !['skipped', 'failed', 'submitted'].includes(i.stage));
    const done = data.items.filter((i) => ['skipped', 'failed', 'submitted'].includes(i.stage));
    const lane = (key, label) => {
      const items = active.filter((i) => (key === 'reading' ? ['found', 'reading'].includes(i.stage) : i.stage === key));
      return `<section class="ap-lane"><header class="mb-3 flex items-center justify-between px-1"><h3 class="text-sm font-semibold text-white">${label}</h3><span class="text-xs text-mist-500">${items.length}</span></header>
        <div class="flex flex-col gap-2.5">${items.map(apCard).join('') || '<p class="px-1 text-xs text-mist-500">Nothing here</p>'}</div></section>`;
    };

    view.innerHTML = `
      <section class="ap-hero card relative mb-6 overflow-hidden p-6 sm:p-8">
        <div class="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl accent-glow"></div>
        <div class="relative flex flex-wrap items-start justify-between gap-6">
          <div class="max-w-2xl">
            <span class="edition-badge">${icon('bolt', 'h-3.5 w-3.5')}GovCon Autopilot</span>
            <h1 class="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">${working ? 'Autopilot is <span class="accent-text">working</span>.' : left ? 'Ready when <span class="accent-text">you are</span>.' : 'Today\'s bids are <span class="accent-text">done</span>.'}</h1>
            <p class="mt-2 text-mist-400">It finds solicitations that fit ${esc(memberCompany())}, reads them, emails vendors for quotes, checks real award prices, prices every line at your ${esc(s.marginPct)}% margin and writes the proposal. You review and submit.</p>
            <div class="mt-5 flex flex-wrap gap-2 text-xs">
              <span class="pill bg-white/[0.06] text-mist-300">NAICS ${esc(s.naics)}</span>
              <span class="pill bg-white/[0.06] text-mist-300">${esc(s.marginPct)}% margin · ${esc(s.overheadPct)}% overhead</span>
              <span class="pill bg-white/[0.06] text-mist-300">${s.states ? esc(s.states) : 'All states'}</span>
              <span class="pill ${data.mailboxReady ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.06] text-mist-400'}">${data.mailboxReady ? (s.autoEmail ? 'Emails vendors automatically' : 'Email connected') : 'Email not connected'}</span>
            </div>
          </div>
          <div class="w-full rounded-3xl border border-white/[0.08] bg-black/30 p-5 sm:w-72">
            <p class="text-sm text-mist-400">Bids today</p>
            <p class="mt-1 text-4xl font-bold text-white">${data.today}<span class="text-xl font-medium text-mist-500"> / ${s.dailyQuota}</span></p>
            <div class="meter mt-3"><span id="ap-meter"></span></div>
            <button id="ap-run" class="btn-primary mt-5 w-full" ${working || !left ? 'disabled' : ''}>${working ? '<span class="spinner"></span>Running' : `${icon('bolt', 'h-4 w-4')}Run Autopilot${left > 1 ? ` (${left} bids)` : ''}`}</button>
            <a href="/app/autopilot?setup=1" data-link class="btn-ghost mt-2 w-full">Settings</a>
          </div>
        </div>
      </section>

      ${run ? `<section class="card mb-6 p-5 sm:p-6">
        <div class="mb-3 flex items-center justify-between"><h2 class="font-semibold text-white">${working ? 'Live run' : 'Last run'}</h2><span class="text-xs text-mist-500">${fmtDate(run.createdAt)} ${new Date(run.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span></div>
        <ol class="ap-log">${(run.log || []).slice(-14).map((l) => `<li><span>${new Date(l.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>${esc(l.msg)}</li>`).join('') || '<li><span></span>Starting up</li>'}
        ${working ? '<li class="ap-live"><span></span><i class="spinner !h-3 !w-3"></i></li>' : ''}</ol>
      </section>` : ''}

      ${data.items.length ? `
      <div class="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8"><div class="flex gap-4">
        ${lane('reading', 'Reading')}${lane('quoting', 'Sourcing')}${lane('pricing', 'Pricing')}${lane('writing', 'Writing')}${lane('ready', 'Ready for you')}
      </div></div>
      ${done.length ? `<section class="card mt-6 p-6"><h2 class="mb-3 font-semibold text-white">History</h2><ul class="space-y-2">${done.slice(0, 20).map((i) => `
        <li><a href="/app/autopilot/${i.id}" data-link class="row-link"><span class="min-w-0"><span class="block truncate text-sm font-medium text-white">${esc(i.title)}</span>
          <span class="block truncate text-xs text-mist-500">${esc(i.reason || i.agency || '')}</span></span>${apStagePill(i.stage)}</a></li>`).join('')}</ul></section>` : ''}`
      : emptyState('Your pipeline is empty', 'Press Run Autopilot. It searches SAM.gov with your settings and builds today\'s bids while you do other work.')}`;

    requestAnimationFrame(() => { const m = $('#ap-meter'); if (m) m.style.width = Math.min(100, (data.today / s.dailyQuota) * 100) + '%'; });
    $('#ap-run').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try {
        await api('/autopilot/run', { method: 'POST', body: { count: left } });
        toast('Autopilot started. You can leave this page; it keeps working.');
        render();
      } catch (err) {
        toast(err.message, 'error');
        if (err.data && err.data.setupRequired) navigate('/autopilot?setup=1');
        else e.currentTarget.disabled = false;
      }
    });
    if (working || active.some((i) => !['ready'].includes(i.stage))) every(4000, async () => {
      const fresh = await api('/autopilot').catch(() => null);
      if (!fresh) return;
      const sig = (d) => JSON.stringify([d.lastRun && [d.lastRun.status, (d.lastRun.log || []).length], d.items.map((i) => i.stage)]);
      if (sig(fresh) !== sig(data)) render();
    });
  }

  const apCard = (i) => `<a href="/app/autopilot/${i.id}" data-link class="bid-card !cursor-pointer block">
    <div class="flex items-start gap-3">${scoreRing(i.score, 'h-10 w-10 text-xs')}
      <div class="min-w-0"><p class="text-sm font-semibold leading-snug text-white">${esc(i.title)}</p>
        ${i.agency ? `<p class="mt-1 truncate text-xs text-mist-400">${esc(i.agency)}</p>` : ''}</div></div>
    <div class="mt-2.5 flex flex-wrap gap-1.5">
      ${i.dueAt ? `<span class="pill bg-white/[0.06] text-mist-300">${icon('cal', 'h-3 w-3')}${fmtDate(i.dueAt)}</span>` : ''}
      ${i.priceTotal ? `<span class="pill bg-white/[0.06] text-mist-300">${fmtMoney(i.priceTotal)}</span>` : ''}
      ${i.quoteCount ? `<span class="pill bg-emerald-500/15 text-emerald-300">${i.quoteCount} quote${i.quoteCount === 1 ? '' : 's'}</span>` : ''}
      ${apStagePill(i.stage)}
    </div></a>`;

  // ------------------------------------------------------------------ Autopilot item

  async function viewAutopilotItem(view, id) {
    const { item: i } = await api('/autopilot/items/' + id);
    const at = AP_ORDER.indexOf(i.stage);
    const m = i.market || {};
    const p = i.pricing || {};
    const ap = p.autopilot || {};
    const unitPrice = (it) => num(it.cost) * (1 + num(p.overheadPct) / 100) * (1 + num(p.markupPct) / 100);
    const steps = AP_STAGES.map(([k, label, sub], n) => {
      const st = ['skipped', 'failed'].includes(i.stage) ? (n === 0 ? 'stop' : '') : at > n + 1 || i.stage === 'submitted' ? 'done' : at === n + 1 ? 'now' : '';
      return `<li class="ap-step ${st}"><span class="ap-dot">${st === 'done' ? icon('check', 'h-3.5 w-3.5') : n + 1}</span><span><b>${label}</b><small>${sub}</small></span></li>`;
    }).join('');

    view.innerHTML = `
      <a href="/app/autopilot" data-link class="mb-4 inline-flex items-center gap-1 text-sm text-mist-400 hover:text-white">&larr; Autopilot</a>
      <section class="card relative mb-6 overflow-hidden p-6 sm:p-8">
        <div class="flex flex-wrap items-start gap-5">
          ${scoreRing(i.score, 'h-16 w-16')}
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap gap-2">${apStagePill(i.stage)}${i.solNumber ? `<span class="pill bg-white/[0.06] text-mist-300">${esc(i.solNumber)}</span>` : ''}${i.dueAt ? `<span class="pill bg-white/[0.06] text-mist-300">${icon('cal', 'h-3 w-3')}Due ${fmtDate(i.dueAt)}</span>` : ''}</div>
            <h1 class="mt-3 text-2xl font-bold tracking-tight text-white">${esc(i.title)}</h1>
            <p class="mt-1 text-mist-400">${esc(i.agency || '')}</p>
            ${i.reason ? `<p class="mt-3 text-sm ${['skipped', 'failed'].includes(i.stage) ? 'text-brand-redSoft' : 'text-mist-400'}">${esc(i.reason)}</p>` : ''}
          </div>
          <div class="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-col">
            ${i.proposalId ? `<a href="/app/proposals/${i.proposalId}" data-link class="btn-primary">${icon('proposal', 'h-4 w-4')}Open proposal</a>` : ''}
            ${i.rfpSummaryId ? `<a href="/app/decryptor/${i.rfpSummaryId}" data-link class="btn-ghost">${icon('decrypt', 'h-4 w-4')}Solicitation summary</a>` : ''}
            ${i.pricingSheetId ? `<a href="/app/pricing/${i.pricingSheetId}" data-link class="btn-ghost">${icon('dollar', 'h-4 w-4')}Pricing sheet</a>` : ''}
            <a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer" class="btn-ghost">Open on SAM.gov</a>
          </div>
        </div>
        <ol class="ap-steps mt-8">${steps}</ol>
        ${i.stage === 'ready' ? `<div class="mt-6 flex flex-wrap gap-2 border-t border-white/[0.06] pt-5"><button id="ap-submitted" class="btn-primary">I submitted it</button><button id="ap-pass" class="btn-ghost">Pass on this one</button>
          <p class="w-full text-xs text-mist-500">Read the proposal, confirm every price and fill any [INSERT] placeholders before you submit. The government only sees what you send.</p></div>` : ''}
      </section>

      <div class="grid items-start gap-6 xl:grid-cols-2">
        ${sectionCard('Market check', m.count ? `
          <p class="text-sm text-mist-400">${esc(m.count)} comparable federal awards (${esc(m.basis)}) from USAspending.gov.</p>
          <div class="mt-4 grid grid-cols-3 gap-2">${[['Low', m.low], ['Median', m.median], ['High', m.high]].map(([l, v]) => `<div class="tile"><p class="text-xs text-mist-500">${l}</p><p class="mt-1 text-lg font-bold text-white">${fmtMoney(v)}</p></div>`).join('')}</div>
          <div class="mt-4 overflow-x-auto"><table class="tbl"><thead><tr><th>Awardee</th><th>Agency</th><th class="text-right">Amount</th></tr></thead><tbody>${(m.awards || []).map((a) => `
            <tr><td>${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" class="text-brand-blueSoft hover:text-white">${esc(a.recipient)}</a>` : esc(a.recipient)}<p class="text-xs text-mist-500">${esc(a.description).slice(0, 110)}</p></td>
              <td class="text-mist-400">${esc(a.agency || '')}<p class="text-xs text-mist-500">${esc(a.start || '')}</p></td><td class="text-right">${fmtMoney(a.amount)}</td></tr>`).join('')}</tbody></table></div>`
          : '<p class="text-sm text-mist-500">No market data yet for this one.</p>')}

        ${sectionCard('Price build-up', (p.items || []).length ? `
          <p class="text-sm text-mist-400">Cost estimate, plus ${esc(p.overheadPct)}% overhead and a ${esc(ap.marginPct ?? '')}% profit margin. Confidence: <b class="text-white">${esc(ap.confidence || 'n/a')}</b>.</p>
          <div class="mt-4 overflow-x-auto"><table class="tbl"><thead><tr><th>Item</th><th class="text-right">Qty</th><th class="text-right">Your cost</th><th class="text-right">Bid price</th></tr></thead><tbody>${p.items.map((it) => `
            <tr><td>${esc(it.description)}<p class="text-xs text-mist-500">${esc(it.basis || '')}</p></td><td class="text-right">${esc(it.quantity)} ${esc(it.unit)}</td>
              <td class="text-right text-mist-400">${money2(it.cost)}</td><td class="text-right font-medium">${money2(unitPrice(it))}</td></tr>`).join('')}</tbody></table></div>
          <p class="mt-3 text-right text-lg font-bold text-white">Total ${money2(i.priceTotal)}</p>
          ${(ap.assumptions || []).length ? `<div class="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm text-amber-100"><p class="font-semibold">Confirm before you submit</p><ul class="mt-2 space-y-1">${ap.assumptions.map((a) => `<li>• ${esc(a)}</li>`).join('')}</ul></div>` : ''}`
          : '<p class="text-sm text-mist-500">Pricing appears here once the Autopilot reaches this step.</p>')}

        ${sectionCard('Vendors and subcontractors', `
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2"><p class="text-sm text-mist-400">Active SAM.gov registrants near the work. Replies with a price land here on your next run.</p>
            ${i.subs.some((x) => x.email && !(x.outreach || {}).quote_request) ? '<button id="ap-quotes" class="btn-ghost">' + icon('mail', 'h-4 w-4') + 'Email quote requests</button>' : ''}</div>
          ${i.subs.length ? `<ul class="space-y-2">${i.subs.map((x) => `<li class="tile flex flex-wrap items-center justify-between gap-2">
            <span class="min-w-0"><span class="block truncate text-sm font-medium text-white">${esc(x.company)}</span><span class="block truncate text-xs text-mist-500">${esc([x.contactName, x.email || 'No email listed', x.phone, x.location].filter(Boolean).join(' · '))}</span></span>
            ${x.quote ? `<span class="pill bg-emerald-500/15 text-emerald-300">Quoted ${fmtMoney(x.quote)}</span>` : (x.outreach || {}).quote_request ? '<span class="pill bg-brand-blue/15 text-brand-blueSoft">Asked ' + fmtDate((x.outreach || {}).quote_request) + '</span>' : ''}</li>`).join('')}</ul>`
            : '<p class="text-sm text-mist-500">None found yet.</p>'}`)}

        ${sectionCard('Quotes received', (i.quotes || []).length ? `<ul class="space-y-2">${i.quotes.map((q) => `<li class="tile"><div class="flex items-center justify-between gap-2"><span class="truncate text-sm text-white">${esc(q.from)}</span><b class="text-white">${money2(q.total)}</b></div>
          <p class="mt-1 text-xs text-mist-500">${esc([q.leadTime && `Lead time ${q.leadTime}`, q.notes, fmtDate(q.receivedAt)].filter(Boolean).join(' · '))}</p></li>`).join('')}</ul>
          <p class="mt-3 text-xs text-mist-500">Swap a quote into the pricing sheet to tighten your price before you submit.</p>`
          : '<p class="text-sm text-mist-500">No vendor quotes yet. They are picked up from your inbox each time the Autopilot runs.</p>')}
      </div>`;

    const q = $('#ap-quotes');
    if (q) q.addEventListener('click', async () => {
      q.disabled = true;
      try { const r = await api(`/autopilot/items/${id}/send-quotes`, { method: 'POST' }); toast(r.sent ? `Sent ${r.sent} quote request${r.sent === 1 ? '' : 's'} from your email.` : 'Nothing new to send.'); render(); }
      catch (err) { toast(err.message, 'error'); q.disabled = false; }
    });
    const mark = (stage, msg) => async () => {
      try { await api('/autopilot/items/' + id, { method: 'PATCH', body: { stage } }); toast(msg); navigate('/autopilot'); } catch (err) { toast(err.message, 'error'); }
    };
    if ($('#ap-submitted')) $('#ap-submitted').addEventListener('click', mark('submitted', 'Marked submitted. It moved to Submitted on your Bid CRM.'));
    if ($('#ap-pass')) $('#ap-pass').addEventListener('click', mark('skipped', 'Passed. The Autopilot will not bring it back.'));
    if (['reading', 'quoting', 'pricing', 'writing'].includes(i.stage)) every(5000, () => render());
  }

  // ------------------------------------------------------------------ Autopilot setup (the learning phase)

  function viewAutopilotSetup(view, data) {
    const s = data.settings;
    const learned = s.learned || {};
    const sec = (n, title, sub, body) => `<section class="card p-6 sm:p-8"><div class="flex gap-4"><span class="ap-num">${n}</span><div class="min-w-0 flex-1">
      <h2 class="text-lg font-semibold text-white">${title}</h2><p class="mt-1 text-sm text-mist-400">${sub}</p><div class="mt-5">${body}</div></div></div></section>`;
    const pct = (id, label, v, help) => `<div><label class="label" for="${id}">${label}</label><div class="relative"><input id="${id}" class="field !pr-9" inputmode="decimal" value="${esc(v)}" /><span class="absolute right-4 top-1/2 -translate-y-1/2 text-mist-500">%</span></div><p class="mt-1 text-xs text-mist-500">${help}</p></div>`;
    const learnedHtml = () => (learned.summary ? `<div class="ap-learned mt-5"><p class="text-xs font-semibold uppercase tracking-widest text-brand-blueSoft">What the Autopilot learned</p>
      <p class="mt-2 text-sm text-mist-100">${esc(learned.summary)}</p>
      <div class="mt-3 flex flex-wrap gap-1.5">${(learned.naics || []).map((n) => `<span class="pill bg-brand-blue/15 text-brand-blueSoft">${esc(n.code)} ${esc(n.title)}</span>`).join('')}</div>
      ${(learned.ideal_contracts || []).length ? `<p class="mt-4 text-xs font-semibold text-mist-300">Goes after first</p><ul class="mt-1 space-y-1 text-sm text-mist-400">${learned.ideal_contracts.map((x) => `<li>• ${esc(x)}</li>`).join('')}</ul>` : ''}
      ${(learned.avoid || []).length ? `<p class="mt-3 text-xs font-semibold text-mist-300">Skips</p><ul class="mt-1 space-y-1 text-sm text-mist-400">${learned.avoid.map((x) => `<li>• ${esc(x)}</li>`).join('')}</ul>` : ''}</div>` : '');

    view.innerHTML = `
      <div class="mx-auto max-w-3xl space-y-6">
        <div>
          <span class="edition-badge">${icon('bolt', 'h-3.5 w-3.5')}GovCon Autopilot</span>
          <h1 class="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">Teach it your business once.<br /><span class="accent-text">It bids for you every day.</span></h1>
          <p class="mt-3 text-mist-400">Tell it what you do, connect your SAM.gov and Anthropic accounts, set your margin and how many bids a day. Then press Run whenever you want it to work. It never runs on its own.</p>
        </div>

        ${sec(1, 'What do you do?', 'In your own words: what you do today or plan to do, where you work, and whether you want prime contracts, subcontracts or both. Landscaper, janitorial company, IT shop, supplier: anything goes.', `
          <textarea id="ap-desc" class="field min-h-[130px]" maxlength="6000" placeholder="Example: We're a 6-person landscaping and snow removal company in Columbus, Ohio. We maintain HOA and commercial properties and want federal grounds maintenance work at VA clinics, Army Reserve centers and post offices within 150 miles. We can also sub to a bigger prime.">${esc(s.description)}</textarea>
          <div class="mt-3 flex flex-wrap items-center gap-3"><button id="ap-learn" class="btn-primary">${icon('spark', 'h-4 w-4')}Learn my business</button><span class="text-xs text-mist-500">Uses your Anthropic key if saved below.</span></div>
          <div id="ap-learned">${learnedHtml()}</div>
          <div class="mt-6 grid gap-5 sm:grid-cols-2">
            <div class="sm:col-span-2"><label class="label" for="ap-naics">NAICS codes it searches *</label><input id="ap-naics" class="field" value="${esc(s.naics)}" placeholder="561730, 561720" /></div>
            <div class="sm:col-span-2"><label class="label" for="ap-keywords">Words to look for in titles</label><input id="ap-keywords" class="field" value="${esc(s.keywords)}" placeholder="grounds maintenance, mowing, snow removal" /></div>
            <div><label class="label" for="ap-role">You want to be the</label><select id="ap-role" class="field">${[['prime', 'Prime contractor'], ['sub', 'Subcontractor'], ['both', 'Either']].map(([v, l]) => `<option value="${v}" ${s.role === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div><label class="label" for="ap-states">States (blank = anywhere)</label><input id="ap-states" class="field" value="${esc(s.states)}" placeholder="OH, KY, IN" /></div>
          </div>`)}

        ${sec(2, 'Connect your accounts', 'The Autopilot searches SAM.gov and writes with Claude on your own accounts, so you control the usage and the bill. Keys are encrypted the moment you save them and are never shown again.', `
          <div class="space-y-5">
            <div><div class="flex items-center justify-between gap-2"><label class="label !mb-0" for="ap-sam">SAM.gov API key *</label>${keyState(s.samKey)}</div>
              <input id="ap-sam" class="field mt-1.5" type="password" autocomplete="off" placeholder="${s.samKey.set ? 'Saved. Paste a new key to replace it.' : 'Paste your SAM.gov public API key'}" />
              <p class="mt-1 text-xs text-mist-500">Free. Sign in at sam.gov, open Workspace, then your profile's Account Details, and request a Public API Key.</p>
              <button type="button" data-test="sam" class="btn-ghost mt-2 !py-1.5 !text-xs" ${s.samKey.set ? '' : 'disabled'}>Test SAM.gov key</button></div>
            <div><div class="flex items-center justify-between gap-2"><label class="label !mb-0" for="ap-ai">Anthropic API key *</label>${keyState(s.aiKey)}</div>
              <input id="ap-ai" class="field mt-1.5" type="password" autocomplete="off" placeholder="${s.aiKey.set ? 'Saved. Paste a new key to replace it.' : 'sk-ant-...'}" />
              <p class="mt-1 text-xs text-mist-500">Create one at console.anthropic.com under API Keys and add a few dollars of credit. Anthropic bills you directly for what the Autopilot reads and writes. Set a monthly spend limit there for peace of mind.</p>
              <button type="button" data-test="ai" class="btn-ghost mt-2 !py-1.5 !text-xs" ${s.aiKey.set ? '' : 'disabled'}>Test Anthropic key</button></div>
          </div>`)}

        ${sec(3, 'Your email, for vendor quotes', 'Optional. Quote requests go out from your own address so vendors reply to you, and the Autopilot reads their prices from your inbox. Gmail, Outlook, Yahoo and iCloud need an app password, not your normal one.', `
          <div class="grid gap-5 sm:grid-cols-2">
            <div><label class="label" for="ap-email">Email address</label><input id="ap-email" class="field" type="email" autocomplete="off" value="${esc(s.smtpUser)}" /></div>
            <div><div class="flex items-center justify-between gap-2"><label class="label !mb-0" for="ap-pass">App password</label>${keyState(s.email)}</div><input id="ap-pass" class="field mt-1.5" type="password" autocomplete="new-password" placeholder="${s.email.set ? 'Saved' : ''}" /></div>
            <div><label class="label" for="ap-from">Send as</label><input id="ap-from" class="field" value="${esc(s.fromName)}" /></div>
            <div class="flex items-end"><label class="flex items-start gap-3 text-sm text-mist-100"><input id="ap-auto" type="checkbox" class="mt-1 accent-brand-blue" ${s.autoEmail ? 'checked' : ''} /><span>Email vendors automatically during a run (up to ${5} per bid). Off: you send them with one click.</span></label></div>
          </div>
          <details class="mt-4 text-sm text-mist-400"><summary class="cursor-pointer text-mist-300">Other email provider</summary>
            <div class="mt-3 grid gap-4 sm:grid-cols-4">
              <div class="sm:col-span-3"><label class="label" for="ap-smtp">SMTP server</label><input id="ap-smtp" class="field" value="${esc(s.smtpHost)}" placeholder="smtp.yourdomain.com" /></div>
              <div><label class="label" for="ap-smtp-port">Port</label><input id="ap-smtp-port" class="field" inputmode="numeric" value="${esc(s.smtpPort)}" /></div>
              <div class="sm:col-span-3"><label class="label" for="ap-imap">IMAP server</label><input id="ap-imap" class="field" value="${esc(s.imapHost)}" placeholder="imap.yourdomain.com" /></div>
              <div><label class="label" for="ap-imap-port">Port</label><input id="ap-imap-port" class="field" inputmode="numeric" value="${esc(s.imapPort)}" /></div>
            </div><p class="mt-2 text-xs text-mist-500">Leave these blank for Gmail, Outlook, Yahoo, iCloud and Zoho; we fill them in.</p></details>
          <button type="button" data-test="email" class="btn-ghost mt-4 !py-1.5 !text-xs" ${s.email.set ? '' : 'disabled'}>Test email sign-in</button>`)}

        ${sec(4, 'Your pricing and pace', 'Every line item is priced as your cost, plus overhead, plus your profit margin. The Autopilot stops once it has finished this many bids in a day.', `
          <div class="grid gap-5 sm:grid-cols-2">
            ${pct('ap-margin', 'Profit margin *', s.marginPct, 'Share of the final price you keep. 20% is common for small business bids.')}
            ${pct('ap-overhead', 'Overhead', s.overheadPct, 'Insurance, admin, fuel and everything not in a quote.')}
            <div><label class="label" for="ap-quota">Bids per day</label><select id="ap-quota" class="field">${[1, 2, 3, 4, 5].map((n) => `<option ${Number(s.dailyQuota) === n ? 'selected' : ''}>${n}</option>`).join('')}</select><p class="mt-1 text-xs text-mist-500">Finished proposals per day. No-go solicitations it skips don't count.</p></div>
            <div><label class="label" for="ap-days">Skip if due in fewer than</label><div class="relative"><input id="ap-days" class="field !pr-14" inputmode="numeric" value="${esc(s.minDaysLeft)}" /><span class="absolute right-4 top-1/2 -translate-y-1/2 text-mist-500">days</span></div></div>
          </div>`)}

        ${errBox('ap-error')}
        <div class="sticky bottom-4 flex flex-wrap justify-end gap-2">
          ${s.configured ? '<a href="/app/autopilot" data-link class="btn-ghost bg-black/70 backdrop-blur">Cancel</a>' : ''}
          <button id="ap-save" class="btn-primary">${icon('bolt', 'h-4 w-4')}Save and open Autopilot</button>
        </div>
      </div>`;

    const v = (id) => $('#' + id).value;
    const collect = () => {
      const body = {
        description: v('ap-desc'), naics: v('ap-naics'), keywords: v('ap-keywords'), role: v('ap-role'), states: v('ap-states'),
        marginPct: num(v('ap-margin')), overheadPct: num(v('ap-overhead')), dailyQuota: num(v('ap-quota')), minDaysLeft: num(v('ap-days')),
        smtpUser: v('ap-email').trim(), fromName: v('ap-from'), autoEmail: $('#ap-auto').checked,
        smtpHost: v('ap-smtp').trim(), smtpPort: v('ap-smtp-port') ? num(v('ap-smtp-port')) : null, imapHost: v('ap-imap').trim(), imapPort: v('ap-imap-port') ? num(v('ap-imap-port')) : null,
      };
      if (v('ap-sam').trim()) body.samKey = v('ap-sam').trim();
      if (v('ap-ai').trim()) body.aiKey = v('ap-ai').trim();
      if (v('ap-pass')) body.emailPassword = v('ap-pass');
      if (!body.smtpUser) Object.assign(body, { smtpUser: '', smtpHost: '', imapHost: '' });
      if (!body.naics.trim()) delete body.naics;
      return body;
    };
    const saveAll = async () => {
      const r = await api('/autopilot/settings', { method: 'PUT', body: collect() });
      ['ap-sam', 'ap-ai', 'ap-pass'].forEach((id) => { $('#' + id).value = ''; });
      return r.settings;
    };

    $('#ap-learn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Learning';
      try {
        if (v('ap-ai').trim()) await saveAll();
        const r = await api('/autopilot/learn', { method: 'POST', body: { description: v('ap-desc') } });
        Object.assign(learned, r.learned);
        $('#ap-learned').innerHTML = learnedHtml();
        $('#ap-naics').value = r.settings.naics;
        $('#ap-keywords').value = r.settings.keywords;
        $('#ap-role').value = r.settings.role;
        toast('Got it. Check the codes and words, then finish setup.');
      } catch (err) { toast(err.message, 'error'); }
      btn.disabled = false;
      btn.innerHTML = icon('spark', 'h-4 w-4') + 'Learn my business';
    });
    $$('[data-test]', view).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await saveAll();
        const r = await api('/autopilot/test', { method: 'POST', body: { what: b.dataset.test } });
        toast(r.message);
      } catch (err) { toast(err.message, 'error'); }
      b.disabled = false;
    }));
    ['ap-sam', 'ap-ai', 'ap-pass'].forEach((id) => $('#' + id).addEventListener('input', () => {
      const t = { 'ap-sam': 'sam', 'ap-ai': 'ai', 'ap-pass': 'email' }[id];
      const b = $(`[data-test="${t}"]`);
      if (b && $('#' + id).value.trim()) b.disabled = false;
    }));
    $('#ap-save').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      $('#ap-error').classList.add('hidden');
      try {
        const saved = await saveAll();
        const missing = [!saved.naics && 'NAICS codes', !saved.samKey.set && 'your SAM.gov API key', !saved.aiKey.set && 'your Anthropic API key'].filter(Boolean);
        if (missing.length) { showMsg('ap-error', `Saved. Add ${missing.join(' and ')} to switch the Autopilot on.`); btn.disabled = false; return; }
        toast('Autopilot is set. Press Run whenever you want bids built.');
        navigate('/autopilot');
      } catch (err) {
        showMsg('ap-error', err.message);
        btn.disabled = false;
      }
    });
  }
