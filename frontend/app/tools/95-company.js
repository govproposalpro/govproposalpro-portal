  // ------------------------------------------------------------------ Winning Voice, CMMC Level 1, Compliance Pulse, Per-State Directory

  async function viewWinningVoice(view) {
    view.innerHTML = `
      ${pageHead('Past Performance RAG: your winning voice', 'Upload proposals you have won. Every new proposal borrows their tone, structure and proof points, so it sounds like you at your best.')}
      <div class="grid gap-6 lg:grid-cols-[1fr,320px]">
        <section class="card p-6"><h2 class="mb-4 font-semibold text-white">Winning proposals</h2><div id="wv-docs"></div></section>
        <aside class="space-y-4">
          ${sectionCard('How it works', `<ol class="list-decimal space-y-2 pl-5 text-sm text-mist-300">
            <li>Upload the proposals that won (Word works best; PDF is fine).</li>
            <li>We keep the text private to your account.</li>
            <li>When you write a new proposal, the engine picks the three closest matches and writes in their voice.</li></ol>`)}
          ${sectionCard('Never copied', '<p class="text-sm text-mist-300">Facts, prices and names always come from the new solicitation and your profile. Only the style carries over.</p>')}
        </aside>
      </div>`;
    await documentsPanel($('#wv-docs'), () => toast('Ready. Your next proposal will use it.'), 'winning_proposal');
  }

  const CMMC_INFO = [
    ['AC.L1-3.1.1', 'Authorized access control', 'Limit system access to authorized users, processes acting for them, and devices.', 'Keep a list of who and which devices may use company systems. Everyone gets their own login; remove access the day someone leaves.'],
    ['AC.L1-3.1.2', 'Transaction and function control', 'Limit users to the transactions and functions they are permitted to run.', 'Staff use standard accounts. Only owners or IT have admin rights.'],
    ['AC.L1-3.1.20', 'External connections', 'Verify and control connections to and use of external systems.', 'Write down which outside systems (personal laptops, cloud apps) may touch contract information, and block the rest.'],
    ['AC.L1-3.1.22', 'Control public information', 'Control information posted or processed on publicly accessible systems.', 'Name who may post to your website and social media, and review posts so no contract information goes public.'],
    ['IA.L1-3.5.1', 'Identification', 'Identify system users, processes acting for users, and devices.', 'No shared accounts. Keep an inventory of computers and phones that access company email and files.'],
    ['IA.L1-3.5.2', 'Authentication', 'Authenticate users, processes or devices before allowing access.', 'Strong unique passwords, changed from defaults. Turn on multi-factor sign-in for email and cloud storage.'],
    ['MP.L1-3.8.3', 'Media disposal', 'Sanitize or destroy media containing Federal Contract Information before disposal or reuse.', 'Shred paper. Wipe or physically destroy old drives, USB sticks and phones, and keep a log.'],
    ['PE.L1-3.10.1', 'Limit physical access', 'Limit physical access to systems, equipment and operating environments to authorized people.', 'Lock the office or the room where work computers and files are kept.'],
    ['PE.L1-3.10.3', 'Escort visitors', 'Escort visitors and monitor visitor activity.', 'Visitors sign in and are accompanied while near work computers or paperwork.'],
    ['PE.L1-3.10.4', 'Physical access logs', 'Maintain audit logs of physical access.', 'Keep the visitor sign-in sheet or a door-access log.'],
    ['PE.L1-3.10.5', 'Manage physical access devices', 'Control and manage physical access devices.', 'Track who holds keys, fobs and codes. Collect them or change codes when people leave.'],
    ['SC.L1-3.13.1', 'Boundary protection', 'Monitor, control and protect communications at external and key internal boundaries.', 'Use a firewall on your router and on every computer. Change the router\'s default password.'],
    ['SC.L1-3.13.5', 'Public-access system separation', 'Separate publicly accessible system components from internal networks.', 'Put guest Wi-Fi on its own network. Host your website with a provider, not on the office network.'],
    ['SI.L1-3.14.1', 'Flaw remediation', 'Identify, report and correct system flaws in a timely manner.', 'Turn on automatic updates for operating systems, browsers and apps.'],
    ['SI.L1-3.14.2', 'Malicious code protection', 'Provide protection from malicious code at appropriate locations.', 'Run antivirus (Microsoft Defender counts) on every computer.'],
    ['SI.L1-3.14.4', 'Update malicious code protection', 'Update malicious code protection when new releases are available.', 'Let antivirus update itself automatically and check it monthly.'],
    ['SI.L1-3.14.5', 'System and file scanning', 'Perform periodic scans and real-time scans of files from external sources.', 'Schedule a weekly full scan and keep real-time scanning on for downloads and USB drives.'],
  ];
  const CMMC_STATUS = { met: 'Met', partial: 'In progress', not_met: 'Not met' };

  async function viewCmmc(view) {
    const { checklist } = await api('/me/cmmc');
    view.innerHTML = '<div></div>';
    const root = view.firstElementChild;
    let filter = 'all';
    const draw = () => {
      const met = CMMC_INFO.filter(([id]) => (checklist[id] || {}).status === 'met').length;
      const partial = CMMC_INFO.filter(([id]) => (checklist[id] || {}).status === 'partial').length;
      const pctMet = Math.round((met / CMMC_INFO.length) * 100);
      const rows = CMMC_INFO.filter(([id]) => filter === 'all' || (filter === 'open' ? (checklist[id] || {}).status !== 'met' : (checklist[id] || {}).status === 'met'));
      root.innerHTML = `
        <div class="no-print">${pageHead('CMMC Level 1 Readiness', 'The 17 practices behind FAR 52.204-21. Meet all 17 and you can post your annual self-assessment in SPRS.',
          '<button id="cm-print" class="btn-ghost">Print record</button><a href="https://www.sprs.csd.disa.mil/" target="_blank" rel="noopener noreferrer" class="btn-primary">Open SPRS</a>')}</div>
        <section class="card mb-6 flex flex-wrap items-center gap-6 p-6">
          ${scoreRing(pctMet)}
          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-mist-500">Progress</p>
            <p class="mt-1 text-xl font-semibold text-white">${met} of 17 practices met${partial ? ` <span class="text-base font-normal text-mist-400">· ${partial} in progress</span>` : ''}</p>
            <div class="meter mt-3"><span id="cm-meter"></span></div>
            <p class="mt-2 text-sm text-mist-400">${met === 17 ? 'Ready. A senior official affirms compliance in SPRS each year.' : 'Level 1 is pass/fail: every practice must be met. There are no POA&Ms at Level 1.'}</p>
          </div>
        </section>
        <div class="no-print mb-4 seg">${[['all', 'All 17'], ['open', 'Still to do'], ['met', 'Met']].map(([k, l]) => `<button type="button" data-f="${k}" class="${filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="print-area grid gap-3">${rows.map(([id, name, req, how]) => {
          const c = checklist[id] || {};
          return `<article class="card p-5" data-p="${id}">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 flex-1"><p class="text-xs font-semibold tracking-wider text-mist-500">${id}</p><p class="mt-0.5 font-semibold text-white">${esc(name)}</p>
                <p class="mt-1 text-sm text-mist-300">${esc(req)}</p><p class="mt-2 text-sm text-mist-400"><span class="text-mist-500">How small businesses meet it:</span> ${esc(how)}</p></div>
              <div class="seg no-print">${Object.entries(CMMC_STATUS).map(([k, l]) => `<button type="button" data-s="${k}" class="${c.status === k ? 'on' : ''}">${l}</button>`).join('')}</div>
              ${c.status ? `<span class="hidden print:inline">${CMMC_STATUS[c.status]}${c.on ? ` (${fmtDate(c.on)})` : ''}</span>` : ''}
            </div>
            <textarea class="field no-print mt-3 !py-2 text-sm" rows="2" maxlength="2000" data-note placeholder="Evidence: what you do and where the proof is (e.g. Defender on all 4 PCs, screenshot in shared drive)">${esc(c.note || '')}</textarea>
            ${c.note ? `<p class="hidden text-sm print:block">Evidence: ${esc(c.note)}</p>` : ''}
          </article>`;
        }).join('')}</div>`;
      $('#cm-meter').style.width = pctMet + '%';
    };
    draw();
    const save = async (id, status, note) => {
      await api('/me/cmmc', { method: 'PATCH', body: { practice: id, status, note } });
      checklist[id] = status ? { status, note, on: today() } : undefined;
      if (!status) delete checklist[id];
    };
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'cm-print') { window.print(); return; }
      if (b.dataset.f) { filter = b.dataset.f; draw(); return; }
      if (b.dataset.s) {
        const card = b.closest('[data-p]');
        const id = card.dataset.p;
        const cur = checklist[id] || {};
        try { await save(id, cur.status === b.dataset.s ? null : b.dataset.s, $('[data-note]', card).value); draw(); } catch (err) { toast(err.message, 'error'); }
      }
    });
    root.addEventListener('focusout', async (e) => {
      if (!e.target.matches('[data-note]')) return;
      const id = e.target.closest('[data-p]').dataset.p;
      const cur = checklist[id] || {};
      if ((cur.note || '') === e.target.value) return;
      try { await save(id, cur.status || 'partial', e.target.value); toast('Evidence saved.'); } catch (err) { toast(err.message, 'error'); }
    });
  }

  async function viewPulse(view) {
    const { pinned, feed } = await api('/pulse');
    const regs = [...new Set(feed.map((f) => f.regulation).filter(Boolean))];
    let filter = 'all';
    view.innerHTML = '<div></div>';
    const root = view.firstElementChild;
    const draw = () => {
      const list = feed.filter((f) => filter === 'all' || f.regulation === filter);
      root.innerHTML = `
        ${pageHead('Live Compliance Pulse', 'The 2026 rules that decide awards, plus every new acquisition rule from the Federal Register, refreshed every few hours.')}
        <div class="mb-8 grid gap-4 md:grid-cols-2">${pinned.map((p) => `
          <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" class="card card-hover block p-6">
            <span class="pill bg-white/[0.08] text-mist-200">${esc(p.tag)}</span>
            <p class="mt-3 text-lg font-semibold leading-snug text-white">${esc(p.title)}</p>
            <p class="mt-2 text-sm leading-relaxed text-mist-400">${esc(p.body)}</p></a>`).join('')}</div>
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 class="text-lg font-semibold text-white">New and proposed rules</h2>
          ${regs.length > 1 ? `<div class="seg">${['all', ...regs].map((r) => `<button type="button" data-f="${esc(r)}" class="${filter === r ? 'on' : ''}">${r === 'all' ? 'All' : esc(r)}</button>`).join('')}</div>` : ''}</div>
        ${list.length ? `<div class="grid gap-3">${list.map((f) => `
          <a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer" class="card card-hover block p-5">
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="pill ${f.type === 'Rule' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-400/15 text-amber-200'}">${f.type === 'Rule' ? 'Final rule' : 'Proposed rule'}</span>
              ${f.regulation ? `<span class="pill bg-white/[0.06] text-mist-300">${esc(f.regulation)}${f.parts.length ? ' Part ' + f.parts.map(esc).join(', ') : ''}</span>` : ''}
              <span class="text-mist-500">Published ${fmtDate(f.published)}${f.effective ? ` · effective ${fmtDate(f.effective)}` : ''}${f.commentsClose ? ` · comments close ${fmtDate(f.commentsClose)}` : ''}</span></div>
            <p class="mt-2 font-semibold leading-snug text-white">${esc(f.title)}</p>
            ${f.abstract ? `<p class="mt-1.5 line-clamp-3 text-sm text-mist-400">${esc(f.abstract)}</p>` : ''}</a>`).join('')}</div>`
          : emptyState('Nothing new right now', 'No acquisition rules were published in the last 120 days for this filter.')}`;
    };
    draw();
    root.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; draw(); } });
  }

  async function viewStates(view) {
    const { states } = await api('/states');
    view.innerHTML = `
      ${pageHead('Per-State Directory', 'Where each state posts its bids. Register as a vendor in your state first, then the states next door.')}
      <input id="st-q" class="field mb-6 max-w-md" placeholder="Search a state" aria-label="Search a state" />
      <div id="st-grid" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"></div>
      <p class="mt-6 text-xs text-mist-500">Cities, counties, school districts and universities post their own bids too. Search "[city] bid opportunities" for local work.</p>`;
    const home = (state.me.user.address || '').toUpperCase();
    const draw = (q) => {
      const s = q.trim().toLowerCase();
      const list = states.filter(([code, name, office]) => !s || name.toLowerCase().includes(s) || code.toLowerCase() === s || office.toLowerCase().includes(s));
      list.sort((a, b) => (new RegExp(`\\b${b[0]}\\b`).test(home) - new RegExp(`\\b${a[0]}\\b`).test(home)));
      $('#st-grid').innerHTML = list.map(([code, name, office, url]) => `
        <a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="card card-hover flex items-center gap-4 p-5">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-sm font-bold text-white">${esc(code)}</span>
          <span class="min-w-0"><span class="block font-semibold text-white">${esc(name)}${new RegExp(`\\b${code}\\b`).test(home) ? ' <span class="pill ml-1 bg-brand-blue/15 text-brand-blueSoft">Your state</span>' : ''}</span>
            <span class="block truncate text-sm text-mist-400">${esc(office)}</span></span></a>`).join('') || '<p class="text-mist-500">No match.</p>';
    };
    draw('');
    $('#st-q').addEventListener('input', (e) => draw(e.target.value));
  }
