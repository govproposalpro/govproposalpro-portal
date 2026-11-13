  // ------------------------------------------------------------------ GovCon Coach (every member, daily fair-use)

  const COACH_STARTERS = [
    'What is the difference between an RFQ, an RFP and a sources sought?',
    'Can I subcontract most of a small business set-aside?',
    'How do I price my first services bid?',
    'What should I do in my first 30 days after an award?',
  ];

  async function viewCoach(view) {
    const [data, bids] = await Promise.all([api('/coach'), loadBids().catch(() => [])]);
    let { messages, usage } = data;
    const params = new URLSearchParams(location.search);
    view.innerHTML = `${pageHead('GovCon Coach', 'Ask anything about government contracting. The coach knows your profile, your pipeline and, if you pick one, a decrypted bid.',
      '<button id="co-clear" class="btn-ghost">Clear chat</button>')}
      <section class="card flex min-h-[60vh] flex-col p-0">
        <div id="co-log" class="flex-1 space-y-4 overflow-y-auto p-6"></div>
        <form id="co-form" class="border-t border-white/[0.07] p-4" novalidate>
          <div class="mb-3 flex flex-wrap items-center gap-2 text-sm text-mist-400"><label for="co-bid">About</label>
            <select id="co-bid" class="field !w-auto !py-1.5 !text-sm">${bidOptions(bids, params.get('bid'), 'My business in general')}</select>
            <span id="co-usage" class="ml-auto text-xs text-mist-500"></span></div>
          <div class="flex gap-2"><label class="sr-only" for="co-q">Your question</label>
            <textarea id="co-q" rows="2" maxlength="2000" class="field flex-1 resize-none" placeholder="e.g. Is this bid a good fit for a new LLC?"></textarea>
            <button class="btn-primary self-end">${icon('spark', 'h-4 w-4')}Ask</button></div>
        </form>
      </section>
      <p class="mt-3 text-xs text-mist-500">The coach is an AI guide, not a lawyer or accountant. Check the solicitation itself before you rely on an answer.</p>`;
    const log = $('#co-log');
    const bubble = (m) => m.role === 'user'
      ? `<div class="ml-auto max-w-[85%] rounded-3xl bg-brand-blue/20 px-4 py-3 text-sm text-white">${esc(m.content).replace(/\n/g, '<br/>')}</div>`
      : `<div class="max-w-[92%] rounded-3xl bg-white/[0.04] px-5 py-4"><div class="doc !text-sm">${markdown(m.content)}</div></div>`;
    const draw = () => {
      log.innerHTML = messages.length ? messages.map(bubble).join('')
        : `<div class="py-6 text-center"><p class="text-mist-300">Try one of these:</p><div class="mt-4 flex flex-wrap justify-center gap-2">${COACH_STARTERS.map((q, i) => `<button type="button" class="btn-ghost !text-sm" data-q="${i}">${esc(q)}</button>`).join('')}</div></div>`;
      $('#co-usage').textContent = `${Math.max(0, usage.limit - usage.used)} of ${usage.limit} questions left today`;
      $$('[data-q]', log).forEach((b) => b.addEventListener('click', () => { $('#co-q').value = COACH_STARTERS[Number(b.dataset.q)]; $('#co-form').requestSubmit(); }));
      log.scrollTop = log.scrollHeight;
    };
    draw();
    $('#co-q').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#co-form').requestSubmit(); } });
    $('#co-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = $('#co-q').value.trim();
      if (!q) return;
      const btn = $('button', e.target.lastElementChild);
      btn.disabled = true;
      messages = [...messages, { role: 'user', content: q }];
      draw();
      log.insertAdjacentHTML('beforeend', '<div id="co-wait" class="flex items-center gap-2 text-sm text-mist-400"><span class="spinner"></span>Thinking</div>');
      log.scrollTop = log.scrollHeight;
      $('#co-q').value = '';
      try {
        const r = await api('/coach', { method: 'POST', body: { message: q, bidId: $('#co-bid').value || null } });
        messages = [...messages.slice(0, -1), ...r.messages];
        usage = r.usage;
      } catch (err) {
        messages = messages.slice(0, -1);
        $('#co-q').value = q;
        toast(err.message, 'error');
      }
      btn.disabled = false;
      draw();
    });
    $('#co-clear').addEventListener('click', async () => {
      try { await api('/coach', { method: 'DELETE' }); messages = []; draw(); } catch (err) { toast(err.message, 'error'); }
    });
  }

  // ------------------------------------------------------------------ Cash-Flow Autopilot (Enterprise)

  async function viewCashflow(view) {
    const d = await api('/cashflow');
    const s = d.summary;
    const tile = (label, value, cls = 'text-white', note = '') => `<div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">${label}</p><p class="mt-1 text-2xl font-semibold ${cls}">${value}</p>${note ? `<p class="mt-1 text-xs text-mist-500">${note}</p>` : ''}</div>`;
    const head = pageHead('Cash-Flow Autopilot', 'Where to bill, when the government should pay you, what you owe your subs and when, and the cash gap in between.',
      `<a href="/app/invoices" data-link class="btn-ghost">${icon('receipt', 'h-4 w-4')}Invoices</a><a href="/app/milestones" data-link class="btn-ghost">${icon('flag', 'h-4 w-4')}Milestones</a>`);
    if (!d.contracts.length) {
      view.innerHTML = head + emptyState('No contracts yet', 'Move a bid to Won in your Bid CRM, add milestones with your subs\' amounts and create invoices. The plan builds itself from those.', '<a href="/app/crm" data-link class="btn-primary">Open Bid CRM</a>');
      return;
    }
    view.innerHTML = `${head}
      ${s.gap ? `<div class="mb-6 rounded-3xl border border-amber-300/25 bg-amber-400/10 p-5 text-sm text-amber-100"><p class="font-semibold">Cash gap of ${money2(s.gap.amount)} around ${fmtDate(s.gap.date)}</p>
        <p class="mt-1">Your subs are owed before the government pays you. Options: submit invoices the day work is accepted, agree net 30 or pay-when-paid terms with your subs, or line up invoice factoring or a line of credit before then. Government invoices are low-risk, so factoring rates are usually modest.</p></div>` : ''}
      <div class="mb-6 grid gap-3 sm:grid-cols-3">
        ${tile('Expected in 30 days', money2(s.expectedIn30), 'text-emerald-300', 'government payments due')}
        ${tile('Owed to subs in 30 days', money2(s.owedToSubs30), s.owedToSubs30 > s.expectedIn30 ? 'text-brand-redSoft' : 'text-white', 'open milestones with a sub and amount')}
        ${tile('Billed, not yet paid', money2(s.outstanding))}
      </div>
      <div class="space-y-6">${d.contracts.map((c) => `
        <section class="card p-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div><h2 class="font-semibold text-white">${esc(c.title)}</h2><p class="text-sm text-mist-400">${esc(c.agency || '')}</p></div>
            <span class="pill bg-brand-blue/15 text-brand-blueSoft">Bill in: ${esc(c.portal.name)}</span>
          </div>
          <p class="mt-3 text-sm text-mist-300">${esc(c.portal.note)} ${c.portal.url ? `<a class="font-semibold text-brand-blueSoft hover:text-white" href="${esc(c.portal.url)}" target="_blank" rel="noopener noreferrer">Open ${esc(c.portal.name)}</a>` : ''}</p>
          ${c.invoices.length ? `<div class="mt-4 overflow-x-auto"><table class="tbl min-w-[600px]"><thead><tr><th>Invoice</th><th class="text-right">Amount</th><th>Status</th><th>Gov pays by</th><th>Before you submit</th></tr></thead><tbody>
            ${c.invoices.map((i) => `<tr><td><a href="/app/invoices/${i.id}" data-link class="font-medium text-white hover:text-brand-blueSoft">${esc(i.number)}</a></td>
              <td class="text-right text-white">${money2(i.total)}</td><td>${statusLabel(i.status)}</td>
              <td class="text-sm ${i.late ? 'text-brand-redSoft' : 'text-mist-300'}">${i.expectedPay ? fmtDate(i.expectedPay) : i.status === 'paid' ? 'Paid' : ''}${i.late ? `<p class="text-xs">${esc(i.late.note)}</p>` : ''}</td>
              <td class="text-xs">${i.checks.length ? i.checks.map((x) => `<p class="text-amber-200">${esc(x)}</p>`).join('') : i.status === 'paid' ? '' : '<span class="text-emerald-300">Looks complete</span>'}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="mt-3 text-sm text-mist-500">No invoices yet.</p>'}
          ${c.subPayments.length ? `<h3 class="mt-5 text-sm font-semibold text-white">You owe your subs</h3><ul class="mt-2 divide-y divide-white/[0.06] text-sm">${c.subPayments.map((p) => `<li class="flex justify-between gap-3 py-2"><span class="text-mist-200">${esc(p.sub)} · ${esc(p.title)}</span><span class="shrink-0 text-mist-300">${money2(p.amount)} · ${fmtDate(p.due)}</span></li>`).join('')}</ul>` : ''}
        </section>`).join('')}</div>
      ${d.timeline.length ? sectionCard('Cash timeline', `<div class="overflow-x-auto"><table class="tbl min-w-[520px]"><thead><tr><th>Date</th><th>What</th><th class="text-right">In / out</th><th class="text-right">Running</th></tr></thead><tbody>
        ${d.timeline.map((e) => `<tr><td class="text-mist-300">${fmtDate(e.date)}</td><td class="text-mist-200">${esc(e.label)}</td>
          <td class="text-right ${e.kind === 'in' ? 'text-emerald-300' : 'text-brand-redSoft'}">${e.kind === 'in' ? '+' : '-'}${money2(e.amount)}</td>
          <td class="text-right ${e.balance < 0 ? 'text-brand-redSoft' : 'text-white'}">${money2(e.balance)}</td></tr>`).join('')}
      </tbody></table></div><p class="mt-3 text-xs text-mist-500">Government payment dates use the Prompt Payment Act's 30 days from a proper invoice. Sub payments use each milestone's due date.</p>`, 'mt-6') : ''}`;
  }
  const statusLabel = (s) => ({ draft: '<span class="pill bg-white/[0.06] text-mist-300">Draft</span>', submitted: '<span class="pill bg-brand-blue/15 text-brand-blueSoft">Submitted</span>', paid: '<span class="pill bg-emerald-500/15 text-emerald-300">Paid</span>' }[s] || esc(s));

  // ------------------------------------------------------------------ SAM.gov import (browser extension)

  const EXTENSION_ZIP = '/assets/extension/govproposalpro-sam-extension.zip';

  function extensionCard() {
    return sectionCard('Get the SAM.gov button', `
      <p class="text-sm text-mist-300">Install the free GovProposalPro extension for Chrome, Edge or Brave. Every opportunity on SAM.gov gets a <b class="text-white">Send to GovProposalPro</b> button that brings the bid straight here.</p>
      <ol class="mt-3 list-decimal space-y-1 pl-5 text-sm text-mist-300">
        <li>Download the extension and unzip it.</li>
        <li>Open <span class="font-mono text-mist-100">chrome://extensions</span> and turn on Developer mode.</li>
        <li>Click Load unpacked and choose the unzipped folder.</li>
      </ol>
      <a href="${EXTENSION_ZIP}" download class="btn-primary mt-4">${icon('upload', 'h-4 w-4')}Download the extension</a>
      <p class="mt-3 text-xs text-mist-500">It reads only the notice id in the address bar and collects nothing.</p>`);
  }

  async function viewImport(view) {
    const id = new URLSearchParams(location.search).get('notice') || '';
    const head = pageHead('Bring in a SAM.gov bid', 'Add it to your Bid CRM, size up the competition and get to work.');
    if (!/^[a-f0-9]{32}$/i.test(id)) {
      view.innerHTML = `${head}<div class="grid gap-6 lg:grid-cols-2">${extensionCard()}
        ${sectionCard('Or paste a link', `<form id="im-form" class="flex gap-2" novalidate><label class="sr-only" for="im-url">SAM.gov link</label><input id="im-url" class="field flex-1" placeholder="https://sam.gov/opp/.../view" /><button class="btn-primary">Open</button></form>`)}</div>`;
      $('#im-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const m = $('#im-url').value.match(/\/opp\/([a-f0-9]{32})/i);
        if (!m) return toast('Paste a SAM.gov opportunity link (it contains /opp/ and a long id).', 'error');
        navigate('/import?notice=' + m[1].toLowerCase());
      });
      return;
    }
    view.innerHTML = `${head}<div class="card flex items-center justify-center gap-3 p-10 text-mist-400"><span class="spinner"></span>Reading the notice from SAM.gov</div>`;
    let r;
    try {
      r = await api('/sam-notice/' + id);
    } catch (err) {
      view.innerHTML = head + emptyState('Could not read that notice', esc(err.message), /key/i.test(err.message) ? '<a href="/app/sam-key" data-link class="btn-primary">Add my SAM.gov key</a>' : '');
      return;
    }
    const o = r.notice;
    let bidId = r.bidId;
    const early = /sources sought|request for information|special notice/i.test(`${o.type} ${o.title}`);
    const draw = () => {
      view.innerHTML = `${head}
        <article class="card p-6">
          <p class="text-lg font-semibold text-white">${esc(o.title)}</p>
          <p class="mt-1 text-sm text-mist-400">${esc([o.agency, o.office].filter(Boolean).join(' · '))}</p>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <span class="pill bg-white/[0.06] text-mist-300">${esc(o.type || 'Notice')}</span>
            ${o.solicitationNumber ? `<span class="pill bg-white/[0.06] text-mist-300">${esc(o.solicitationNumber)}</span>` : ''}
            ${o.naics ? `<span class="pill bg-white/[0.06] text-mist-300">NAICS ${esc(o.naics)}</span>` : ''}
            ${o.setAside ? `<span class="pill bg-brand-blue/15 text-brand-blueSoft">${esc(o.setAside)}</span>` : ''}
            ${o.responseDeadline ? `<span class="pill bg-white/[0.06] text-mist-300">${icon('cal', 'h-3 w-3')}Due ${fmtDate(toIsoDate(o.responseDeadline))}</span>` : ''}
          </div>
          <div class="mt-5 flex flex-wrap gap-2">
            ${bidId ? `<a href="/app/crm" data-link class="btn-ghost">${icon('check', 'h-4 w-4')}In your Bid CRM</a>` : `<button id="im-add" class="btn-primary">${icon('plus', 'h-4 w-4')}Add to Bid CRM</button>`}
            ${hasTool('competition_xray') ? `<button id="im-xray" class="btn-ghost">${icon('search', 'h-4 w-4')}X-Ray the competition</button>` : ''}
            ${hasTool('bid_decryptor') ? `<a href="/app/decryptor" data-link class="btn-ghost">${icon('decrypt', 'h-4 w-4')}Decrypt it</a>` : ''}
            ${early && hasTool('sources_sought') ? `<button id="im-ss" class="btn-ghost">${icon('pen', 'h-4 w-4')}Draft a response</button>` : ''}
            <a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer" class="btn-ghost">Open on SAM.gov</a>
          </div>
        </article>`;
      const ensureBid = async () => {
        if (bidId) return bidId;
        await addNoticeToCrm(o, 'Sent from SAM.gov with the GovProposalPro extension.');
        const fresh = await loadBids();
        const hit = fresh.find((b) => b.solicitationNumber && b.solicitationNumber === o.solicitationNumber) || fresh.find((b) => b.title === o.title.slice(0, 200));
        bidId = hit ? hit.id : null;
        return bidId;
      };
      const add = $('#im-add');
      if (add) add.addEventListener('click', async () => {
        add.disabled = true;
        try { await ensureBid(); toast('Added to your Bid CRM. Amendment Watch will keep an eye on it.'); draw(); } catch (err) { add.disabled = false; toast(err.message, 'error'); }
      });
      const xr = $('#im-xray');
      if (xr) xr.addEventListener('click', async () => {
        xr.disabled = true;
        try { const b = await ensureBid(); navigate(b ? '/x-ray?bid=' + b : '/x-ray'); } catch (err) { xr.disabled = false; toast(err.message, 'error'); }
      });
      const ss = $('#im-ss');
      if (ss) ss.addEventListener('click', async () => {
        ss.disabled = true;
        try { const { id: jobId } = await api('/jobs/sources_sought', { method: 'POST', body: { notice: o } }); navigate('/sources-sought/' + jobId); } catch (err) { ss.disabled = false; toast(err.message, 'error'); }
      });
    };
    draw();
  }
