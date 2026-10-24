  // ------------------------------------------------------------------ Section M Grader, RFI Ghostwriter, Past Performance Portfolio (Enterprise)

  const JOB_KIND_OF = { 'section-m': 'section_m', rfi: 'rfi', portfolio: 'case_study' };
  const JOB_PATH = { section_m: '/section-m', rfi: '/rfi', case_study: '/portfolio' };
  const JOB_COPY = {
    section_m: { title: 'Section M Compliance Grader', sub: 'Grade a finished proposal against the solicitation\'s evaluation criteria before the government does.', start: 'Grade a proposal', noun: 'grades' },
    rfi: { title: 'RFI Ghostwriter', sub: 'Turn the gaps and ambiguities in a solicitation into clear questions for the contracting officer.', start: 'Draft RFI questions', noun: 'RFI drafts' },
    case_study: { title: 'Past Performance Portfolio', sub: 'Turn completed work into polished case studies, capability statement bullets and proposal-ready paragraphs.', start: 'Build a case study', noun: 'case studies' },
  };
  const STATUS_TONE = { strong: 'bg-emerald-500/15 text-emerald-300', adequate: 'bg-brand-blue/15 text-brand-blueSoft', weak: 'bg-amber-400/15 text-amber-200', missing: 'bg-brand-red/20 text-brand-redSoft' };

  async function startJobModal(kind) {
    const go = async (body) => {
      const { id } = await api('/jobs/' + kind, { method: 'POST', body });
      $('[data-close]').click();
      navigate(`${JOB_PATH[kind]}/${id}`);
    };
    let html;
    if (kind === 'section_m') {
      const [{ proposals }, { summaries }] = await Promise.all([api('/proposals'), api('/decryptor')]);
      const ready = proposals.filter((p) => p.status === 'ready');
      if (!ready.length) { toast('Generate a proposal first, then grade it here.', 'error'); return; }
      html = `<div><label class="label" for="jb-p">Proposal</label><select id="jb-p" name="proposalId" class="field">${ready.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}</select></div>
        <div><label class="label" for="jb-s">Grade against (optional)</label><select id="jb-s" name="rfpSummaryId" class="field"><option value="">The solicitation the proposal was written from</option>${summaries.filter((s) => s.status === 'ready').map((s) => `<option value="${s.id}">${esc(s.title || s.fileName)}</option>`).join('')}</select></div>`;
    } else if (kind === 'rfi') {
      const { summaries } = await api('/decryptor');
      const ready = summaries.filter((s) => s.status === 'ready');
      if (!ready.length) { toast('Decrypt the solicitation first, then draft your questions here.', 'error'); return; }
      html = `<div><label class="label" for="jb-s">Solicitation</label><select id="jb-s" name="rfpSummaryId" class="field">${ready.map((s) => `<option value="${s.id}">${esc(s.title || s.fileName)}</option>`).join('')}</select></div>
        <div><label class="label" for="jb-n">What are you unsure about? (optional)</label><textarea id="jb-n" name="notes" rows="4" class="field" maxlength="4000" placeholder="e.g. Is a site visit required? Can we quote an equal brand?"></textarea></div>`;
    } else {
      const pp = state.me.user.pastPerformance || [];
      html = `${pp.length ? `<div><label class="label" for="jb-pp">Start from your profile</label><select id="jb-pp" class="field"><option value="">Type a project below</option>${pp.map((p, i) => `<option value="${i}">${esc(p.title || p.customer)}</option>`).join('')}</select></div>` : ''}
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2"><label class="label" for="jb-t">Project name</label><input id="jb-t" name="title" class="field" maxlength="200" /></div>
          <div><label class="label" for="jb-c">Customer</label><input id="jb-c" name="customer" class="field" maxlength="200" /></div>
          <div><label class="label" for="jb-no">Contract number</label><input id="jb-no" name="contractNumber" class="field" maxlength="80" /></div>
          <div><label class="label" for="jb-v">Value</label><input id="jb-v" name="value" class="field" maxlength="60" /></div>
          <div><label class="label" for="jb-pe">Period</label><input id="jb-pe" name="period" class="field" maxlength="80" /></div>
          <div class="sm:col-span-2"><label class="label" for="jb-r">Your role</label><select id="jb-r" name="role" class="field"><option value="prime">Prime</option><option value="sub">Subcontractor</option><option value="commercial">Commercial client</option></select></div>
          <div class="sm:col-span-2"><label class="label" for="jb-d">What you delivered</label><textarea id="jb-d" name="description" rows="4" class="field" maxlength="4000"></textarea></div>
          <div class="sm:col-span-2"><label class="label" for="jb-res">Results (numbers help: on time, under budget, ratings)</label><textarea id="jb-res" name="results" rows="3" class="field" maxlength="3000"></textarea></div>
        </div>`;
    }
    openModal(`<h2 class="text-lg font-semibold text-white">${JOB_COPY[kind].start}</h2>
      <form id="jb-form" class="mt-5 space-y-4" novalidate>${html}
        <p id="jb-err" class="hidden text-sm text-brand-redSoft" role="alert"></p>
        <div class="flex items-center justify-between gap-2"><p class="text-xs text-mist-500">Takes about a minute.</p><div class="flex gap-2"><button type="button" class="btn-ghost" data-close>Cancel</button><button class="btn-primary">${icon('spark', 'h-4 w-4')}Start</button></div></div>
      </form>`);
    const form = $('#jb-form');
    const pick = $('#jb-pp');
    if (pick) pick.addEventListener('change', () => {
      const p = (state.me.user.pastPerformance || [])[Number(pick.value)];
      if (!p) return;
      ['title', 'customer', 'value', 'period', 'role', 'description'].forEach((k) => { if (form.elements[k]) form.elements[k].value = p[k] || ''; });
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = (n) => (form.elements[n] ? form.elements[n].value.trim() : '');
      const btn = $('button:not([data-close])', form);
      btn.disabled = true;
      try {
        if (kind === 'section_m') await go({ proposalId: Number(v('proposalId')), rfpSummaryId: v('rfpSummaryId') ? Number(v('rfpSummaryId')) : null });
        else if (kind === 'rfi') await go({ rfpSummaryId: Number(v('rfpSummaryId')), notes: v('notes') });
        else await go({ project: { title: v('title'), customer: v('customer'), contractNumber: v('contractNumber'), value: v('value'), period: v('period'), role: v('role'), description: v('description'), results: v('results') } });
      } catch (err) { btn.disabled = false; const el = $('#jb-err'); el.textContent = err.message; el.classList.remove('hidden'); }
    });
  }

  async function viewJobs(view, kind) {
    const { jobs } = await api('/jobs/' + kind);
    const c = JOB_COPY[kind];
    view.innerHTML = `
      ${pageHead(c.title, c.sub, `<button id="jb-new" class="btn-primary">${icon('spark', 'h-4 w-4')}${c.start}</button>`)}
      ${jobs.length ? `<ul class="grid gap-2">${jobs.map((j) => `<li><a href="/app${JOB_PATH[kind]}/${j.id}" data-link class="row-link flex items-center justify-between gap-3">
          <span class="flex min-w-0 items-center gap-3">${kind === 'section_m' && j.result ? scoreRing(j.result.overall_score, 'h-11 w-11') : ''}<span class="truncate font-medium text-white">${esc(j.title)}</span></span>
          <span class="flex shrink-0 items-center gap-3 text-xs text-mist-500">${fmtDate(j.createdAt)} ${statusPill(j.status)}</span></a></li>`).join('')}</ul>`
        : emptyState(`No ${c.noun} yet`, c.sub, `<button id="jb-new2" class="btn-primary">${c.start}</button>`)}`;
    $$('#jb-new, #jb-new2', view).forEach((b) => b.addEventListener('click', () => startJobModal(kind).catch((err) => toast(err.message, 'error'))));
    pollWhileWorking(jobs);
  }

  function gradeView(r) {
    return `
      <section class="card mb-6 flex flex-wrap items-center gap-6 p-6">${scoreRing(r.overall_score)}<div class="min-w-0 flex-1"><p class="text-xs font-semibold uppercase tracking-[0.16em] text-mist-500">Predicted evaluation score</p><p class="mt-1 text-lg text-white">${esc(r.verdict)}</p></div></section>
      ${r.quick_fixes.length ? sectionCard('Fix these first', `<ol class="list-decimal space-y-1.5 pl-5 text-mist-200">${r.quick_fixes.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`, 'mb-6') : ''}
      <section class="card mb-6 overflow-x-auto p-5"><table class="tbl min-w-[720px]"><thead><tr><th>Criterion</th><th>Weight</th><th>Score</th><th>Where it stands</th><th>How to raise it</th></tr></thead><tbody>${r.criteria.map((c) => `
        <tr><td class="font-medium text-white">${esc(c.criterion)}</td><td class="text-mist-400">${esc(c.weight)}</td>
          <td><span class="pill ${STATUS_TONE[c.status] || ''}">${c.score}/10 ${esc(c.status)}</span></td><td class="text-mist-300">${esc(c.evidence)}</td><td class="text-mist-300">${esc(c.fix)}</td></tr>`).join('')}</tbody></table></section>
      ${r.missing_requirements.length ? sectionCard('Not answered yet', `<ul class="space-y-1.5 text-brand-redSoft">${r.missing_requirements.map((x) => `<li>• ${esc(x)}</li>`).join('')}</ul>`) : ''}`;
  }

  const rfiText = (r) => `${r.greeting}\n\n${r.intro}\n\n${r.questions.map((q, i) => `${i + 1}. (${q.reference}) ${q.question}`).join('\n\n')}\n\n${r.closing}`;

  const caseText = (r) => `${r.title}\n${r.client}\n\n${r.contract_facts.map((f) => `${f.label}: ${f.value}`).join('\n')}\n\nChallenge\n${r.challenge}\n\nSolution\n${r.solution}\n\nResults\n${r.results.map((x) => `- ${x}`).join('\n')}`;

  async function viewJob(view, kind, id) {
    const { job } = await api(`/jobs/${kind}/${id}`);
    const c = JOB_COPY[kind];
    const back = `<a href="/app${JOB_PATH[kind]}" data-link class="btn-ghost">All ${c.noun}</a>`;
    if (job.status === 'working') {
      view.innerHTML = pageHead(esc(job.title), '', back) + working(`Working on your ${c.noun.replace(/s$/, '')}`, 'This page refreshes on its own.');
      every(4000, () => render());
      return;
    }
    if (job.status === 'failed') {
      view.innerHTML = pageHead(esc(job.title), '', back) + emptyState('That did not finish', esc(job.error || 'Please try again.'), `<button id="jb-again" class="btn-primary">Try again</button>`);
      $('#jb-again').addEventListener('click', () => startJobModal(kind).catch((err) => toast(err.message, 'error')));
      return;
    }
    const r = job.result;
    const del = '<button id="jb-del" class="btn-ghost">Delete</button>';
    if (kind === 'section_m') {
      view.innerHTML = `<div class="no-print">${pageHead(esc(job.title), `Graded ${fmtDate(job.completedAt)}`, `${back}${del}<button id="jb-print" class="btn-ghost">Print</button>
        ${job.input.proposalId ? `<a href="/app/proposals/${job.input.proposalId}" data-link class="btn-primary">Open the proposal</a>` : ''}`)}</div><div class="print-area">${gradeView(r)}</div>`;
      $('#jb-print').addEventListener('click', () => window.print());
    } else if (kind === 'rfi') {
      let co = {};
      try { co = ((await api('/decryptor/' + job.input.rfpSummaryId)).summary.summary || {}).contracting_officer || {}; } catch { co = {}; }
      const coEmail = co.email && /@/.test(co.email) ? co.email : '';
      view.innerHTML = `${pageHead(esc(job.title), coEmail ? `To ${esc([co.name, co.email].filter(Boolean).join(', '))}` : 'Check the solicitation for where questions go and the deadline.',
        `${back}${del}<button id="jb-copy" class="btn-ghost">Copy</button><button id="jb-save" class="btn-ghost">Save edits</button><button id="jb-mail" class="btn-primary">${icon('mail', 'h-4 w-4')}Open in email</button>`)}
        <section class="card space-y-4 p-6">
          <div><label class="label" for="rf-subject">Subject</label><input id="rf-subject" class="field" maxlength="300" value="${esc(r.subject)}" /></div>
          <div><label class="label" for="rf-body">Email</label><textarea id="rf-body" rows="22" class="field leading-relaxed">${esc(rfiText(r))}</textarea></div>
          <p class="text-xs text-mist-500">Send before the question deadline in the solicitation. The contracting officer's answers are usually posted as an amendment for every bidder.</p>
        </section>`;
      $('#jb-copy').addEventListener('click', () => copyText(`Subject: ${$('#rf-subject').value}\n\n${$('#rf-body').value}`));
      $('#jb-mail').addEventListener('click', () => mailto({ to: coEmail, subject: $('#rf-subject').value, body: $('#rf-body').value }));
      $('#jb-save').addEventListener('click', async () => {
        try { await api(`/jobs/${kind}/${id}`, { method: 'PATCH', body: { result: { ...r, subject: $('#rf-subject').value, edited: $('#rf-body').value } } }); toast('Saved.'); } catch (err) { toast(err.message, 'error'); }
      });
      if (r.edited) $('#rf-body').value = r.edited;
    } else {
      view.innerHTML = `<div class="no-print">${pageHead(esc(r.title), esc(r.client), `${back}${del}<button id="jb-word" class="btn-ghost">Download Word</button><button id="jb-print" class="btn-primary">Print / PDF</button>`)}</div>
        <div class="print-area grid gap-6 lg:grid-cols-[1fr,340px]">
          <article class="card doc p-6 sm:p-10">
            <h1>${esc(r.title)}</h1><p><b>${esc(r.client)}</b></p>
            <table><tbody>${r.contract_facts.map((f) => `<tr><th>${esc(f.label)}</th><td>${phInline(f.value)}</td></tr>`).join('')}</tbody></table>
            <h2>Challenge</h2><p>${phInline(r.challenge)}</p><h2>Solution</h2><p>${phInline(r.solution)}</p>
            <h2>Results</h2><ul>${r.results.map((x) => `<li>${phInline(x)}</li>`).join('')}</ul>
          </article>
          <aside class="no-print space-y-4">
            ${sectionCard('Proposal paragraph', `<p class="text-sm leading-relaxed text-mist-200">${phInline(r.proposal_paragraph)}</p><button class="btn-ghost mt-3 !py-2" data-copy="proposal_paragraph">Copy</button>`)}
            ${sectionCard('Capability statement line', `<p class="text-sm text-mist-200">${phInline(r.capability_bullet)}</p><button class="btn-ghost mt-3 !py-2" data-copy="capability_bullet">Copy</button>`)}
            ${sectionCard('Matches solicitations about', `<div class="flex flex-wrap gap-1.5">${r.relevance_tags.map((t) => `<span class="pill bg-white/[0.06] text-mist-300">${esc(t)}</span>`).join('')}</div>`)}
          </aside>
        </div>`;
      $$('[data-copy]', view).forEach((b) => b.addEventListener('click', () => copyText(r[b.dataset.copy])));
      $('#jb-print').addEventListener('click', () => window.print());
      $('#jb-word').addEventListener('click', () => wordDoc(r.title, `<pre style="font-family:Calibri,Arial,sans-serif;white-space:pre-wrap">${esc(caseText(r))}</pre>`));
    }
    $('#jb-del').addEventListener('click', async () => {
      if (!confirm('Delete this?')) return;
      try { await api(`/jobs/${kind}/${id}`, { method: 'DELETE' }); navigate(JOB_PATH[kind]); } catch (err) { toast(err.message, 'error'); }
    });
  }
