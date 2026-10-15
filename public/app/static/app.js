/* GovProposalPro Command Center. Plain JS single-page app: no third-party code, no inline handlers. */
(() => {
  'use strict';

  // ------------------------------------------------------------------ helpers

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const state = { me: null, timers: [], shellReady: false };

  class ApiError extends Error {
    constructor(message, status, data) { super(message); this.status = status; this.data = data; }
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (res.status === 401 && path !== '/auth/login') {
      state.me = null;
      state.shellReady = false;
      navigate('/login');
      throw new ApiError(data.error || 'Please sign in.', 401, data);
    }
    if (!res.ok) throw new ApiError(data.error || 'Something went wrong. Please try again.', res.status, data);
    return data;
  }

  let toastTimer;
  function toast(msg, kind = 'info') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = el.className.replace(/\b(text-brand-redSoft|text-mist-100)\b/g, '') + (kind === 'error' ? ' text-brand-redSoft' : ' text-mist-100');
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 4200);
  }

  const fmtDate = (d) => (d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const fmtMoney = (n) => (n || n === 0 ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '');
  const daysUntil = (d) => Math.ceil((new Date(d + 'T23:59:59') - new Date()) / 86400000);

  function every(ms, fn) {
    const t = setInterval(fn, ms);
    state.timers.push(t);
  }

  // ------------------------------------------------------------------ icons

  const ICON = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
    crm: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
    decrypt: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><circle cx="11" cy="14" r="2.5"/><path d="m13 16 2.5 2.5"/>',
    proposal: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    upload: '<path d="M12 16V4"/><path d="m6 10 6-6 6 6"/><path d="M4 20h16"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  };
  const icon = (name, cls = 'h-5 w-5') =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ICON.spark}</svg>`;

  // ------------------------------------------------------------------ markdown (escaped first, then a safe subset)

  function inline(s) {
    return s
      .replace(/\[(INSERT|TBD)[^\]]*\]/g, (m) => `<span class="ph">${m}</span>`)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function markdown(src) {
    const lines = esc(src).split(/\r?\n/);
    const out = [];
    const isBlockStart = (l) => /^(#{1,6})\s|^\s*\||^\s*[-*+]\s+|^\s*\d+[.)]\s+|^\s*(-{3,}|\*{3,})\s*$/.test(l);
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) { i++; continue; }
      let m;
      if ((m = l.match(/^(#{1,6})\s+(.*)$/))) {
        const n = Math.min(m[1].length, 3);
        out.push(`<h${n}>${inline(m[2])}</h${n}>`);
        i++;
      } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) {
        out.push('<hr>');
        i++;
      } else if (/^\s*\|/.test(l)) {
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
        const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
        const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
        const [head, ...rest] = body;
        out.push('<table><thead><tr>' + cells(head).map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>' +
          rest.map((r) => '<tr>' + cells(r).map((c) => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
      } else if (/^\s*[-*+]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)) {
        const ordered = /^\s*\d+[.)]\s+/.test(l);
        const re = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
        const items = [];
        while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ''));
        const tag = ordered ? 'ol' : 'ul';
        out.push(`<${tag}>` + items.map((it) => `<li>${inline(it)}</li>`).join('') + `</${tag}>`);
      } else {
        const para = [];
        while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) para.push(lines[i++]);
        out.push(`<p>${inline(para.join(' '))}</p>`);
      }
    }
    return out.join('\n');
  }

  // ------------------------------------------------------------------ routing

  const routePath = () => location.pathname.replace(/^\/app/, '').replace(/\/$/, '') || '/';

  function navigate(path) {
    if (routePath() + location.search !== path) history.pushState(null, '', '/app' + (path === '/' ? '' : path));
    render();
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-link]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    $('#mobile-nav') && $('#mobile-nav').classList.add('hidden');
    navigate(a.getAttribute('href').replace(/^\/app/, '') || '/');
  });
  window.addEventListener('popstate', render);

  const ROUTE_OF = { proposal_engine: '/proposals', bid_decryptor: '/decryptor', bid_crm: '/crm' };
  const ICON_OF = { proposal_engine: 'proposal', bid_decryptor: 'decrypt', bid_crm: 'crm' };
  const ABOUT = {
    go_no_go: 'Analyzes each solicitation against your business profile and tells you if you are legally qualified to bid, including set-aside and limits on subcontracting checks.',
    vendor_scraper: 'Pulls targeted lists of local, top-rated subcontractors with phone numbers and emails based on the contract location and industry.',
    outreach: 'Auto-fills subcontractor and contract details into proven email templates so you can collect competitive quotes fast.',
    foia: 'Generates and sends FOIA requests for past winning bids and pricing data so you know the price to beat.',
    pricing_matrix: 'Calculates your middleman markup, adds allowable overhead to sub quotes, and formats the final pricing sheet.',
    milestones: 'Manages subcontractor deadlines after award and generates the federal invoices you need to get paid on time.',
    bid_matchmaker: 'Pushes high-probability solicitations to your dashboard every day based on your NAICS codes and business profile.',
    teaming_legal: 'Generates ready-to-sign NDAs and Teaming Agreements to lock in subcontractors and protect your margins.',
    section_m: 'Audits your draft against the government\'s exact evaluation criteria and flags anything missing before you submit.',
    rfi_ghostwriter: 'Turns confusing requirements into professional Requests for Information addressed to the Contracting Officer.',
    past_performance: 'Turns completed contracts into polished case studies and keeps your Capability Statement current.',
    state_directory: 'Every state\'s procurement portal in one place: where to register and where state and local bids are posted.',
  };

  // ------------------------------------------------------------------ shell

  function navItems() {
    const f = state.me.features;
    const link = (href, ic, label, extra = '') =>
      `<a href="/app${href === '/' ? '' : href}" data-link data-path="${href}" class="nav-link">${icon(ic)}<span class="flex-1">${esc(label)}</span>${extra}</a>`;
    const live = f.filter((x) => x.status === 'live' && x.unlocked);
    const rest = f.filter((x) => x.status !== 'live' || !x.unlocked);
    return `
      ${link('/', 'home', 'Command Center')}
      <p class="mt-5 px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-mist-500">Win work</p>
      ${live.map((x) => link(ROUTE_OF[x.key], ICON_OF[x.key], x.name)).join('')}
      <p class="mt-5 px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-mist-500">Toolkit</p>
      ${rest.map((x) => link('/feature/' + x.key, x.unlocked ? 'spark' : 'lock', x.name,
        x.unlocked ? '<span class="pill bg-brand-blue/15 text-brand-blueSoft">Soon</span>' : '<span class="pill bg-brand-red/15 text-brand-redSoft">Ent</span>')).join('')}
    `;
  }

  function renderShell() {
    const me = state.me;
    const ent = me.tier.key === 'enterprise';
    $('#root').innerHTML = `
      <div class="flex min-h-screen">
        <aside class="no-print sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-white/[0.06] bg-ink-950/60 p-4 backdrop-blur-xl lg:flex">
          <a href="/app" data-link class="mb-6 block px-2 pt-2"><img src="/assets/gpp-by-contract-bros.png" alt="GovProposalPro by Contract Bros" width="1200" height="386" class="h-auto w-48" /></a>
          <nav class="flex-1 space-y-0.5 overflow-y-auto pr-1">${navItems()}</nav>
          <div class="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
            <div class="flex items-center gap-2">
              <span class="pill ${ent ? 'bg-gradient-to-r from-brand-blue to-brand-red text-white' : 'bg-brand-blue/20 text-brand-blueSoft'}">${esc(me.tier.label)}</span>
            </div>
            <p class="mt-2 truncate text-sm text-mist-100">${esc(me.user.businessName || me.user.fullName || me.user.email)}</p>
            <div class="mt-2 flex gap-2">
              <a href="/app/profile" data-link class="btn-ghost flex-1 !px-2 !py-1.5 !text-xs">${icon('user', 'h-4 w-4')}Profile</a>
              <button id="logout" class="btn-ghost flex-1 !px-2 !py-1.5 !text-xs">${icon('out', 'h-4 w-4')}Sign out</button>
            </div>
          </div>
        </aside>
        <div class="flex min-w-0 flex-1 flex-col">
          <header class="no-print sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.06] bg-ink-950/80 px-4 py-3 backdrop-blur-xl lg:hidden">
            <img src="/assets/gpp-by-contract-bros.png" alt="GovProposalPro" width="1200" height="386" class="h-auto w-36" />
            <button id="menu" class="btn-ghost !p-2" aria-label="Menu">${icon('menu')}</button>
          </header>
          <div id="mobile-nav" class="no-print fixed inset-0 top-14 z-20 hidden overflow-y-auto bg-ink-950/95 p-4 backdrop-blur-xl lg:hidden">
            <nav class="space-y-0.5">${navItems()}
              <a href="/app/profile" data-link class="nav-link">${icon('user')}<span>Profile</span></a>
              <button id="logout-m" class="nav-link w-full">${icon('out')}<span>Sign out</span></button>
            </nav>
          </div>
          <main id="view" class="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8 sm:py-10"></main>
        </div>
      </div>`;
    const logout = async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      state.me = null;
      state.shellReady = false;
      navigate('/login');
    };
    $('#logout').addEventListener('click', logout);
    $('#logout-m').addEventListener('click', logout);
    $('#menu').addEventListener('click', () => $('#mobile-nav').classList.toggle('hidden'));
    state.shellReady = true;
  }

  function markActive(path) {
    $$('.nav-link[data-path]').forEach((a) => {
      const p = a.dataset.path;
      a.classList.toggle('active', p === '/' ? path === '/' : path === p || path.startsWith(p + '/'));
    });
  }

  async function refreshMe() {
    state.me = await api('/me');
  }

  async function render() {
    state.timers.forEach(clearInterval);
    state.timers = [];
    const path = routePath();
    if (path === '/login') return renderLogin();
    try {
      if (!state.me) await refreshMe();
    } catch {
      return;
    }
    if (!state.shellReady) renderShell();
    markActive(path);
    const view = $('#view');
    view.innerHTML = '<div class="flex justify-center py-20"><span class="spinner"></span></div>';
    window.scrollTo(0, 0);

    let m;
    try {
      if (path === '/') await viewHome(view);
      else if (path === '/crm') await viewCrm(view);
      else if (path === '/decryptor') await viewDecryptor(view);
      else if ((m = path.match(/^\/decryptor\/(\d+)$/))) await viewSummary(view, m[1]);
      else if (path === '/proposals') await viewProposals(view);
      else if (path === '/proposals/new') await viewNewProposal(view);
      else if ((m = path.match(/^\/proposals\/(\d+)$/))) await viewProposal(view, m[1]);
      else if (path === '/profile') viewProfile(view);
      else if ((m = path.match(/^\/feature\/([a-z_]+)$/))) viewFeature(view, m[1]);
      else view.innerHTML = emptyState('Page not found', 'That page does not exist.', '<a href="/app" data-link class="btn-primary">Back to Command Center</a>');
    } catch (err) {
      if (err.status !== 401) view.innerHTML = emptyState('Could not load this page', esc(err.message), '<a href="/app" data-link class="btn-ghost">Back</a>');
    }
  }

  const pageHead = (title, sub, actions = '') => `
    <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div><h1 class="text-2xl font-bold tracking-tight text-white sm:text-3xl">${title}</h1>${sub ? `<p class="mt-1.5 text-mist-400">${sub}</p>` : ''}</div>
      <div class="flex flex-wrap gap-2">${actions}</div>
    </div>`;

  const emptyState = (title, body, action = '') => `
    <div class="card mx-auto max-w-xl p-10 text-center">
      <h2 class="text-lg font-semibold text-white">${title}</h2>
      <p class="mt-2 text-mist-400">${body}</p>
      ${action ? `<div class="mt-6 flex justify-center gap-2">${action}</div>` : ''}
    </div>`;

  // ------------------------------------------------------------------ modal

  function openModal(html) {
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center';
    wrap.innerHTML = `<div class="card my-8 w-full max-w-2xl p-6 sm:p-8" role="dialog" aria-modal="true">${html}</div>`;
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    $$('[data-close]', wrap).forEach((b) => b.addEventListener('click', close));
    const first = $('input, textarea, select', wrap);
    if (first) first.focus();
    return { el: wrap, close };
  }

  // ------------------------------------------------------------------ login

  function renderLogin() {
    state.shellReady = false;
    $('#root').innerHTML = `
      <main class="flex min-h-screen items-center justify-center px-4 py-12">
        <div class="w-full max-w-md">
          <img src="/assets/gpp-by-contract-bros.png" alt="GovProposalPro by Contract Bros" width="1200" height="386" class="mx-auto mb-8 h-auto w-72" />
          <form id="login" class="card p-7 sm:p-9" novalidate>
            <h1 class="text-xl font-bold text-white">Sign in to your Command Center</h1>
            <p class="mt-1 text-sm text-mist-400">Use the email and password you created when you secured your access.</p>
            <div class="mt-6 space-y-4">
              <div><label class="label" for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" class="field" required /></div>
              <div><label class="label" for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" class="field" required /></div>
            </div>
            <p id="login-error" class="mt-4 hidden rounded-2xl border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-redSoft" role="alert"></p>
            <button class="btn-primary mt-6 w-full !py-3.5 !text-base" type="submit">Sign in</button>
            <p class="mt-5 text-center text-sm text-mist-400">No account yet? <a class="font-semibold text-brand-blueSoft hover:text-white" href="/access">Secure your access</a></p>
          </form>
          <p class="mt-6 text-center text-xs text-mist-500">Forgot your password? Email support and the Contract Bros team will reset it.</p>
        </div>
      </main>`;
    const form = $('#login');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      const errEl = $('#login-error');
      errEl.classList.add('hidden');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';
      try {
        await api('/auth/login', { method: 'POST', body: { email: form.email.value, password: form.password.value } });
        state.me = null;
        navigate('/');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Sign in';
      }
    });
  }

  // ------------------------------------------------------------------ home

  async function viewHome(view) {
    const [{ bids, stages }, { proposals, usage }] = await Promise.all([api('/bids'), api('/proposals')]);
    const me = state.me;
    const first = (me.user.fullName || '').split(' ')[0];
    const active = bids.filter((b) => !['won', 'lost'].includes(b.stage));
    const pipeline = active.reduce((s, b) => s + (b.estValue || 0), 0);
    const due = active.filter((b) => b.dueAt && b.stage !== 'submitted' && daysUntil(b.dueAt) >= 0 && daysUntil(b.dueAt) <= 21)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    const pct = Math.min(100, Math.round((usage.used / usage.limit) * 100));
    const won = bids.filter((b) => b.stage === 'won').length;

    view.innerHTML = `
      ${pageHead(`Welcome back${first ? ', ' + esc(first) : ''}`, 'Your government contracting command center.',
        '<a href="/app/decryptor" data-link class="btn-ghost">' + icon('decrypt', 'h-4 w-4') + 'Decrypt an RFP</a><a href="/app/proposals/new" data-link class="btn-primary">' + icon('proposal', 'h-4 w-4') + 'New proposal</a>')}
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="card p-5">
          <p class="text-sm text-mist-400">Proposals this month</p>
          <p class="mt-2 text-3xl font-bold text-white">${usage.used}<span class="text-lg font-medium text-mist-500"> / ${usage.limit}</span></p>
          <div class="meter mt-3"><span id="meter"></span></div>
          <p class="mt-2 text-xs text-mist-500">Resets ${fmtDate(usage.resetsAt)}</p>
        </div>
        <div class="card p-5"><p class="text-sm text-mist-400">Active opportunities</p><p class="mt-2 text-3xl font-bold text-white">${active.length}</p><p class="mt-2 text-xs text-mist-500">${won} won so far</p></div>
        <div class="card p-5"><p class="text-sm text-mist-400">Pipeline value</p><p class="mt-2 text-3xl font-bold text-white">${fmtMoney(pipeline)}</p><p class="mt-2 text-xs text-mist-500">Across open bids</p></div>
        <div class="card p-5"><p class="text-sm text-mist-400">Due in 21 days</p><p class="mt-2 text-3xl font-bold ${due.length ? 'text-brand-redSoft' : 'text-white'}">${due.length}</p><p class="mt-2 text-xs text-mist-500">Not yet submitted</p></div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-5">
        <section class="card p-6 lg:col-span-3">
          <div class="mb-4 flex items-center justify-between"><h2 class="font-semibold text-white">Pipeline</h2><a href="/app/crm" data-link class="text-sm text-brand-blueSoft hover:text-white">Open Bid CRM</a></div>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            ${stages.map((s) => `<a href="/app/crm" data-link class="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 transition hover:border-brand-blueSoft/30">
              <p class="text-xs text-mist-400">${esc(STAGE_LABEL[s])}</p><p class="mt-1 text-xl font-bold text-white">${bids.filter((b) => b.stage === s).length}</p></a>`).join('')}
          </div>
          <h3 class="mb-2 mt-6 text-sm font-semibold text-mist-300">Upcoming deadlines</h3>
          ${due.length ? `<ul class="divide-y divide-white/[0.06]">${due.slice(0, 6).map((b) => `
            <li class="flex items-center justify-between gap-3 py-2.5"><span class="truncate text-sm text-mist-100">${esc(b.title)}</span>
            <span class="pill shrink-0 ${daysUntil(b.dueAt) <= 3 ? 'bg-brand-red/20 text-brand-redSoft' : 'bg-white/[0.06] text-mist-300'}">${icon('cal', 'h-3.5 w-3.5')}${fmtDate(b.dueAt)}</span></li>`).join('')}</ul>`
            : '<p class="text-sm text-mist-500">No deadlines in the next three weeks.</p>'}
        </section>
        <section class="card p-6 lg:col-span-2">
          <div class="mb-4 flex items-center justify-between"><h2 class="font-semibold text-white">Recent proposals</h2><a href="/app/proposals" data-link class="text-sm text-brand-blueSoft hover:text-white">View all</a></div>
          ${proposals.length ? `<ul class="space-y-2">${proposals.slice(0, 6).map(proposalRow).join('')}</ul>`
            : '<p class="text-sm text-mist-500">Your first proposal is one click away. Decrypt an RFP, then let the engine draft it.</p>'}
        </section>
      </div>`;
    requestAnimationFrame(() => { const m = $('#meter'); if (m) m.style.width = pct + '%'; });
  }

  const statusPill = (s) => s === 'ready' ? '<span class="pill bg-emerald-500/15 text-emerald-300">Ready</span>'
    : s === 'failed' ? '<span class="pill bg-brand-red/15 text-brand-redSoft">Failed</span>'
      : '<span class="pill bg-brand-blue/20 text-brand-blueSoft"><span class="spinner !h-3 !w-3"></span>Working</span>';

  const proposalRow = (p) => `<li><a href="/app/proposals/${p.id}" data-link class="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 transition hover:border-brand-blueSoft/30">
    <span class="min-w-0"><span class="block truncate text-sm font-medium text-white">${esc(p.title)}</span><span class="text-xs text-mist-500">${fmtDate(p.createdAt)}</span></span>${statusPill(p.status)}</a></li>`;

  // ------------------------------------------------------------------ Visual Bid CRM

  const STAGE_LABEL = {
    prospecting: 'Prospecting', qualifying: 'Qualifying', sourcing: 'Sourcing Subs', pricing: 'Pricing',
    drafting: 'Drafting', submitted: 'Submitted', won: 'Won', lost: 'Lost',
  };
  const STAGE_DOT = {
    prospecting: 'bg-mist-400', qualifying: 'bg-brand-blueSoft', sourcing: 'bg-brand-blue', pricing: 'bg-violet-400',
    drafting: 'bg-amber-300', submitted: 'bg-brand-redSoft', won: 'bg-emerald-400', lost: 'bg-mist-500',
  };

  async function viewCrm(view) {
    const { bids, stages } = await api('/bids');
    const byId = new Map(bids.map((b) => [String(b.id), b]));

    const card = (b) => `
      <article class="bid-card" draggable="true" data-id="${b.id}" tabindex="0">
        <p class="text-sm font-semibold leading-snug text-white">${esc(b.title)}</p>
        ${b.agency ? `<p class="mt-1 truncate text-xs text-mist-400">${esc(b.agency)}</p>` : ''}
        <div class="mt-2.5 flex flex-wrap gap-1.5">
          ${b.dueAt ? `<span class="pill ${daysUntil(b.dueAt) <= 3 && !['submitted', 'won', 'lost'].includes(b.stage) ? 'bg-brand-red/20 text-brand-redSoft' : 'bg-white/[0.06] text-mist-300'}">${icon('cal', 'h-3 w-3')}${fmtDate(b.dueAt)}</span>` : ''}
          ${b.estValue ? `<span class="pill bg-white/[0.06] text-mist-300">${fmtMoney(b.estValue)}</span>` : ''}
          ${b.setAside ? `<span class="pill bg-brand-blue/15 text-brand-blueSoft">${esc(b.setAside)}</span>` : ''}
        </div>
      </article>`;

    view.innerHTML = `
      ${pageHead('Visual Bid CRM', 'Drag opportunities across the board from prospecting to award.', `<button id="new-bid" class="btn-primary">${icon('plus', 'h-4 w-4')}New opportunity</button>`)}
      <div class="-mx-4 overflow-x-auto px-4 pb-6 sm:-mx-8 sm:px-8">
        <div id="board" class="flex gap-4">
          ${stages.map((s) => `
            <section class="kanban-col" data-stage="${s}">
              <header class="mb-3 flex items-center justify-between px-1">
                <h2 class="flex items-center gap-2 text-sm font-semibold text-white"><span class="h-2 w-2 rounded-full ${STAGE_DOT[s]}"></span>${STAGE_LABEL[s]}</h2>
                <span class="text-xs text-mist-500" data-count>${bids.filter((b) => b.stage === s).length}</span>
              </header>
              <div class="flex min-h-[55vh] flex-1 flex-col gap-2.5" data-list>
                ${bids.filter((b) => b.stage === s).map(card).join('')}
              </div>
            </section>`).join('')}
        </div>
      </div>`;

    $('#new-bid').addEventListener('click', () => bidModal(null));

    // Drag and drop (mouse). Touch users open the card and change its stage.
    let dragId = null;
    const board = $('#board');
    board.addEventListener('dragstart', (e) => {
      const c = e.target.closest('.bid-card');
      if (!c) return;
      dragId = c.dataset.id;
      c.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    board.addEventListener('dragend', (e) => {
      const c = e.target.closest('.bid-card');
      if (c) c.classList.remove('dragging');
      $$('.kanban-col', board).forEach((col) => col.classList.remove('drop'));
    });
    const afterEl = (list, y) => $$('.bid-card:not(.dragging)', list).find((el) => {
      const r = el.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    $$('.kanban-col', board).forEach((col) => {
      const list = $('[data-list]', col);
      col.addEventListener('dragover', (e) => {
        if (!dragId) return;
        e.preventDefault();
        col.classList.add('drop');
        const dragging = $(`.bid-card[data-id="${dragId}"]`, board);
        const after = afterEl(list, e.clientY);
        if (after) list.insertBefore(dragging, after); else list.appendChild(dragging);
      });
      col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop'); });
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('drop');
        const stage = col.dataset.stage;
        const ids = $$('.bid-card', list).map((el) => Number(el.dataset.id));
        const bid = byId.get(dragId);
        dragId = null;
        if (bid) bid.stage = stage;
        $$('.kanban-col', board).forEach((c) => { $('[data-count]', c).textContent = $$('.bid-card', c).length; });
        try {
          await api('/bids/reorder', { method: 'POST', body: { stage, ids } });
        } catch (err) {
          toast(err.message, 'error');
          render();
        }
      });
    });
    board.addEventListener('click', (e) => {
      const c = e.target.closest('.bid-card');
      if (c) bidModal(byId.get(c.dataset.id));
    });
    board.addEventListener('keydown', (e) => {
      const c = e.target.closest('.bid-card');
      if (c && e.key === 'Enter') bidModal(byId.get(c.dataset.id));
    });
  }

  function bidModal(bid) {
    const b = bid || {};
    const stages = Object.keys(STAGE_LABEL);
    const f = (name, label, value, type = 'text', extra = '') =>
      `<div><label class="label" for="bf-${name}">${label}</label><input id="bf-${name}" name="${name}" type="${type}" value="${esc(value ?? '')}" class="field" ${extra} /></div>`;
    const m = openModal(`
      <form id="bid-form" novalidate>
        <div class="mb-6 flex items-start justify-between gap-4">
          <h2 class="text-xl font-bold text-white">${bid ? 'Opportunity' : 'New opportunity'}</h2>
          <button type="button" data-close class="text-mist-400 hover:text-white" aria-label="Close">&times;</button>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">${f('title', 'Title', b.title, 'text', 'required maxlength="200" placeholder="e.g. Janitorial Services, VA Medical Center"')}</div>
          ${f('agency', 'Agency', b.agency)}
          ${f('solicitationNumber', 'Solicitation number', b.solicitationNumber)}
          ${f('naics', 'NAICS', b.naics, 'text', 'maxlength="20"')}
          ${f('setAside', 'Set-aside', b.setAside, 'text', 'placeholder="e.g. Total Small Business"')}
          ${f('placeOfPerformance', 'Place of performance', b.placeOfPerformance)}
          ${f('dueAt', 'Response due', b.dueAt, 'date')}
          ${f('estValue', 'Estimated value ($)', b.estValue, 'number', 'min="0" step="1"')}
          <div><label class="label" for="bf-stage">Stage</label><select id="bf-stage" name="stage" class="field">${stages.map((s) => `<option value="${s}" ${s === (b.stage || 'prospecting') ? 'selected' : ''}>${STAGE_LABEL[s]}</option>`).join('')}</select></div>
          <div class="sm:col-span-2"><label class="label" for="bf-notes">Notes</label><textarea id="bf-notes" name="notes" rows="4" class="field">${esc(b.notes || '')}</textarea></div>
        </div>
        <p id="bid-error" class="mt-4 hidden text-sm text-brand-redSoft" role="alert"></p>
        <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div class="flex gap-2">${bid ? `<button type="button" id="bid-delete" class="btn-danger">Delete</button><a href="/app/proposals/new?bid=${bid.id}" data-link class="btn-ghost" id="bid-write">${icon('proposal', 'h-4 w-4')}Write proposal</a>` : ''}</div>
          <div class="flex gap-2"><button type="button" data-close class="btn-ghost">Cancel</button><button type="submit" class="btn-primary">Save</button></div>
        </div>
      </form>`);
    const form = $('#bid-form', m.el);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      data.estValue = data.estValue === '' ? null : Number(data.estValue);
      try {
        if (bid) await api('/bids/' + bid.id, { method: 'PATCH', body: data });
        else await api('/bids', { method: 'POST', body: data });
        m.close();
        render();
      } catch (err) {
        $('#bid-error', m.el).textContent = err.message;
        $('#bid-error', m.el).classList.remove('hidden');
      }
    });
    const del = $('#bid-delete', m.el);
    if (del) del.addEventListener('click', async () => {
      if (!confirm('Delete this opportunity? This cannot be undone.')) return;
      try { await api('/bids/' + bid.id, { method: 'DELETE' }); m.close(); render(); } catch (err) { toast(err.message, 'error'); }
    });
    const write = $('#bid-write', m.el);
    if (write) write.addEventListener('click', () => m.close());
  }

  // ------------------------------------------------------------------ AI Bid Decryptor

  async function viewDecryptor(view) {
    const [{ summaries }, { bids }] = await Promise.all([api('/decryptor'), api('/bids')]);
    view.innerHTML = `
      ${pageHead('AI Bid Decryptor', 'Drop in a 100-page solicitation. Get the one-page brief: scope, requirements, due dates and disqualifiers.')}
      <div class="grid gap-6 lg:grid-cols-5">
        <form id="decrypt-form" class="card p-6 lg:col-span-3" novalidate>
          <label id="drop" for="pdf" class="flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-mist-300/20 bg-ink-900/50 px-6 py-12 text-center transition hover:border-brand-blueSoft/50">
            <span class="mb-3 rounded-2xl bg-gradient-to-br from-brand-blue/30 to-brand-red/20 p-3 text-white">${icon('upload', 'h-6 w-6')}</span>
            <span id="drop-label" class="font-semibold text-white">Drop the solicitation PDF here</span>
            <span class="mt-1 text-sm text-mist-400">or click to choose a file (up to 20 MB)</span>
            <input id="pdf" type="file" accept="application/pdf,.pdf" class="sr-only" />
          </label>
          <details class="mt-4">
            <summary class="cursor-pointer text-sm text-mist-400 hover:text-white">No PDF? Paste the solicitation text instead</summary>
            <textarea id="paste" rows="8" class="field mt-3" placeholder="Paste the RFP, RFQ or Sources Sought text"></textarea>
          </details>
          <div class="mt-4"><label class="label" for="link-bid">Attach to an opportunity (optional)</label>
            <select id="link-bid" class="field"><option value="">None</option>${bids.map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join('')}</select></div>
          <p id="decrypt-error" class="mt-4 hidden text-sm text-brand-redSoft" role="alert"></p>
          <button type="submit" class="btn-primary mt-6 w-full !py-3.5">${icon('decrypt', 'h-5 w-5')}Decrypt solicitation</button>
        </form>
        <section class="card p-6 lg:col-span-2">
          <h2 class="mb-4 font-semibold text-white">Your decrypted solicitations</h2>
          ${summaries.length ? `<ul class="space-y-2">${summaries.map((s) => `<li><a href="/app/decryptor/${s.id}" data-link class="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 transition hover:border-brand-blueSoft/30">
            <span class="min-w-0"><span class="block truncate text-sm font-medium text-white">${esc(s.title || s.fileName)}</span><span class="text-xs text-mist-500">${s.responseDue ? 'Due ' + esc(s.responseDue) : fmtDate(s.createdAt)}</span></span>${statusPill(s.status)}</a></li>`).join('')}</ul>`
            : '<p class="text-sm text-mist-500">Nothing yet. Your first brief will show up here.</p>'}
        </section>
      </div>`;

    let file = null;
    const input = $('#pdf');
    const drop = $('#drop');
    const pick = (f) => {
      if (!f) return;
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') return toast('Please choose a PDF file.', 'error');
      if (f.size > 20 * 1024 * 1024) return toast('PDFs up to 20 MB are supported.', 'error');
      file = f;
      $('#drop-label').textContent = f.name;
    };
    input.addEventListener('change', () => pick(input.files[0]));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('border-brand-blueSoft/60'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('border-brand-blueSoft/60'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('border-brand-blueSoft/60'); pick(e.dataTransfer.files[0]); });

    $('#decrypt-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', e.target);
      const errEl = $('#decrypt-error');
      errEl.classList.add('hidden');
      const text = $('#paste').value.trim();
      if (!file && text.length < 200) {
        errEl.textContent = 'Upload the PDF or paste at least a few paragraphs of the solicitation.';
        errEl.classList.remove('hidden');
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Uploading';
      try {
        const body = { bidId: $('#link-bid').value ? Number($('#link-bid').value) : null };
        if (file) {
          body.pdfBase64 = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result).split(',')[1]);
            r.onerror = () => reject(new Error('Could not read that file.'));
            r.readAsDataURL(file);
          });
          body.fileName = file.name;
        } else {
          body.text = text;
        }
        const { id } = await api('/decryptor', { method: 'POST', body });
        navigate('/decryptor/' + id);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = icon('decrypt', 'h-5 w-5') + 'Decrypt solicitation';
      }
    });
  }

  const working = (title, sub) => `
    <div class="card mx-auto max-w-xl p-10 text-center">
      <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-blue to-brand-red shadow-glow"><span class="spinner !h-6 !w-6"></span></div>
      <h2 class="text-lg font-semibold text-white">${title}</h2>
      <p class="mt-2 text-mist-400">${sub}</p>
      <p class="mt-4 text-xs text-mist-500">You can leave this page. The result will be waiting for you.</p>
    </div>`;

  async function viewSummary(view, id) {
    const load = async () => (await api('/decryptor/' + id)).summary;
    let s = await load();
    if (s.status === 'working') {
      view.innerHTML = working('Decrypting the solicitation', 'Reading every page and pulling out what matters. Large RFPs take a minute or two.');
      every(4000, async () => {
        try { s = await load(); if (s.status !== 'working') render(); } catch { /* keep polling */ }
      });
      return;
    }
    if (s.status === 'failed') {
      view.innerHTML = emptyState('We could not decrypt that one', esc(s.error || 'Please try again.'), '<a href="/app/decryptor" data-link class="btn-primary">Try again</a>');
      return;
    }
    const d = s.summary || {};
    const list = (items) => (items && items.length ? `<ul class="space-y-1.5">${items.map((x) => `<li class="flex gap-2"><span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blueSoft"></span><span>${esc(x)}</span></li>`).join('')}</ul>` : '<p class="text-mist-500">Not stated</p>');
    const fact = (label, v) => `<div class="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3"><p class="text-[11px] font-semibold uppercase tracking-wider text-mist-500">${label}</p><p class="mt-1 text-sm text-white">${esc(v || 'Not stated')}</p></div>`;
    const block = (title, body, cls = '') => `<section class="card p-6 ${cls}"><h2 class="mb-3 font-semibold text-white">${title}</h2><div class="text-sm leading-relaxed text-mist-100">${body}</div></section>`;

    view.innerHTML = `
      ${pageHead(esc(d.title || s.fileName), esc([d.agency, d.solicitation_number].filter((x) => x && !/^not stated$/i.test(x)).join(' · ')),
        `<button id="to-bid" class="btn-ghost">${icon('crm', 'h-4 w-4')}${s.bidId ? 'Open in Bid CRM' : 'Add to Bid CRM'}</button>
         <a href="/app/proposals/new?summary=${s.id}${s.bidId ? '&bid=' + s.bidId : ''}" data-link class="btn-primary">${icon('proposal', 'h-4 w-4')}Write proposal</a>`)}
      <div class="mb-6 rounded-3xl border border-brand-red/25 bg-gradient-to-r from-brand-red/15 to-brand-blue/10 p-5">
        <p class="text-xs font-semibold uppercase tracking-wider text-brand-redSoft">Response due</p>
        <p class="mt-1 text-xl font-bold text-white">${esc(d.response_due || 'Not stated')}</p>
        ${d.questions_due && !/^not stated$/i.test(d.questions_due) ? `<p class="mt-1 text-sm text-mist-300">Questions due: ${esc(d.questions_due)}</p>` : ''}
      </div>
      <div class="grid items-start gap-6 lg:grid-cols-3">
        ${block('Executive summary', `<p>${esc(d.executive_summary)}</p>`, 'lg:col-span-2')}
        <section class="card p-6"><h2 class="mb-3 font-semibold text-white">At a glance</h2><div class="grid gap-2">
          ${fact('NAICS', d.naics)}${fact('Set-aside', d.set_aside)}${fact('Contract type', d.contract_type)}
          ${fact('Place of performance', d.place_of_performance)}${fact('Period of performance', d.period_of_performance)}${fact('Estimated value', d.estimated_value)}
        </div></section>
        ${block('Scope of work', list(d.scope_of_work), 'lg:col-span-2')}
        ${block('Key dates', d.key_dates && d.key_dates.length ? `<ul class="space-y-2">${d.key_dates.map((k) => `<li><p class="text-xs text-mist-500">${esc(k.label)}</p><p class="text-white">${esc(k.date)}</p></li>`).join('')}</ul>` : '<p class="text-mist-500">Not stated</p>')}
        ${block('Requirements', list(d.requirements), 'lg:col-span-2')}
        ${block('Deliverables', list(d.deliverables))}
        ${block('How to submit (Section L)', list(d.submission_instructions), 'lg:col-span-2')}
        ${block('How you\'ll be graded (Section M)', list(d.evaluation_criteria))}
        ${block('Disqualifiers and compliance flags', list(d.compliance_flags), 'lg:col-span-2 border-brand-red/25')}
        ${block('Subcontracting limits', `<p>${esc(d.subcontracting_notes || 'Not stated')}</p>`)}
      </div>`;

    $('#to-bid').addEventListener('click', async () => {
      try {
        await api(`/decryptor/${s.id}/to-bid`, { method: 'POST' });
        navigate('/crm');
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // ------------------------------------------------------------------ AI Proposal Engine

  async function viewProposals(view) {
    const { proposals, usage } = await api('/proposals');
    const left = Math.max(0, usage.limit - usage.used);
    view.innerHTML = `
      ${pageHead('AI Proposal Engine', `${left} of ${usage.limit} proposals left this month. Resets ${fmtDate(usage.resetsAt)}.`,
        `<a href="/app/proposals/new" data-link class="btn-primary">${icon('plus', 'h-4 w-4')}New proposal</a>`)}
      ${proposals.length ? `<ul class="grid gap-2">${proposals.map(proposalRow).join('')}</ul>`
        : emptyState('No proposals yet', 'Decrypt a solicitation or add an opportunity to your Bid CRM, then generate a compliant first draft in minutes.', '<a href="/app/proposals/new" data-link class="btn-primary">Write my first proposal</a>')}`;
    if (proposals.some((p) => p.status === 'working')) every(6000, () => render());
  }

  async function viewNewProposal(view) {
    const params = new URLSearchParams(location.search);
    const [{ bids }, { summaries }, { usage }] = await Promise.all([api('/bids'), api('/decryptor'), api('/proposals')]);
    const ready = summaries.filter((s) => s.status === 'ready');
    const left = usage.limit - usage.used;
    view.innerHTML = `
      ${pageHead('New proposal', left > 0 ? `Uses 1 of your ${left} remaining proposals this month.` : 'You have reached this month\'s proposal limit.')}
      <form id="proposal-form" class="card max-w-3xl p-6 sm:p-8" novalidate>
        <div class="grid gap-5">
          <div><label class="label" for="pf-bid">Opportunity from your Bid CRM</label>
            <select id="pf-bid" name="bidId" class="field"><option value="">None</option>${bids.map((b) => `<option value="${b.id}" ${String(b.id) === params.get('bid') ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select></div>
          <div><label class="label" for="pf-sum">Decrypted solicitation (strongly recommended)</label>
            <select id="pf-sum" name="rfpSummaryId" class="field"><option value="">None</option>${ready.map((s) => `<option value="${s.id}" ${String(s.id) === params.get('summary') ? 'selected' : ''}>${esc(s.title || s.fileName)}</option>`).join('')}</select>
            <p class="mt-1.5 text-xs text-mist-500">The engine mirrors the solicitation's own instructions and grading criteria when it has them.</p></div>
          <div><label class="label" for="pf-title">Proposal title (optional)</label><input id="pf-title" name="title" class="field" maxlength="200" /></div>
          <div><label class="label" for="pf-notes">Your notes for the writer</label>
            <textarea id="pf-notes" name="instructions" rows="6" class="field" maxlength="6000" placeholder="Win themes, the subcontractor you plan to use, staffing, anything the government should know about you. If you have no opportunity selected, describe the contract here."></textarea></div>
        </div>
        <p id="pf-error" class="mt-4 hidden text-sm text-brand-redSoft" role="alert"></p>
        <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs text-mist-500">Facts we don't know about your company are left as <span class="doc"><span class="ph">[INSERT: ...]</span></span> placeholders, never made up.</p>
          <button type="submit" class="btn-primary !px-6 !py-3" ${left <= 0 ? 'disabled' : ''}>${icon('spark', 'h-5 w-5')}Generate proposal</button>
        </div>
        ${left <= 0 ? `<p class="mt-4 rounded-2xl border border-brand-red/30 bg-brand-red/10 p-4 text-sm text-brand-redSoft">You've used all ${usage.limit} proposals this month.${state.me.tier.key !== 'enterprise' ? ' Enterprise Edition raises your limit to 50 a month.' : ''}</p>` : ''}
      </form>`;
    $('#proposal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const btn = $('button[type=submit]', form);
      const errEl = $('#pf-error');
      errEl.classList.add('hidden');
      const data = Object.fromEntries(new FormData(form));
      data.bidId = data.bidId ? Number(data.bidId) : null;
      data.rfpSummaryId = data.rfpSummaryId ? Number(data.rfpSummaryId) : null;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Starting';
      try {
        const { id } = await api('/proposals', { method: 'POST', body: data });
        await refreshMe().catch(() => {});
        navigate('/proposals/' + id);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = icon('spark', 'h-5 w-5') + 'Generate proposal';
      }
    });
  }

  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  async function viewProposal(view, id) {
    const load = async () => (await api('/proposals/' + id)).proposal;
    let p = await load();
    if (p.status === 'working') {
      view.innerHTML = working('Drafting your proposal', 'Writing every section, mapping each requirement and building your compliance matrix. This usually takes a few minutes.');
      every(5000, async () => {
        try { p = await load(); if (p.status !== 'working') render(); } catch { /* keep polling */ }
      });
      return;
    }
    if (p.status === 'failed') {
      view.innerHTML = emptyState('This draft did not finish', esc(p.error || 'Please try again.') + ' It did not count toward your monthly limit.', '<a href="/app/proposals/new" data-link class="btn-primary">Try again</a>');
      return;
    }
    const slug = (p.title || 'proposal').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'proposal';
    view.innerHTML = `
      <div class="no-print">${pageHead(esc(p.title), 'Review every [INSERT] placeholder before you submit.',
        `<button id="edit" class="btn-ghost">Edit</button><button id="copy" class="btn-ghost">Copy</button>
         <button id="word" class="btn-ghost">Download Word</button><button id="print" class="btn-primary">Print / PDF</button>`)}</div>
      <article class="card print-area p-6 sm:p-10"><div id="doc" class="doc">${markdown(p.contentMd)}</div>
        <div id="editor" class="no-print hidden"><textarea id="md" rows="30" class="field font-mono !text-[13px] leading-relaxed">${esc(p.contentMd)}</textarea>
          <div class="mt-3 flex justify-end gap-2"><button id="cancel-edit" class="btn-ghost">Cancel</button><button id="save" class="btn-primary">Save changes</button></div></div>
      </article>`;
    $('#print').addEventListener('click', () => window.print());
    $('#copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(p.contentMd); toast('Copied to clipboard.'); } catch { toast('Copy failed. Select the text instead.', 'error'); }
    });
    $('#word').addEventListener('click', () => {
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(p.title)}</title>
        <style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45}h1{font-size:20pt;color:#0B1F5C}h2{font-size:14pt;color:#1E3A8A;margin-top:18pt}h3{font-size:12pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4pt;vertical-align:top}th{background:#E8EDFF}.ph{background:#FFE4E8;color:#9B0020}</style></head><body>${markdown(p.contentMd)}</body></html>`;
      download(slug + '.doc', new Blob(['﻿', html], { type: 'application/msword' }));
    });
    const toggle = (editing) => {
      $('#doc').classList.toggle('hidden', editing);
      $('#editor').classList.toggle('hidden', !editing);
    };
    $('#edit').addEventListener('click', () => toggle(true));
    $('#cancel-edit').addEventListener('click', () => { $('#md').value = p.contentMd; toggle(false); });
    $('#save').addEventListener('click', async () => {
      const md = $('#md').value;
      try {
        await api('/proposals/' + p.id, { method: 'PATCH', body: { contentMd: md } });
        p.contentMd = md;
        $('#doc').innerHTML = markdown(md);
        toggle(false);
        toast('Saved.');
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // ------------------------------------------------------------------ profile and feature pages

  function viewProfile(view) {
    const u = state.me.user;
    view.innerHTML = `
      ${pageHead('Business profile', 'Every AI feature uses this to tailor proposals and qualify bids. Keep it sharp.')}
      <form id="profile-form" class="card max-w-3xl p-6 sm:p-8" novalidate>
        <div class="grid gap-5 sm:grid-cols-2">
          <div><label class="label" for="pr-name">Your name</label><input id="pr-name" name="fullName" class="field" maxlength="120" value="${esc(u.fullName)}" /></div>
          <div><label class="label" for="pr-biz">Business name</label><input id="pr-biz" name="businessName" class="field" maxlength="160" value="${esc(u.businessName)}" /></div>
          <div class="sm:col-span-2"><label class="label" for="pr-naics">NAICS codes</label><input id="pr-naics" name="naics" class="field" maxlength="200" placeholder="e.g. 561720, 561730" value="${esc(u.naics)}" /></div>
          <div class="sm:col-span-2"><label class="label" for="pr-cap">Capabilities</label><textarea id="pr-cap" name="capabilities" rows="5" maxlength="600" class="field" placeholder="What you and your subcontractors deliver, where, and what makes you different.">${esc(u.capabilities)}</textarea></div>
        </div>
        <div class="mt-5 flex flex-wrap gap-2 text-xs text-mist-400">
          <span class="pill bg-white/[0.06] text-mist-300">${esc(u.email)}</span>
          ${u.certifications.map((c) => `<span class="pill bg-brand-blue/15 text-brand-blueSoft">${esc(c)}</span>`).join('')}
        </div>
        <div class="mt-6 flex justify-end"><button type="submit" class="btn-primary">Save profile</button></div>
      </form>`;
    $('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/me/profile', { method: 'PATCH', body: Object.fromEntries(new FormData(e.target)) });
        await refreshMe();
        state.shellReady = false;
        toast('Profile saved.');
        render();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  function viewFeature(view, key) {
    const f = state.me.features.find((x) => x.key === key);
    if (!f) { view.innerHTML = emptyState('Page not found', 'That feature does not exist.'); return; }
    if (f.status === 'live' && f.unlocked) { navigate(ROUTE_OF[key]); return; }
    const locked = !f.unlocked;
    view.innerHTML = `
      <div class="card relative mx-auto max-w-2xl overflow-hidden p-10 text-center">
        <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-blue to-brand-red"></div>
        <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${locked ? 'bg-brand-red/15 text-brand-redSoft' : 'bg-brand-blue/20 text-brand-blueSoft'}">${icon(locked ? 'lock' : 'spark', 'h-7 w-7')}</div>
        <span class="pill ${locked ? 'bg-brand-red/15 text-brand-redSoft' : 'bg-brand-blue/15 text-brand-blueSoft'}">${locked ? 'Enterprise Edition' : 'Rolling out next'}</span>
        <h1 class="mt-3 text-2xl font-bold text-white">${esc(f.name)}</h1>
        <p class="mx-auto mt-3 max-w-lg text-mist-300">${esc(ABOUT[key] || '')}</p>
        <p class="mt-6 text-sm text-mist-500">${locked
          ? 'This tool is part of the Enterprise Edition command center. Reach out to the Contract Bros team to upgrade.'
          : 'This tool is included in your plan and is being switched on in an upcoming release. It will appear here automatically.'}</p>
      </div>`;
  }

  render();
})();
