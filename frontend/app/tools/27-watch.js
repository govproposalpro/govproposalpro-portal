  // ------------------------------------------------------------------ Easy Wins Feed (every member)

  const EASE_TONE = (n) => (n >= 75 ? 'bg-emerald-500/15 text-emerald-300' : n >= 55 ? 'bg-brand-blue/20 text-brand-blueSoft' : 'bg-white/[0.06] text-mist-300');

  async function addNoticeToCrm(o, note) {
    await api('/bids', { method: 'POST', body: {
      title: o.title.slice(0, 200), agency: (o.agency || '').slice(0, 200), solicitationNumber: (o.solicitationNumber || '').slice(0, 100),
      naics: o.naics, setAside: (o.setAside || '').slice(0, 60), placeOfPerformance: [o.city, o.state].filter(Boolean).join(', '),
      dueAt: toIsoDate(o.responseDeadline) || null, stage: 'qualifying',
      notes: `${note}\n${o.url}${o.contact ? `\nContact: ${o.contact}` : ''}`,
    } });
  }

  async function viewEasyWins(view) {
    const head = pageHead('Easy Wins Feed', 'Small, fast work you can actually win first: quick RFQs, set-asides you qualify for and work in your state. Plus the offices that buy what you sell.',
      '<a href="/app/import" data-link class="btn-ghost">Get the SAM.gov button</a>');
    view.innerHTML = `${head}<div class="card flex items-center justify-center gap-3 p-10 text-mist-400"><span class="spinner"></span>Ranking open notices by how easy they are to win</div>`;
    const feed = await api('/easy-wins').catch((err) => ({ error: err.message }));
    let list;
    if (feed.error) list = emptyState('SAM.gov did not answer', esc(feed.error));
    else if (feed.needsNaics) list = emptyState('Add your NAICS codes', 'The feed searches with the 6-digit NAICS codes in your profile.', '<a href="/app/profile" data-link class="btn-primary">Open profile</a>');
    else if (feed.configured === false) list = emptyState('Add your SAM.gov API key', 'The feed searches SAM.gov with your own free key. It takes two minutes.', '<a href="/app/sam-key" data-link class="btn-primary">Add my key</a>');
    else if (!feed.notices.length) list = emptyState('Nothing easy open right now', `No open RFQs or set-asides you qualify for in NAICS ${feed.codes.map(esc).join(', ')} this month. Check the buyers list below and introduce yourself.`);
    else list = `<div class="grid gap-3">${feed.notices.map((o, i) => `
      <article class="card p-5"><div class="flex flex-wrap items-start gap-4">
        <span class="pill ${EASE_TONE(o.ease)} !px-3 !py-1.5 !text-sm" title="Ease score">${o.ease}</span>
        <div class="min-w-0 flex-1">
          <p class="font-semibold leading-snug text-white">${esc(o.title)}</p>
          <p class="mt-1 text-sm text-mist-400">${esc([o.agency, o.office].filter(Boolean).join(' · '))}</p>
          <ul class="mt-2 flex flex-wrap gap-1.5">${o.why.map((w) => `<li class="pill bg-white/[0.06] text-mist-300">${esc(w)}</li>`).join('')}</ul>
        </div>
        <div class="flex shrink-0 flex-col gap-2">
          <button type="button" class="btn-primary" data-add="${i}">${icon('plus', 'h-4 w-4')}Add to Bid CRM</button>
          <a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer" class="btn-ghost">Open on SAM.gov</a>
        </div></div></article>`).join('')}</div>`;
    const dibbs = feed.supplies ? `<div class="mb-6 rounded-3xl border border-brand-blue/25 bg-brand-blue/10 p-5 text-sm text-mist-100">You sell supplies. Most small supply buys for the military are posted on
      <a class="font-semibold text-brand-blueSoft hover:text-white" href="https://www.dibbs.bsm.dla.mil/" target="_blank" rel="noopener noreferrer">DLA DIBBS</a>, not SAM.gov. Register there (free, with your CAGE code) and quote daily.</div>` : '';
    view.innerHTML = `${head}${dibbs}<h2 class="mb-3 font-semibold text-white">Easiest open bids for you</h2>${list}
      <section class="card mt-8 p-6">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div><h2 class="font-semibold text-white">Buyers to call</h2><p class="mt-1 text-sm text-mist-400">Contracting offices that bought your NAICS under $${Math.round((feed.sat || 350000) / 1000)}K in the last 12 months. Small buys skip formal competition, so an intro email with your capability statement goes a long way.</p></div>
          <label class="text-sm text-mist-400">State <select id="ew-state" class="field !inline-block !w-auto"><option value="">Nationwide</option>${RADAR_STATES.map((s) => `<option ${feed.state === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        </div>
        <div id="ew-buyers" class="mt-4"></div>
      </section>`;
    $$('[data-add]', view).forEach((b) => b.addEventListener('click', async () => {
      const o = feed.notices[Number(b.dataset.add)];
      b.disabled = true;
      try {
        await addNoticeToCrm(o, `Found by the Easy Wins Feed (ease score ${o.ease}).`);
        b.innerHTML = 'Added';
        toast('Added to your Bid CRM. Amendment Watch will keep an eye on it.');
      } catch (err) { b.disabled = false; toast(err.message, 'error'); }
    }));
    const loadBuyers = async () => {
      const box = $('#ew-buyers');
      box.innerHTML = '<p class="flex items-center gap-2 text-sm text-mist-400"><span class="spinner"></span>Reading USAspending.gov</p>';
      try {
        const st = $('#ew-state').value;
        const d = await api('/easy-wins/buyers?state=' + encodeURIComponent(st));
        if (d.needsNaics) { box.innerHTML = '<p class="text-sm text-mist-500">Add your NAICS codes to your profile first.</p>'; return; }
        if (!d.offices.length) { box.innerHTML = `<p class="text-sm text-mist-500">No small awards found${st ? ` in ${esc(st)}` : ''} in the last year. Try nationwide.</p>`; return; }
        box.innerHTML = `<div class="overflow-x-auto"><table class="tbl min-w-[640px]"><thead><tr><th>Office</th><th>Small awards</th><th>Typical</th><th>Last award</th><th>Recent winners</th></tr></thead><tbody>
          ${d.offices.map((o) => `<tr><td><p class="font-medium text-white">${esc(o.office)}</p><p class="text-xs text-mist-500">${esc(titleCase(o.agency))}${o.city ? ` · ${esc(titleCase(o.city))}` : ''}</p></td>
            <td class="text-white">${o.awards} <span class="text-xs text-mist-500">(${shortMoney(o.total)})</span></td><td class="text-mist-200">${shortMoney(o.median)}</td>
            <td class="text-xs text-mist-400">${fmtDate(o.last)}</td><td class="text-xs text-mist-400">${o.recentWinners.map((w) => esc(titleCase(w))).join(', ')}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="mt-3 text-xs text-mist-500">Find each office's small business specialist on its agency's OSDBU page, or search the office name on SAM.gov. Source: USAspending.gov.</p>`;
      } catch (err) { box.innerHTML = `<p class="text-sm text-brand-redSoft">${esc(err.message)}</p>`; }
    };
    $('#ew-state').addEventListener('change', loadBuyers);
    loadBuyers();
  }

  // ------------------------------------------------------------------ Amendment Watch (every member)

  async function viewAmendments(view) {
    const data = await api('/amendments');
    const unseen = data.changes.filter((c) => !c.seen).length;
    const head = pageHead('Amendment Watch', 'Every bid in your CRM with a solicitation number is checked on SAM.gov daily. When an amendment posts, you get an email and a plain-English list of what changed.');
    const watched = data.bids.filter((b) => b.watching);
    const missing = data.bids.filter((b) => !b.watching);
    const change = (c) => `
      <li class="card p-5 ${c.seen ? '' : 'ring-1 ring-amber-300/40'}">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0"><p class="font-semibold text-white">${esc(c.bidTitle)}</p>
            <p class="text-xs text-mist-500">${esc(c.type || 'Notice')} · posted ${fmtDate(toIsoDate(c.postedDate))}${c.seen ? '' : ' · <span class="text-amber-200">New</span>'}</p></div>
          <a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" class="btn-ghost !px-3 !py-1.5 !text-xs">Read it on SAM.gov</a>
        </div>
        <ul class="mt-3 space-y-1.5 text-sm text-mist-100">${c.changes.map((x) => `<li class="flex gap-2"><span class="mt-1 text-amber-200">${icon(x.kind === 'acknowledge' ? 'check' : 'flag', 'h-3.5 w-3.5')}</span><span>${esc(x.text)}</span></li>`).join('')}</ul>
      </li>`;
    view.innerHTML = `${head}
      ${data.configured ? '' : '<div class="mb-6 rounded-3xl border border-amber-300/25 bg-amber-400/10 p-5 text-sm text-amber-100">Add your free SAM.gov API key to turn on the daily checks. Amendment Watch runs on your own key. <a href="/app/sam-key" data-link class="font-semibold underline">Add my key</a></div>'}
      <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr),360px]">
        <section>
          <div class="mb-3 flex items-center justify-between gap-3"><h2 class="font-semibold text-white">What changed</h2>${unseen ? '<button id="am-seen" class="btn-ghost !px-3 !py-1.5 !text-xs">Mark all read</button>' : ''}</div>
          ${data.changes.length ? `<ul class="grid gap-3">${data.changes.map(change).join('')}</ul>`
            : '<div class="card p-6 text-sm text-mist-400">No amendments yet. The first check of each bid takes a baseline; anything posted after that shows up here and in your inbox.</div>'}
        </section>
        <div class="space-y-6">
          ${sectionCard(`Watching ${watched.length} bid${watched.length === 1 ? '' : 's'}`, watched.length ? `<ul class="divide-y divide-white/[0.06]">${watched.map((b) => `
            <li class="flex items-start justify-between gap-3 py-2.5"><div class="min-w-0"><p class="truncate text-sm text-white">${esc(b.title)}</p>
              <p class="text-xs text-mist-500">${esc(b.solicitationNumber)} · ${b.checkedAt ? `checked ${fmtDate(b.checkedAt)}${b.notices != null ? `, ${b.notices} notice${b.notices === 1 ? '' : 's'}` : ''}` : 'not checked yet'}${b.error && b.error !== 'no_key' ? ` · <span class="text-brand-redSoft">${esc(b.error)}</span>` : ''}</p></div>
              <button type="button" class="btn-ghost shrink-0 !px-3 !py-1 !text-xs" data-check="${b.id}">Check now</button></li>`).join('')}</ul>`
            : '<p class="text-sm text-mist-500">No open bids with a solicitation number yet.</p>')}
          ${missing.length ? sectionCard('Add a solicitation number', `<p class="mb-2 text-sm text-mist-400">These open bids cannot be watched until they have one:</p><ul class="space-y-1 text-sm">${missing.slice(0, 12).map((b) => `<li class="truncate text-mist-200">${esc(b.title)}</li>`).join('')}</ul>
            <a href="/app/crm" data-link class="mt-3 inline-block text-sm font-semibold text-brand-blueSoft hover:text-white">Open Bid CRM</a>`) : ''}
        </div>
      </div>`;
    const seen = $('#am-seen');
    if (seen) seen.addEventListener('click', async () => { try { await api('/amendments/seen', { method: 'POST', body: {} }); render(); } catch (err) { toast(err.message, 'error'); } });
    $$('[data-check]', view).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      b.innerHTML = '<span class="spinner !h-3 !w-3"></span>';
      try {
        const r = await api(`/amendments/${b.dataset.check}/check`, { method: 'POST', body: {} });
        toast(r.added.length ? `${r.added.length} new notice${r.added.length === 1 ? '' : 's'} found.` : 'Checked. Nothing new since the last look.');
        render();
      } catch (err) { b.disabled = false; b.innerHTML = 'Check now'; toast(err.message, 'error'); }
    }));
  }

  // ------------------------------------------------------------------ Teaming Partner Finder (Enterprise)

  const PARTNER_TYPE_LABELS = [['any', 'Any small business'], ['8a', '8(a)'], ['hubzone', 'HUBZone'], ['sdvosb', 'Service-disabled veteran-owned'], ['vosb', 'Veteran-owned'], ['wosb', 'Women-owned small business'], ['women', 'Women-owned']];

  async function viewPartners(view) {
    const u = state.me.user;
    const params = new URLSearchParams(location.search);
    const firstNaics = (String(u.naics || '').match(/\b\d{6}\b/) || [''])[0];
    view.innerHTML = `${pageHead('Teaming Partner Finder', 'Find SAM.gov-registered companies by NAICS, state and socio-economic status to team with or subcontract to. Under FAR 52.219-14, work you give a "similarly situated" sub (same set-aside status) counts toward your share.')}
      <form id="pt-form" class="card mb-6 grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-[1fr,1fr,1.4fr,auto]" novalidate>
        <div><label class="label" for="pt-naics">NAICS</label><input id="pt-naics" class="field" inputmode="numeric" maxlength="6" value="${esc(params.get('naics') || firstNaics)}" /></div>
        <div><label class="label" for="pt-state">State</label><select id="pt-state" class="field"><option value="">Nationwide</option>${RADAR_STATES.map((s) => `<option>${s}</option>`).join('')}</select></div>
        <div><label class="label" for="pt-type">Status</label><select id="pt-type" class="field">${PARTNER_TYPE_LABELS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <div class="flex items-end"><button class="btn-primary w-full">${icon('search', 'h-4 w-4')}Find partners</button></div>
      </form>
      <div id="pt-out"></div>`;
    let page = 0;
    let last = null;
    const run = async () => {
      const out = $('#pt-out');
      out.innerHTML = '<div class="card flex items-center justify-center gap-3 p-10 text-mist-400"><span class="spinner"></span>Searching SAM.gov registrations</div>';
      const q = new URLSearchParams({ naics: $('#pt-naics').value.trim(), state: $('#pt-state').value, type: $('#pt-type').value, page: String(page) });
      try {
        const d = await api('/partners?' + q);
        last = d;
        if (d.configured === false) { out.innerHTML = emptyState('Add your SAM.gov API key', 'Partner search uses your own free SAM.gov key.', '<a href="/app/sam-key" data-link class="btn-primary">Add my key</a>'); return; }
        if (!d.partners.length) { out.innerHTML = emptyState('No matches', 'Try nationwide, a different status, or a related NAICS code.'); return; }
        out.innerHTML = `<p class="mb-3 text-sm text-mist-400">${d.total.toLocaleString('en-US')} active registration${d.total === 1 ? '' : 's'} found. Showing ${d.page * 10 + 1}-${d.page * 10 + d.partners.length}.</p>
          <div class="grid gap-3 lg:grid-cols-2">${d.partners.map((p, i) => `
            <article class="card p-5">
              <p class="font-semibold text-white">${esc(p.company)}</p>
              <p class="text-xs text-mist-500">${esc([p.location, p.uei && 'UEI ' + p.uei, p.cage && 'CAGE ' + p.cage].filter(Boolean).join(' · '))}</p>
              ${p.contactName || p.email || p.phone ? `<p class="mt-2 text-sm text-mist-200">${esc([p.contactName, p.contactTitle].filter(Boolean).join(', '))}</p>
                <p class="text-sm">${p.email ? `<a class="text-brand-blueSoft hover:text-white" href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : ''}${p.phone ? ` <span class="text-mist-400">${esc(p.phone)}</span>` : ''}</p>` : ''}
              <div id="pt-aw-${i}" class="mt-3 text-xs text-mist-400"></div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button type="button" class="btn-ghost !px-3 !py-1.5 !text-xs" data-awards="${i}">Past federal awards</button>
                <button type="button" class="btn-ghost !px-3 !py-1.5 !text-xs" data-save="${i}" ${p.saved ? 'disabled' : ''}>${p.saved ? 'Saved' : 'Save to my subs'}</button>
                ${hasTool('teaming_legal') ? '<a href="/app/teaming" data-link class="btn-ghost !px-3 !py-1.5 !text-xs">Draft NDA or teaming agreement</a>' : ''}
                ${p.website ? `<a href="${esc(/^https?:\/\//.test(p.website) ? p.website : 'https://' + p.website)}" target="_blank" rel="noopener noreferrer" class="btn-ghost !px-3 !py-1.5 !text-xs">Website</a>` : ''}
              </div>
            </article>`).join('')}</div>
          <div class="mt-4 flex justify-between">${d.page > 0 ? '<button id="pt-prev" class="btn-ghost">Previous</button>' : '<span></span>'}${(d.page + 1) * 10 < d.total ? '<button id="pt-next" class="btn-ghost">Next 10</button>' : ''}</div>`;
        const prev = $('#pt-prev');
        if (prev) prev.addEventListener('click', () => { page -= 1; run(); });
        const nxt = $('#pt-next');
        if (nxt) nxt.addEventListener('click', () => { page += 1; run(); });
        $$('[data-awards]', out).forEach((b) => b.addEventListener('click', async () => {
          const p = last.partners[Number(b.dataset.awards)];
          const box = $('#pt-aw-' + b.dataset.awards);
          b.disabled = true;
          box.innerHTML = '<span class="spinner !h-3 !w-3"></span>';
          try {
            const a = await api('/partners/awards?uei=' + encodeURIComponent(p.uei));
            box.innerHTML = a.count ? `<p class="text-mist-200">${a.count} federal contract${a.count === 1 ? '' : 's'} in 5 years. Largest:</p><ul class="mt-1 space-y-0.5">${a.top.map((t) => `<li>${t.url ? `<a class="text-brand-blueSoft hover:text-white" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">${esc(t.id)}</a>` : esc(t.id)} · ${shortMoney(t.value)} · ${esc(titleCase(t.agency))}</li>`).join('')}</ul>`
              : '<p>No federal prime contracts in the last 5 years. They may still be a strong local sub.</p>';
          } catch (err) { box.textContent = err.message; b.disabled = false; }
        }));
        $$('[data-save]', out).forEach((b) => b.addEventListener('click', async () => {
          const p = last.partners[Number(b.dataset.save)];
          b.disabled = true;
          try {
            await api('/subs', { method: 'POST', body: {
              company: p.company.slice(0, 200), contactName: (p.contactName || '').slice(0, 120) || null, email: p.email || null, phone: p.phone || null,
              location: p.location || null, website: (p.website || '').slice(0, 200) || null, uei: p.uei || null, cage: p.cage || null, source: 'sam',
              notes: `Found with the Teaming Partner Finder (NAICS ${last.naics}${last.type !== 'any' ? `, ${PARTNER_TYPE_LABELS.find(([k]) => k === last.type)[1]}` : ''}).`,
            } });
            b.textContent = 'Saved';
            toast('Saved to your subcontractors. The Compliance Watchdog will re-check them weekly.');
          } catch (err) { b.disabled = false; toast(err.message, 'error'); }
        }));
      } catch (err) { out.innerHTML = emptyState('Search did not finish', esc(err.message)); }
    };
    $('#pt-form').addEventListener('submit', (e) => { e.preventDefault(); page = 0; run(); });
    if (firstNaics || params.get('naics')) run();
  }

  // ------------------------------------------------------------------ Compliance Watchdog (Enterprise)

  const DOG = {
    green: ['All good', 'bg-emerald-500/15 text-emerald-300', 'bg-emerald-400'],
    yellow: ['Needs attention', 'bg-amber-400/15 text-amber-200', 'bg-amber-300'],
    red: ['Act now', 'bg-brand-red/20 text-brand-redSoft', 'bg-brand-red'],
  };
  const dot = (level) => `<span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOG[level][2]}"></span>`;

  async function viewWatchdog(view) {
    let d = await api('/watchdog');
    const draw = () => {
      const keyText = { none: 'No key saved', ok: 'Working', expiring: `Expires in ${d.samKey.daysLeft} days`, expired: 'Expired', rejected: 'SAM.gov refused it', broken: 'Needs to be re-entered' }[d.samKey.state] || d.samKey.state;
      view.innerHTML = `${pageHead('Compliance Watchdog', 'Your SAM.gov registration, your API key and every saved subcontractor, re-checked weekly. You get an email the moment something turns red.')}
        ${d.configured ? '' : '<div class="mb-6 rounded-3xl border border-amber-300/25 bg-amber-400/10 p-5 text-sm text-amber-100">Add your free SAM.gov API key to turn on the weekly checks. The Watchdog runs on your own key. <a href="/app/sam-key" data-link class="font-semibold underline">Add my key</a></div>'}
        <section class="card mb-6 flex flex-wrap items-center gap-4 p-6">
          <span class="pill ${DOG[d.overall][1]} !px-3 !py-1.5 !text-sm">${DOG[d.overall][0]}</span>
          <p class="text-sm text-mist-200">${d.subs.filter((s) => s.level === 'red').length} red, ${d.subs.filter((s) => s.level === 'yellow').length} yellow across ${d.subs.length} subcontractor${d.subs.length === 1 ? '' : 's'}.</p>
        </section>
        <div class="mb-6 grid gap-4 md:grid-cols-2">
          <section class="card p-6"><div class="flex items-center gap-2">${dot(d.own.level)}<h2 class="font-semibold text-white">Your SAM.gov registration</h2></div>
            <p class="mt-2 text-sm text-mist-300">${d.own.uei ? `UEI ${esc(d.own.uei)}${d.own.expires ? ` · expires ${fmtDate(d.own.expires)}` : ''}` : 'No UEI in your profile.'}</p>
            ${d.own.reasons.map((r) => `<p class="mt-1 text-sm text-mist-100">${esc(r)}</p>`).join('')}
            <p class="mt-2 text-xs text-mist-500">${d.own.checked && d.own.checked.checkedAt ? `Checked ${fmtDate(d.own.checked.checkedAt)}` : 'Not checked yet'}</p>
            ${d.own.uei ? '<button id="wd-me" class="btn-ghost mt-3 !px-3 !py-1.5 !text-xs">Check now</button>' : '<a href="/app/profile" data-link class="btn-ghost mt-3 !px-3 !py-1.5 !text-xs">Add my UEI</a>'}</section>
          <section class="card p-6"><div class="flex items-center gap-2">${dot(d.samKey.level)}<h2 class="font-semibold text-white">Your SAM.gov API key</h2></div>
            <p class="mt-2 text-sm text-mist-300">${esc(keyText)}${d.samKey.last4 ? ` · ends in ${esc(d.samKey.last4)}` : ''}</p>
            <a href="/app/sam-key" data-link class="btn-ghost mt-3 !px-3 !py-1.5 !text-xs">Manage key</a></section>
        </div>
        <section class="card p-6">
          <h2 class="font-semibold text-white">Subcontractors</h2>
          <p class="mt-1 text-sm text-mist-400">Re-checked against SAM.gov registrations and the exclusions list every week. Add insurance certificate and licence expiry dates to get reminders 30 and 7 days ahead.</p>
          ${d.subs.length ? `<div class="mt-4 overflow-x-auto"><table class="tbl min-w-[760px]"><thead><tr><th>Subcontractor</th><th>SAM.gov</th><th>Insurance cert expires</th><th>Licence expires</th><th></th></tr></thead><tbody>
            ${d.subs.map((s) => `<tr>
              <td><div class="flex items-start gap-2">${dot(s.level)}<div class="min-w-0"><p class="font-medium text-white">${esc(s.company)}</p><p class="text-xs text-mist-500">${esc(s.uei || 'No UEI')}${s.trade ? ` · ${esc(s.trade)}` : ''}</p>
                ${s.reasons.map((r) => `<p class="text-xs text-mist-300">${esc(r)}</p>`).join('')}</div></div></td>
              <td class="text-xs text-mist-400">${s.watch ? `${esc(s.watch.verdict.replace('_', ' '))}<br/>${fmtDate(s.watch.checkedAt)}` : '–'}</td>
              <td><input type="date" class="field !py-1.5 !text-sm" data-coi="${s.id}" value="${esc(s.coiExpires || '')}" aria-label="Insurance certificate expiry for ${esc(s.company)}" /></td>
              <td><input type="date" class="field !py-1.5 !text-sm" data-lic="${s.id}" value="${esc(s.licenseExpires || '')}" aria-label="Licence expiry for ${esc(s.company)}" /></td>
              <td>${s.uei ? `<button type="button" class="btn-ghost !px-3 !py-1 !text-xs" data-recheck="${s.id}">Check now</button>` : ''}</td></tr>`).join('')}
          </tbody></table></div>` : `<p class="mt-3 text-sm text-mist-500">No saved subcontractors yet. Save them from the ${hasTool('teaming_finder') ? '<a href="/app/partners" data-link class="text-brand-blueSoft hover:text-white">Teaming Partner Finder</a> or the ' : ''}<a href="/app/vendors" data-link class="text-brand-blueSoft hover:text-white">Smart Vendor Scraper</a>.</p>`}
        </section>`;
      const me = $('#wd-me');
      if (me) me.addEventListener('click', async () => {
        me.disabled = true;
        me.innerHTML = '<span class="spinner !h-3 !w-3"></span>Checking';
        try { d = await api('/watchdog/me/check', { method: 'POST', body: {} }); draw(); } catch (err) { me.disabled = false; me.textContent = 'Check now'; toast(err.message, 'error'); }
      });
      const save = (input, field) => input.addEventListener('change', async () => {
        try {
          await api('/watchdog/subs/' + (input.dataset.coi || input.dataset.lic), { method: 'PATCH', body: { [field]: input.value || null } });
          d = await api('/watchdog');
          draw();
          toast('Saved.');
        } catch (err) { toast(err.message, 'error'); }
      });
      $$('[data-coi]', view).forEach((i) => save(i, 'coiExpires'));
      $$('[data-lic]', view).forEach((i) => save(i, 'licenseExpires'));
      $$('[data-recheck]', view).forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        b.innerHTML = '<span class="spinner !h-3 !w-3"></span>';
        try { await api(`/watchdog/subs/${b.dataset.recheck}/check`, { method: 'POST', body: {} }); d = await api('/watchdog'); draw(); } catch (err) { b.disabled = false; b.textContent = 'Check now'; toast(err.message, 'error'); }
      }));
    };
    draw();
  }
