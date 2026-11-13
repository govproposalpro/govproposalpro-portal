  // ------------------------------------------------------------------ Competition X-Ray (every member)

  const XRAY_TONE = { good: 'bg-emerald-500/15 text-emerald-300', fair: 'bg-amber-400/15 text-amber-200', tough: 'bg-brand-red/20 text-brand-redSoft', unknown: 'bg-white/[0.06] text-mist-300' };

  async function viewXray(view) {
    const params = new URLSearchParams(location.search);
    const bids = await loadBids().catch(() => []);
    const u = state.me.user;
    const firstNaics = (String(u.naics || '').match(/\b\d{6}\b/) || [''])[0];
    const head = pageHead('Competition X-Ray', 'Who won this kind of work before, for how much, and against how many bidders. Know your odds before you spend a proposal on it.');
    const form = (q = {}) => `
      <form id="xr-form" class="card mb-6 grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-[1.2fr,1fr,1fr,1.4fr,auto]" novalidate>
        <div><label class="label" for="xr-bid">From a bid (optional)</label><select id="xr-bid" class="field">${bidOptions(bids, params.get('bid'), 'Type the details')}</select></div>
        <div><label class="label" for="xr-naics">NAICS</label><input id="xr-naics" class="field" inputmode="numeric" maxlength="6" value="${esc(q.naics ?? firstNaics)}" /></div>
        <div><label class="label" for="xr-state">State</label><select id="xr-state" class="field"><option value="">Nationwide</option>${RADAR_STATES.map((s) => `<option ${q.state === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div><label class="label" for="xr-kw">Keywords or agency</label><input id="xr-kw" class="field" maxlength="200" placeholder="grounds maintenance" value="${esc(q.keywords ? q.keywords.join(' ') : '')}" /></div>
        <div class="flex items-end"><button class="btn-primary w-full">${icon('search', 'h-4 w-4')}X-Ray</button></div>
      </form>`;

    const show = (data) => {
      const s = data.stats;
      const v = data.verdict;
      const stat = (label, value, note = '') => `<div class="stat"><p class="text-sm text-mist-400">${label}</p><p class="mt-2 text-2xl font-bold text-white">${value}</p>${note ? `<p class="mt-1 text-xs text-mist-500">${note}</p>` : ''}</div>`;
      $('#xr-out').innerHTML = `
        <section class="card mb-6 flex flex-wrap items-center gap-5 p-6">
          <span class="pill ${XRAY_TONE[v.level]} !px-3 !py-1.5 !text-sm">${esc(v.headline)}</span>
          <p class="min-w-0 flex-1 text-sm text-mist-200">${esc(v.advice)}</p>
        </section>
        ${s.count ? `
        <div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          ${stat('Past awards (5 years)', s.count.toLocaleString('en-US'), `${shortMoney(s.totalValue)} in total`)}
          ${stat('Typical award', shortMoney(s.medianValue), 'median value')}
          ${stat('Offers per award', s.avgOffers === null ? 'n/a' : s.avgOffers, s.sampled ? `from the ${s.sampled} most recent` : 'not reported')}
          ${stat('Won by small businesses', s.smallBusinessShare === null ? 'n/a' : s.smallBusinessShare + '%', s.setAsideShare === null ? '' : `${s.setAsideShare}% were set aside`)}
        </div>
        <div class="grid items-start gap-6 lg:grid-cols-[340px,minmax(0,1fr)]">
          ${sectionCard('Who wins this work', `<ol class="space-y-3">${data.winners.map((w, i) => `
            <li class="flex items-start gap-3"><span class="mt-0.5 text-xs font-semibold text-mist-500">${i + 1}</span>
              <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium text-white">${esc(titleCase(w.name))}</p>
              <p class="text-xs text-mist-500">${w.awards} award${w.awards === 1 ? '' : 's'} · ${shortMoney(w.value)} · last ${fmtDate(w.last)}</p></div></li>`).join('')}</ol>
            <p class="mt-4 text-xs text-mist-500">Top company holds ${s.topWinnerShare}% of the dollars across ${s.distinctWinners} winner${s.distinctWinners === 1 ? '' : 's'}.</p>`)}
          <section class="card overflow-x-auto p-5"><table class="tbl min-w-[720px]"><thead><tr><th>Award</th><th>Winner</th><th>Value</th><th>Offers</th><th>Set-aside</th><th>Period</th></tr></thead><tbody>
            ${data.awards.map((a) => `<tr>
              <td><a class="font-medium text-brand-blueSoft hover:text-white" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.id)}</a><p class="text-xs text-mist-500">${esc(titleCase(a.agency))}${a.state ? ` · ${esc(a.state)}` : ''}</p></td>
              <td class="text-mist-200">${esc(titleCase(a.winner))}</td><td class="text-white">${shortMoney(a.value)}</td>
              <td class="text-mist-300">${a.offers ?? '–'}</td><td class="text-xs text-mist-400">${esc(a.setAside ? titleCase(a.setAside) : '–')}</td>
              <td class="text-xs text-mist-400">${fmtDate(a.start)} – ${fmtDate(a.end)}</td></tr>`).join('')}
          </tbody></table></section>
        </div>
        <p class="mt-4 text-xs text-mist-500">Source: USAspending.gov contract awards since ${new Date().getFullYear() - 5}${data.agencyMatched ? '' : ' (all agencies)'}. Refreshed daily. Offers and set-aside come from each award's own record.</p>` : ''}`;
    };

    const run = async (query) => {
      $('#xr-out').innerHTML = '<div class="card flex items-center justify-center gap-3 p-10 text-mist-400"><span class="spinner"></span>Reading five years of award data from USAspending.gov</div>';
      try {
        const data = await api('/xray?' + new URLSearchParams(query).toString());
        show(data);
      } catch (err) {
        $('#xr-out').innerHTML = emptyState('X-Ray did not finish', esc(err.message));
      }
    };

    view.innerHTML = `${head}${form()}<div id="xr-out">${emptyState('Pick a bid or type what the work is', 'For example NAICS 561730 and "grounds maintenance", or pick an opportunity from your Bid CRM.')}</div>`;
    const f = $('#xr-form');
    const readForm = () => {
      const kw = $('#xr-kw').value.trim();
      return { naics: $('#xr-naics').value.trim(), state: $('#xr-state').value, keywords: kw };
    };
    $('#xr-bid').addEventListener('change', (e) => {
      const b = bids.find((x) => String(x.id) === e.target.value);
      if (!b) return;
      $('#xr-naics').value = (String(b.naics || '').match(/\d{6}/) || [''])[0];
      $('#xr-kw').value = b.title;
      const st = (String(b.placeOfPerformance || '').toUpperCase().match(/\b([A-Z]{2})\b(?:\s+\d{5})?\s*$/) || [])[1];
      $('#xr-state').value = RADAR_STATES.includes(st) ? st : '';
      run({ bid: b.id, ...readForm() });
    });
    f.addEventListener('submit', (e) => { e.preventDefault(); run(readForm()); });
    if (params.get('bid')) {
      const b = bids.find((x) => String(x.id) === params.get('bid'));
      if (b) $('#xr-bid').dispatchEvent(new Event('change'));
    }
  }

  // ------------------------------------------------------------------ Sources-Sought Responder (every member)

  async function viewSourcesSought(view) {
    const head = pageHead('Sources-Sought Responder', 'Answer sources sought and RFI notices in your NAICS codes. A strong reply is how a small business gets the contracting officer to set the work aside for companies like yours.',
      '<button id="ss-paste" class="btn-ghost">Paste a notice</button>');
    view.innerHTML = `${head}<div class="card flex items-center justify-center gap-3 p-10 text-mist-400"><span class="spinner"></span>Looking for open sources sought notices on SAM.gov</div>`;
    const [{ jobs }, feed] = await Promise.all([api('/jobs/sources_sought'), api('/sources-sought/notices').catch((err) => ({ error: err.message }))]);
    const drafts = jobs.length ? sectionCard('Your responses', `<ul class="grid gap-2">${jobs.map((j) => `<li><a href="/app/sources-sought/${j.id}" data-link class="row-link flex items-center justify-between gap-3">
        <span class="truncate font-medium text-white">${esc(j.title.replace(/^Response: /, ''))}</span><span class="flex shrink-0 items-center gap-3 text-xs text-mist-500">${fmtDate(j.createdAt)} ${statusPill(j.status)}</span></a></li>`).join('')}</ul>`, 'mb-6') : '';
    let list;
    if (feed.error) list = emptyState('SAM.gov did not answer', esc(feed.error));
    else if (feed.needsNaics) list = emptyState('Add your NAICS codes', 'We look for notices with the 6-digit NAICS codes in your profile.', '<a href="/app/profile" data-link class="btn-primary">Open profile</a>');
    else if (feed.configured === false) list = emptyState('Add your SAM.gov API key', 'The notice feed searches SAM.gov with your own free key. You can still paste a notice by hand.', '<a href="/app/sam-key" data-link class="btn-primary">Add my key</a>');
    else if (!feed.notices.length) list = emptyState('No open sources sought right now', `Nothing open for NAICS ${feed.codes.map(esc).join(', ')} in the last 30 days. New notices post daily; paste one by hand anytime.`);
    else list = `<div class="grid gap-3">${feed.notices.map((o, i) => `
      <article class="card p-5"><div class="flex flex-wrap items-start gap-4">
        <div class="min-w-0 flex-1">
          <p class="font-semibold leading-snug text-white">${esc(o.title)}</p>
          <p class="mt-1 text-sm text-mist-400">${esc([o.agency, o.office].filter(Boolean).join(' · '))}</p>
          <div class="mt-2.5 flex flex-wrap gap-1.5">
            <span class="pill bg-white/[0.06] text-mist-300">${esc(o.type || 'Notice')}</span>
            ${o.setAside ? `<span class="pill bg-brand-blue/15 text-brand-blueSoft">${esc(o.setAside)}</span>` : ''}
            ${o.state ? `<span class="pill bg-white/[0.06] text-mist-300">${esc([o.city, o.state].filter(Boolean).join(', '))}</span>` : ''}
            ${o.responseDeadline ? `<span class="pill bg-white/[0.06] text-mist-300">${icon('cal', 'h-3 w-3')}Reply by ${fmtDate(toIsoDate(o.responseDeadline))}</span>` : ''}
          </div>
        </div>
        <div class="flex shrink-0 flex-col gap-2">
          ${o.draftId ? `<a href="/app/sources-sought/${o.draftId}" data-link class="btn-ghost">Open my response</a>` : `<button type="button" class="btn-primary" data-draft="${i}">${icon('spark', 'h-4 w-4')}Draft my response</button>`}
          <a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer" class="btn-ghost">Open on SAM.gov</a>
        </div></div></article>`).join('')}</div>`;
    view.innerHTML = `${head}${drafts}<h2 class="mb-3 font-semibold text-white">Open notices for your NAICS codes</h2>${list}`;
    const start = async (body, btn) => {
      if (btn) btn.disabled = true;
      try {
        const { id } = await api('/jobs/sources_sought', { method: 'POST', body });
        navigate('/sources-sought/' + id);
      } catch (err) { if (btn) btn.disabled = false; toast(err.message, 'error'); }
    };
    $$('[data-draft]', view).forEach((b) => b.addEventListener('click', () => start({ notice: feed.notices[Number(b.dataset.draft)] }, b)));
    pollWhileWorking(jobs);
    $('#ss-paste').addEventListener('click', () => {
      const m = openModal(`<h2 class="text-lg font-semibold text-white">Paste a sources sought or RFI notice</h2>
        <form id="ss-form" class="mt-5 space-y-4" novalidate>
          <div><label class="label" for="ss-title">Notice title</label><input id="ss-title" class="field" maxlength="300" /></div>
          <div><label class="label" for="ss-agency">Agency</label><input id="ss-agency" class="field" maxlength="200" /></div>
          <div><label class="label" for="ss-text">Notice text</label><textarea id="ss-text" rows="9" class="field" maxlength="60000" placeholder="Paste the full notice, including the questions it asks."></textarea></div>
          <div class="flex items-center justify-between gap-2"><p class="text-xs text-mist-500">Takes about a minute.</p><div class="flex gap-2"><button type="button" class="btn-ghost" data-close>Cancel</button><button class="btn-primary">${icon('spark', 'h-4 w-4')}Draft</button></div></div>
        </form>`);
      $('#ss-form', m.el).addEventListener('submit', (e) => {
        e.preventDefault();
        m.close();
        start({ notice: { title: $('#ss-title').value.trim(), agency: $('#ss-agency').value.trim() }, text: $('#ss-text').value.trim() });
      });
    });
  }

  async function viewSourcesSoughtDraft(view, id) {
    const { job } = await api('/jobs/sources_sought/' + id);
    const back = '<a href="/app/sources-sought" data-link class="btn-ghost">All responses</a>';
    if (job.status === 'working') {
      view.innerHTML = pageHead(esc(job.title), '', back) + working('Writing your response', 'This page refreshes on its own.');
      every(4000, () => render());
      return;
    }
    if (job.status === 'failed') {
      view.innerHTML = pageHead(esc(job.title), '', back) + emptyState('That did not finish', esc(job.error || 'Please try again.'));
      return;
    }
    const r = job.result;
    const n = job.input.notice || {};
    const to = (String(n.contact || '').match(/[^\s,<>]+@[^\s,<>]+/) || [''])[0];
    const body = r.edited || r.response_md;
    view.innerHTML = `${pageHead(esc(n.title || job.title), esc([n.agency, n.responseDeadline && `reply by ${fmtDate(toIsoDate(n.responseDeadline))}`].filter(Boolean).join(' · ')),
      `${back}<button id="ss-del" class="btn-ghost">Delete</button><button id="ss-word" class="btn-ghost">${icon('doc', 'h-4 w-4')}Word</button><button id="ss-save" class="btn-ghost">Save edits</button><button id="ss-mail" class="btn-primary">${icon('mail', 'h-4 w-4')}Open in email</button>`)}
      <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr),340px]">
        <section class="card space-y-4 p-6">
          <div><label class="label" for="ss-subject">Subject</label><input id="ss-subject" class="field" maxlength="300" value="${esc(r.subject)}" /></div>
          <div><label class="label" for="ss-email">Cover email</label><textarea id="ss-email" rows="7" class="field leading-relaxed">${esc(r.cover_email)}</textarea></div>
          <div><label class="label" for="ss-body">Capability response (attach as PDF or Word)</label><textarea id="ss-body" rows="24" class="field font-mono text-[13px] leading-relaxed">${esc(body)}</textarea></div>
        </section>
        <aside class="space-y-4">
          ${r.fill_in.length ? sectionCard('Fill these in first', `<ul class="space-y-1.5 text-sm text-amber-200">${r.fill_in.map((x) => `<li>• ${esc(x)}</li>`).join('')}</ul>`) : ''}
          ${sectionCard('Your set-aside case', `<p class="text-sm leading-relaxed text-mist-200">${esc(r.set_aside_case)}</p><button class="btn-ghost mt-3 !py-2" id="ss-copy-case">Copy</button>`)}
          ${r.questions_for_co.length ? sectionCard('Suggestions for the contracting officer', `<ul class="space-y-1.5 text-sm text-mist-200">${r.questions_for_co.map((x) => `<li>• ${esc(x)}</li>`).join('')}</ul>`) : ''}
          ${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer" class="btn-ghost w-full justify-center">Open the notice on SAM.gov</a>` : ''}
          <p class="text-xs text-mist-500">Reply before the deadline, to the contact the notice names. Responses are not offers and do not commit you to bid.</p>
        </aside>
      </div>`;
    $('#ss-copy-case').addEventListener('click', () => copyText(r.set_aside_case));
    $('#ss-mail').addEventListener('click', () => mailto({ to, subject: $('#ss-subject').value, body: $('#ss-email').value }));
    $('#ss-word').addEventListener('click', () => wordDoc($('#ss-subject').value || 'Sources sought response', markdown($('#ss-body').value)));
    $('#ss-save').addEventListener('click', async () => {
      try {
        await api('/jobs/sources_sought/' + id, { method: 'PATCH', body: { result: { ...r, subject: $('#ss-subject').value, cover_email: $('#ss-email').value, edited: $('#ss-body').value } } });
        toast('Saved.');
      } catch (err) { toast(err.message, 'error'); }
    });
    $('#ss-del').addEventListener('click', async () => {
      if (!confirm('Delete this response?')) return;
      try { await api('/jobs/sources_sought/' + id, { method: 'DELETE' }); navigate('/sources-sought'); } catch (err) { toast(err.message, 'error'); }
    });
  }

  // ------------------------------------------------------------------ Submission Preflight (every member)

  const PF_TONE = { pass: ['check', 'text-emerald-300', 'bg-emerald-500/15'], warn: ['bell', 'text-amber-200', 'bg-amber-400/15'], fail: ['x', 'text-brand-redSoft', 'bg-brand-red/20'], todo: ['check', 'text-mist-500', 'bg-white/[0.06]'] };

  async function viewPreflightPicker(view) {
    const { proposals } = await api('/proposals');
    const ready = proposals.filter((p) => p.status === 'ready');
    view.innerHTML = `${pageHead('Submission Preflight', 'The last check before you send: page limits, due date and time zone, amendments, clause statements, pricing, signatures and the forms to attach.')}
      ${ready.length ? `<ul class="grid gap-2.5">${ready.map((p) => `<li><a href="/app/preflight/${p.id}" data-link class="row-link flex items-center justify-between gap-3"><span class="truncate font-medium text-white">${esc(p.title)}</span><span class="text-xs text-mist-500">${fmtDate(p.createdAt)}</span></a></li>`).join('')}</ul>`
        : emptyState('No finished proposals yet', 'Write a proposal, then run the preflight before you submit it.', '<a href="/app/proposals/new" data-link class="btn-primary">New proposal</a>')}`;
  }

  async function viewPreflight(view, id) {
    let data = await api(`/proposals/${id}/preflight`);
    const draw = () => {
      const counts = data.items.reduce((c, i) => ({ ...c, [i.status]: (c[i.status] || 0) + 1 }), {});
      view.innerHTML = `
        ${pageHead('Submission Preflight', esc(data.proposal.title), `<a href="/app/proposals/${id}" data-link class="btn-ghost">Open the proposal</a>`)}
        <section class="card mb-6 flex flex-wrap items-center gap-6 p-6">${scoreRing(data.score)}
          <div class="min-w-0 flex-1">
            <p class="text-lg font-semibold text-white">${data.ready ? 'Ready to submit' : counts.fail ? `${counts.fail} thing${counts.fail === 1 ? '' : 's'} to fix before you submit` : 'Almost there: finish the manual checks'}</p>
            <p class="mt-1 text-sm text-mist-400">${counts.pass || 0} passed · ${counts.warn || 0} to double-check · ${(counts.fail || 0) + (counts.todo || 0)} open. About ${data.facts.estPages} page${data.facts.estPages === 1 ? '' : 's'}${data.facts.pageLimit ? ` of ${data.facts.pageLimit} allowed` : ''}.</p>
            ${data.linked ? '' : '<p class="mt-2 text-sm text-amber-200">Link the decrypted solicitation to this proposal for the full check.</p>'}
          </div>
        </section>
        <ol class="space-y-3">${data.items.map((i) => {
          const [ic, tone, bg] = PF_TONE[i.status];
          return `<li class="card flex gap-4 p-5">
            ${i.manual ? `<label class="mt-0.5 shrink-0"><input type="checkbox" data-pf="${i.key}" class="h-5 w-5 accent-brand-blue" ${i.status === 'pass' ? 'checked' : ''} aria-label="${esc(i.title)}" /></label>`
              : `<span class="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${bg} ${tone}">${icon(ic, 'h-3.5 w-3.5')}</span>`}
            <div class="min-w-0 flex-1"><p class="font-semibold text-white">${esc(i.title)}</p><p class="mt-1 text-sm text-mist-400">${esc(i.body)}</p></div>
          </li>`;
        }).join('')}</ol>
        <p class="mt-4 text-xs text-mist-500">Automatic checks read the decrypted solicitation and your draft. They catch common misses; the solicitation itself is always the final word.</p>`;
      $$('[data-pf]', view).forEach((cb) => cb.addEventListener('change', async () => {
        try { data = await api(`/proposals/${id}/preflight`, { method: 'PATCH', body: { key: cb.dataset.pf, done: cb.checked } }); draw(); }
        catch (err) { cb.checked = !cb.checked; toast(err.message, 'error'); }
      }));
    };
    draw();
  }

  // ------------------------------------------------------------------ Calendar feed and text reminders (Deadline Alerts page)

  async function alertsExtras(box) {
    let cal;
    try { cal = await api('/calendar/link'); } catch { return; }
    const draw = () => {
      box.innerHTML = `
        <section class="card p-6 text-sm">
          <h2 class="font-semibold text-white">Add deadlines to your calendar</h2>
          <p class="mt-2 text-mist-400">Subscribe once in Google Calendar, Apple Calendar or Outlook. Bid due dates, milestones and your SAM.gov renewal show up and stay in sync.</p>
          <input id="cal-url" class="field mt-3 !text-xs" readonly value="${esc(cal.url)}" aria-label="Your private calendar link" />
          <div class="mt-3 flex flex-wrap gap-2">
            <button id="cal-copy" class="btn-primary !py-2">Copy link</button>
            <a class="btn-ghost !py-2" target="_blank" rel="noopener noreferrer" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(cal.url.replace(/^https:/, 'webcal:'))}">Google Calendar</a>
            <a class="btn-ghost !py-2" href="${esc(cal.url.replace(/^https:/, 'webcal:'))}">Apple / Outlook</a>
          </div>
          <p class="mt-3 text-xs text-mist-500">Keep this link private. <button id="cal-reset" class="font-semibold text-brand-blueSoft hover:text-white">Make a new link</button> to turn the old one off.</p>
        </section>
        ${cal.sms && cal.sms.available ? `<section class="card p-6 text-sm">
          <h2 class="font-semibold text-white">Text reminders</h2>
          <label class="mt-3 flex items-start gap-3 text-mist-100"><input id="sms-toggle" type="checkbox" class="mt-1 accent-brand-blue" ${cal.sms.on ? 'checked' : ''} />
            <span>Text me 3 days and 1 day before a proposal is due${cal.sms.phone ? ` at ${esc(cal.sms.phone)}` : ''}. Message and data rates may apply. Reply STOP to opt out.</span></label>
          ${cal.sms.phone ? '' : '<p class="mt-2 text-xs text-amber-200">Add a mobile number in your <a href="/app/profile" data-link class="font-semibold underline">profile</a> first.</p>'}
        </section>` : ''}`;
      $('#cal-copy', box).addEventListener('click', () => copyText(cal.url, 'Calendar link copied.'));
      $('#cal-reset', box).addEventListener('click', async () => {
        if (!confirm('Make a new link? Calendars using the old link stop updating.')) return;
        try { cal = { ...cal, ...(await api('/calendar/reset', { method: 'POST', body: {} })) }; draw(); toast('New link ready. Subscribe again with it.'); } catch (err) { toast(err.message, 'error'); }
      });
      const sms = $('#sms-toggle', box);
      if (sms) sms.addEventListener('change', async () => {
        try { await api('/me/sms-alerts', { method: 'PATCH', body: { on: sms.checked } }); cal.sms.on = sms.checked; toast(sms.checked ? 'Text reminders on.' : 'Text reminders off.'); }
        catch (err) { sms.checked = !sms.checked; toast(err.message, 'error'); }
      });
    };
    draw();
  }
