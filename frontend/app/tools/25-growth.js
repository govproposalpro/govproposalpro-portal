  // ------------------------------------------------------------------ First Win Path (every member)

  const toolHref = (s) => (s.path ? '/app' + s.path : s.tool && ROUTE_OF[s.tool] ? '/app' + ROUTE_OF[s.tool] : '');
  const toolLabel = (s) => {
    if (s.path === '/profile') return 'Open profile';
    if (s.path === '/sam-key') return s.done ? 'Update your SAM.gov key' : 'Add your SAM.gov key';
    const f = s.tool && state.me.features.find((x) => x.key === s.tool);
    if (!f) return 'Open';
    return f.unlocked ? `Open ${f.name}` : `${f.name} (Enterprise)`;
  };

  /** The dashboard card: progress and the next step. Hidden once the path is complete. */
  function firstWinCard(fw) {
    if (!fw || fw.done >= fw.total) return '';
    const next = fw.steps.find((s) => s.key === fw.next) || fw.steps[0];
    const n = fw.steps.findIndex((s) => s.key === next.key) + 1;
    return `
      <section class="card relative mb-8 overflow-hidden p-6">
        <div class="pointer-events-none absolute -left-20 -top-20 h-48 w-48 rounded-full opacity-25 blur-3xl accent-glow"></div>
        <div class="flex flex-wrap items-center gap-5">
          <span class="ico-bubble ico-grad !h-12 !w-12">${icon('route', 'h-6 w-6')}</span>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-mist-500">Your First Win Path · ${fw.done} of ${fw.total} done</p>
            <h2 class="mt-1 text-lg font-semibold text-white">Next: ${n}. ${esc(next.title)}</h2>
            <div class="meter mt-3 max-w-md"><span id="fw-home-meter"></span></div>
          </div>
          <a href="/app/first-win" data-link class="btn-primary">${icon('route', 'h-4 w-4')}Continue</a>
        </div>
      </section>`;
  }

  async function viewFirstWin(view) {
    let fw = await api('/first-win');
    const u = state.me.user;
    const draw = () => {
      const pct = Math.round((fw.done / fw.total) * 100);
      const sam = fw.sam;
      const samLine = () => {
        if (!u.uei) return '<p class="mt-3 text-sm text-mist-400">Add your UEI to your <a href="/app/profile" data-link class="font-semibold text-brand-blueSoft hover:text-white">profile</a> and we check SAM.gov for you.</p>';
        const status = sam && sam.uei === u.uei
          ? (sam.found
            ? `<span class="pill ${sam.active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-400/15 text-amber-200'}">${esc(sam.status || 'Unknown')}</span>
               <span class="text-mist-400">${sam.cage ? `CAGE ${esc(sam.cage)} · ` : ''}${sam.expires ? `expires ${fmtDate(sam.expires)} · ` : ''}checked ${fmtDate(sam.checkedAt)}</span>`
            : `<span class="pill bg-amber-400/15 text-amber-200">Not found yet</span><span class="text-mist-400">SAM.gov has no registration for UEI ${esc(u.uei)} yet. Checked ${fmtDate(sam.checkedAt)}.</span>`)
          : `<span class="text-mist-400">UEI ${esc(u.uei)}</span>`;
        return `<div class="mt-3 flex flex-wrap items-center gap-2 text-sm">${status}
          <button type="button" id="fw-sam" class="btn-ghost !px-3 !py-1.5 !text-xs">${icon('check', 'h-3.5 w-3.5')}Check SAM.gov now</button></div>`;
      };
      view.innerHTML = `
        ${pageHead('First Win Path', 'Every step from forming your company to winning your first federal contract, in order.')}
        <section class="card relative mb-6 overflow-hidden p-6">
          <div class="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-30 blur-3xl accent-glow"></div>
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div><p class="text-sm text-mist-400">Your progress</p>
              <p class="mt-1 text-4xl font-bold text-white">${fw.done}<span class="text-lg font-medium text-mist-500"> of ${fw.total} steps</span></p></div>
            <p class="max-w-sm text-sm text-mist-400">${fw.done >= fw.total ? 'Path complete. Congratulations on your first award.' : 'Steps tick themselves as you use the tools. You can also tick any step you finished somewhere else.'}</p>
          </div>
          <div class="meter mt-4"><span id="fw-meter"></span></div>
        </section>
        <ol class="space-y-3">${fw.steps.map((s, i) => {
          const isNext = s.key === fw.next;
          const href = toolHref(s);
          return `
          <li class="card flex gap-4 p-5 ${s.done ? 'opacity-75' : ''} ${isNext ? 'ring-1 ring-brand-blueSoft/40' : ''}">
            <label class="mt-0.5 shrink-0"><input type="checkbox" data-step="${s.key}" class="h-5 w-5 accent-brand-blue" ${s.done ? 'checked' : ''} ${s.doneBy === 'auto' || s.autoOnly ? 'disabled' : ''} aria-label="Mark step ${i + 1} done" /></label>
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-white">${i + 1}. ${esc(s.title)}
                ${isNext ? '<span class="pill ml-1 bg-brand-blue/20 text-brand-blueSoft">Next</span>' : ''}
                ${s.done ? `<span class="pill ml-1 bg-emerald-500/15 text-emerald-300">${s.doneBy === 'auto' ? 'Done' : `Done ${fmtDate(s.doneOn)}`}</span>` : ''}
                ${s.target && s.count !== null ? `<span class="pill ml-1 bg-white/[0.06] text-mist-300">${Math.min(s.count, s.target)} of ${s.target}</span>` : ''}</p>
              <p class="mt-1 text-sm text-mist-400">${esc(s.body)}</p>
              ${s.autoNote ? `<p class="mt-1 text-xs text-mist-500">${esc(s.autoNote)}</p>` : ''}
              ${s.key === 'sam' ? samLine() : ''}
              ${href || s.link ? `<div class="mt-3 flex flex-wrap gap-2">
                ${href ? `<a href="${href}" data-link class="btn-ghost !px-3 !py-1.5 !text-xs">${icon(s.path === '/sam-key' ? 'lockshield' : ICON_OF[s.tool] || 'user', 'h-3.5 w-3.5')}${esc(toolLabel(s))}</a>` : ''}
                ${s.link ? `<a href="${esc(s.link)}" target="_blank" rel="noopener noreferrer" class="btn-ghost !px-3 !py-1.5 !text-xs">${esc(s.linkLabel || 'Open')}</a>` : ''}
              </div>` : ''}
            </div>
          </li>`;
        }).join('')}</ol>`;
      $('#fw-meter').style.width = pct + '%';
      $$('[data-step]', view).forEach((cb) => cb.addEventListener('change', async () => {
        try {
          fw = await api('/me/first-win', { method: 'PATCH', body: { step: cb.dataset.step, done: cb.checked } });
          draw();
        } catch (err) { cb.checked = !cb.checked; toast(err.message, 'error'); }
      }));
      const samBtn = $('#fw-sam');
      if (samBtn) samBtn.addEventListener('click', async () => {
        samBtn.disabled = true;
        samBtn.innerHTML = '<span class="spinner !h-3 !w-3"></span>Checking SAM.gov';
        try {
          fw = await api('/first-win/sam-check', { method: 'POST', body: {} });
          if (fw.sam && fw.sam.active) {
            state.me.user.samStatus = 'active';
            if (fw.sam.cage && !state.me.user.cageCode) state.me.user.cageCode = fw.sam.cage;
            if (fw.sam.expires) state.me.user.samExpiresOn = fw.sam.expires;
          }
          draw();
        } catch (err) {
          toast(err.message, 'error');
          samBtn.disabled = false;
          samBtn.innerHTML = icon('check', 'h-3.5 w-3.5') + 'Check SAM.gov now';
        }
      });
    };
    draw();
  }

  // ------------------------------------------------------------------ Recompete Radar (Enterprise; Core sees a preview)


  const RADAR_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY GU VI'.split(' ');
  const monthsUntil = (d) => Math.max(0, Math.round((new Date(d + 'T12:00:00') - new Date()) / (30.44 * 86400000)));
  const shortMoney = (n) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : fmtMoney(n));
  const titleCase = (s) => String(s || '').toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Llc|Inc|Usa|Dba|Jv|Ii|Iii)\b/g, (w) => w.toUpperCase());

  async function viewRecompete(view) {
    const head = pageHead('Recompete Radar', 'Federal contracts in your NAICS codes ending in the next 3 to 18 months, with the agency, the incumbent and the value. Get in front of the buyer before the solicitation drops.');
    view.innerHTML = `${head}<div class="card flex items-center justify-center gap-3 p-10 text-mist-400"><span class="spinner"></span>Scanning USAspending.gov for contracts ending soon</div>`;
    const params = new URLSearchParams(location.search);
    const q = new URLSearchParams();
    if (params.get('naics')) q.set('naics', params.get('naics'));
    if (params.has('state')) q.set('state', params.get('state'));
    let data;
    try {
      data = await api('/recompete' + (q.toString() ? '?' + q : ''));
    } catch (err) {
      view.innerHTML = head + emptyState('USAspending.gov did not answer', esc(err.message), '<button id="retry" class="btn-primary">Try again</button>');
      $('#retry').addEventListener('click', () => render());
      return;
    }
    if (data.needsNaics) {
      view.innerHTML = head + emptyState('Add your NAICS codes', 'The Recompete Radar searches with the 6-digit NAICS codes in your profile.', '<a href="/app/profile" data-link class="btn-primary">Open profile</a>');
      return;
    }

    let win = 'all';
    let shown = 25;
    const WINDOWS = [['all', 'All (3-18 months)', 0, 99], ['soon', '3-6 months', 0, 6], ['mid', '6-12 months', 6, 12], ['late', '12-18 months', 12, 99]];
    const draw = () => {
      const [, , lo, hi] = WINDOWS.find((w) => w[0] === win);
      const all = data.awards.filter((a) => { const m = monthsUntil(a.end); return win === 'all' || (m >= lo && m < hi); });
      const list = all.slice(0, shown);
      const soonest = data.awards[0];
      view.innerHTML = `
        ${head}
        <form id="rr-form" class="card mb-6 grid gap-3 p-5 sm:grid-cols-[1fr_12rem_auto]" novalidate>
          <label class="min-w-0"><span class="label">NAICS codes (up to 3)</span>
            <input name="naics" class="field" maxlength="40" value="${esc(data.codes.join(', '))}" placeholder="561730, 561720" /></label>
          <label><span class="label">Place of performance</span>
            <select name="state" class="field"><option value="">All states</option>${RADAR_STATES.map((s) => `<option ${s === data.state ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          <div class="flex items-end"><button type="submit" class="btn-primary w-full">${icon('search', 'h-4 w-4')}Scan</button></div>
        </form>
        <div class="mb-6 grid gap-4 sm:grid-cols-3">
          <div class="stat stat-blue"><p class="text-sm text-mist-400">Contracts ending soon</p><p class="mt-2 text-3xl font-bold text-white">${data.total.toLocaleString('en-US')}</p><p class="mt-2 text-xs text-mist-500">${fmtDate(data.from)} to ${fmtDate(data.to)}</p></div>
          <div class="stat stat-green"><p class="text-sm text-mist-400">Total value up for grabs</p><p class="mt-2 text-3xl font-bold text-white">${shortMoney(data.totalValue)}</p><p class="mt-2 text-xs text-mist-500">Contracts over ${shortMoney(data.minValue)}${data.state ? ` in ${esc(data.state)}` : ', nationwide'}</p></div>
          <div class="stat stat-red"><p class="text-sm text-mist-400">Next one ends</p><p class="mt-2 text-3xl font-bold text-white">${soonest ? fmtDate(soonest.end) : '-'}</p><p class="mt-2 truncate text-xs text-mist-500">${soonest ? esc(soonest.subAgency || soonest.agency) : 'Nothing in the window'}</p></div>
        </div>
        ${data.partial && data.partial.length ? `<div class="mb-5 rounded-3xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-100">NAICS ${data.partial.map(esc).join(', ')} ${data.partial.length > 1 ? 'have' : 'has'} so many contracts nationwide that some ending soonest may be missing. Pick a state to see every one.</div>` : ''}
        ${data.failed && data.failed.length ? `<div class="mb-5 rounded-3xl border border-brand-red/30 bg-brand-red/10 p-4 text-sm text-brand-redSoft">USAspending.gov did not answer for NAICS ${data.failed.map(esc).join(', ')}. Try again in a few minutes.</div>` : ''}
        ${data.full ? `<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div class="seg" role="tablist">${WINDOWS.map(([k, l]) => `<button type="button" data-w="${k}" class="${win === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <p class="text-sm text-mist-500">${all.length.toLocaleString('en-US')} in this range · soonest first · data refreshed daily</p></div>` : ''}
        ${list.length ? `<div class="grid gap-3">${list.map((a) => recompeteCard(a)).join('')}</div>`
          : `<div class="card p-8 text-center text-mist-400">${data.total ? 'Nothing in this window. Try another range.' : 'No contracts over ' + shortMoney(data.minValue) + ' end in this window for these codes. Try all states or another NAICS code.'}</div>`}
        ${all.length > list.length ? `<div class="mt-4 text-center"><button type="button" id="rr-more" class="btn-ghost">Show more (${(all.length - list.length).toLocaleString('en-US')} left)</button></div>` : ''}
        ${!data.full && data.hidden > 0 ? `
          <section class="card relative mt-4 overflow-hidden p-8 text-center">
            <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-blue via-[#5B3BFF] to-brand-red"></div>
            <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-red/15 text-brand-redSoft">${icon('lock', 'h-6 w-6')}</div>
            <h2 class="text-xl font-bold text-white">${data.hidden.toLocaleString('en-US')} more contracts ending soon</h2>
            <p class="mx-auto mt-2 max-w-lg text-mist-300">Core shows the first ${data.awards.length}. Enterprise unlocks the full radar for every NAICS code and state, with the incumbent, value and end date of each, so you can line up subs and talk to the buyer months before the bid posts.</p>
            ${upgradeCta()}
          </section>` : ''}
        <p class="mt-6 text-xs text-mist-500">Source: USAspending.gov contract awards (public data). End dates are the current period of performance; an agency can still exercise options or extend. Always confirm on SAM.gov.</p>`;

      $('#rr-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const p = new URLSearchParams({ naics: e.target.naics.value.trim(), state: e.target.state.value });
        navigate('/recompete?' + p);
      });
      $$('[data-w]', view).forEach((b) => b.addEventListener('click', () => { win = b.dataset.w; shown = 25; draw(); }));
      const more = $('#rr-more');
      if (more) more.addEventListener('click', () => { shown += 25; draw(); });
      $$('[data-track]', view).forEach((b) => b.addEventListener('click', async () => {
        const a = data.awards.find((x) => x.id === b.dataset.track);
        if (!a) return;
        b.disabled = true;
        try {
          await api('/bids', { method: 'POST', body: {
            title: `Recompete: ${(a.description || a.subAgency || a.agency).slice(0, 180)}`,
            agency: [a.agency, a.subAgency].filter((x, i, arr) => x && arr.indexOf(x) === i).join(' / ').slice(0, 200),
            solicitationNumber: a.id,
            naics: a.naics,
            placeOfPerformance: a.state || null,
            estValue: a.value || null,
            stage: 'prospecting',
            notes: `Recompete watch from the Recompete Radar.\nIncumbent: ${titleCase(a.incumbent)}${a.incumbentUei ? ` (UEI ${a.incumbentUei})` : ''}\nCurrent contract ${a.id} ends ${a.end}, value ${fmtMoney(a.value)}.\n${a.url ? `USAspending: ${a.url}\n` : ''}Next: contact the contracting office, answer the sources-sought notice when it posts, and line up subs.`,
          } });
          a.tracked = true;
          toast('Added to your Bid CRM under Prospecting.');
          draw();
        } catch (err) { b.disabled = false; toast(err.message, 'error'); }
      }));
    };
    draw();
  }

  function recompeteCard(a) {
    const m = monthsUntil(a.end);
    const canTrack = hasTool('bid_crm');
    return `
      <article class="card p-5">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="pill ${m < 6 ? 'bg-brand-red/20 text-brand-redSoft' : m < 12 ? 'bg-amber-400/15 text-amber-200' : 'bg-brand-blue/20 text-brand-blueSoft'}">${icon('history', 'h-3.5 w-3.5')}Ends ${fmtDate(a.end)} · ${m <= 1 ? 'about 1 month' : `${m} months`}</span>
              ${a.state ? `<span class="pill bg-white/[0.06] text-mist-300">${esc(a.state)}</span>` : ''}
              <span class="pill bg-white/[0.06] text-mist-300">NAICS ${esc(a.naics)}</span>
            </div>
            <h3 class="mt-2 font-semibold text-white">${esc(a.description ? titleCase(a.description) : 'Contract ' + a.id)}</h3>
            <p class="mt-1 text-sm text-mist-400">${esc(a.subAgency && a.subAgency !== a.agency ? `${a.agency} · ${a.subAgency}` : a.agency)}</p>
            <dl class="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div class="flex gap-2"><dt class="text-mist-500">Incumbent</dt><dd class="min-w-0 truncate text-mist-100">${esc(titleCase(a.incumbent) || 'Unknown')}</dd></div>
              <div class="flex gap-2"><dt class="text-mist-500">Contract</dt><dd class="min-w-0 truncate text-mist-100">${esc(a.id)}</dd></div>
              <div class="flex gap-2"><dt class="text-mist-500">Started</dt><dd class="text-mist-100">${fmtDate(a.start) || '-'}</dd></div>
            </dl>
          </div>
          <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 sm:flex-col sm:items-end sm:text-right">
            <p class="text-2xl font-bold text-white">${shortMoney(a.value)}<span class="block text-xs font-normal text-mist-500">obligated so far</span></p>
            <div class="flex flex-wrap justify-end gap-2 sm:mt-1">
              ${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" class="btn-ghost !px-3 !py-1.5 !text-xs">USAspending</a>` : ''}
              ${canTrack ? (a.tracked ? '<span class="pill bg-emerald-500/15 text-emerald-300">In your CRM</span>'
                : `<button type="button" data-track="${esc(a.id)}" class="btn-primary !px-3 !py-1.5 !text-xs">${icon('plus', 'h-3.5 w-3.5')}Track in CRM</button>`) : ''}
            </div>
          </div>
        </div>
      </article>`;
  }
