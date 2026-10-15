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
    badge: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    scale: '<path d="M12 3v18M5 21h14"/><path d="M5 7h14"/><path d="m5 7-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
    check: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  };
  const icon = (name, cls = 'h-5 w-5') =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ICON.spark}</svg>`;

  // ------------------------------------------------------------------ markdown (escaped first, then a safe subset)

  function inline(s) {
    return s
      .replace(/\[(INSERT|TBD|CONFIRM)[^\]]*\]/g, (m) => `<span class="ph">${m}</span>`)
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

  const ROUTE_OF = {
    proposal_engine: '/proposals', bid_decryptor: '/decryptor', bid_crm: '/crm', capability_statement: '/capability',
    subcontracting_check: '/subcontracting', sam_checklist: '/sam-checklist', deadline_alerts: '/alerts', sub_vetting: '/vetting',
  };
  const ICON_OF = {
    proposal_engine: 'proposal', bid_decryptor: 'decrypt', bid_crm: 'crm', capability_statement: 'badge',
    subcontracting_check: 'scale', sam_checklist: 'check', deadline_alerts: 'bell', sub_vetting: 'shield',
  };
  const WIN_WORK = ['proposal_engine', 'bid_decryptor', 'bid_crm'];
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
    sub_vetting: 'Checks any subcontractor against SAM.gov registrations and the federal exclusions list before you team with them, so a debarred sub never lands on your contract.',
    state_directory: 'Every state\'s procurement portal in one place: where to register and where state and local bids are posted.',
  };

  // ------------------------------------------------------------------ shell

  function navItems() {
    const f = state.me.features;
    const link = (href, ic, label, extra = '') =>
      `<a href="/app${href === '/' ? '' : href}" data-link data-path="${href}" class="nav-link">${icon(ic)}<span class="flex-1">${esc(label)}</span>${extra}</a>`;
    const live = f.filter((x) => x.status === 'live' && x.unlocked);
    const rest = f.filter((x) => x.status !== 'live' || !x.unlocked);
    const group = (title, items) => (items.length ? `<p class="mt-5 px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-mist-500">${title}</p>
      ${items.map((x) => link(ROUTE_OF[x.key], ICON_OF[x.key], x.name)).join('')}` : '');
    return `
      ${link('/', 'home', 'Command Center')}
      ${group('Win work', live.filter((x) => WIN_WORK.includes(x.key)))}
      ${group('Get bid-ready', live.filter((x) => !WIN_WORK.includes(x.key)))}
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
    let path = routePath();
    if (path === '/login') return renderLogin();
    if (path === '/forgot') return renderForgot();
    if (path === '/reset') return renderReset();
    try {
      if (!state.me) await refreshMe();
    } catch {
      return;
    }
    // New members land on the company setup first, so their first proposal already knows them.
    if (path === '/' && !state.me.user.onboarded && !skippedOnboarding()) {
      history.replaceState(null, '', '/app/welcome');
      path = '/welcome';
    }
    if (!state.shellReady) renderShell();
    markActive(path);
    const view = $('#view');
    view.innerHTML = '<div class="flex justify-center py-20"><span class="spinner"></span></div>';
    window.scrollTo(0, 0);

    let m;
    const gated = Object.keys(ROUTE_OF).find((k) => path === ROUTE_OF[k] || path.startsWith(ROUTE_OF[k] + '/'));
    const feature = gated && state.me.features.find((x) => x.key === gated);
    if (feature && !feature.unlocked) return viewFeature(view, gated);
    try {
      if (path === '/') await viewHome(view);
      else if (path === '/welcome') await viewWelcome(view);
      else if (path === '/capability') await viewCapabilityList(view);
      else if ((m = path.match(/^\/capability\/(\d+)$/))) await viewCapability(view, m[1]);
      else if (path === '/subcontracting') viewSubcontracting(view);
      else if (path === '/sam-checklist') viewSamChecklist(view);
      else if (path === '/alerts') await viewAlerts(view);
      else if (path === '/vetting') await viewVetting(view);
      else if (path === '/crm') await viewCrm(view);
      else if (path === '/decryptor') await viewDecryptor(view);
      else if ((m = path.match(/^\/decryptor\/(\d+)$/))) await viewSummary(view, m[1]);
      else if (path === '/proposals') await viewProposals(view);
      else if (path === '/proposals/new') await viewNewProposal(view);
      else if ((m = path.match(/^\/proposals\/(\d+)$/))) await viewProposal(view, m[1]);
      else if (path === '/profile') await viewProfile(view);
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
              <div><div class="flex items-baseline justify-between"><label class="label" for="password">Password</label><a href="/app/forgot" data-link class="text-xs font-semibold text-brand-blueSoft hover:text-white">Forgot password?</a></div>
                <input id="password" name="password" type="password" autocomplete="current-password" class="field" required /></div>
            </div>
            <p id="login-error" class="mt-4 hidden rounded-2xl border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-redSoft" role="alert"></p>
            <button class="btn-primary mt-6 w-full !py-3.5 !text-base" type="submit">Sign in</button>
            <p class="mt-5 text-center text-sm text-mist-400">No account yet? <a class="font-semibold text-brand-blueSoft hover:text-white" href="/access">Secure your access</a></p>
          </form>
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
    const [{ bids, stages }, { proposals, usage }, { alerts }] = await Promise.all([api('/bids'), api('/proposals'), api('/alerts')]);
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
      ${!me.user.onboarded ? `<div class="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-brand-blueSoft/25 bg-gradient-to-r from-brand-blue/20 to-brand-red/10 p-5">
        <div><p class="font-semibold text-white">Finish setting up your company</p><p class="mt-1 text-sm text-mist-300">Proposals and capability statements use your UEI, capabilities and past performance. Without them the engine leaves placeholders.</p></div>
        <a href="/app/welcome" data-link class="btn-primary">Finish setup</a></div>` : ''}
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
          <div class="mb-2 mt-6 flex items-center justify-between"><h3 class="text-sm font-semibold text-mist-300">Upcoming deadlines</h3><a href="/app/alerts" data-link class="text-xs text-brand-blueSoft hover:text-white">All alerts</a></div>
          ${alerts.length ? `<ul class="divide-y divide-white/[0.06]">${alerts.slice(0, 6).map(alertRow).join('')}</ul>`
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
          ${f('questionsDueAt', 'Questions due', b.questionsDueAt, 'date')}
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
          body.pdfBase64 = await readBase64(file);
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
    docViewer(view, {
      title: p.title,
      sub: 'Review every [INSERT] and [CONFIRM] placeholder before you submit.',
      md: p.contentMd,
      save: (md) => api('/proposals/' + p.id, { method: 'PATCH', body: { contentMd: md } }),
    });
  }

  // ------------------------------------------------------------------ profile and feature pages

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

  // ------------------------------------------------------------------ shared pieces for the new pages

  function readBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('Could not read that file.'));
      r.readAsDataURL(file);
    });
  }

  function skippedOnboarding() {
    try { return sessionStorage.getItem('gpp_setup_later') === '1'; } catch { return false; }
  }

  const ALERT_LABEL = { proposal_due: 'Proposal due', questions_due: 'Questions due', sam_expiring: 'SAM.gov renewal' };
  const daysLabel = (n) => (n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days`);
  const alertRow = (a) => `
    <li class="flex items-center justify-between gap-3 py-2.5">
      <span class="min-w-0"><span class="block truncate text-sm text-mist-100">${esc(a.title)}</span><span class="text-xs text-mist-500">${ALERT_LABEL[a.kind]} · ${fmtDate(a.date)}</span></span>
      <span class="pill shrink-0 ${a.daysLeft <= 3 ? 'bg-brand-red/20 text-brand-redSoft' : 'bg-white/[0.06] text-mist-300'}">${icon(a.kind === 'sam_expiring' ? 'check' : 'cal', 'h-3.5 w-3.5')}${daysLabel(a.daysLeft)}</span>
    </li>`;

  /** Read-only document view with edit, copy, Word and print. Used by proposals and capability statements. */
  function docViewer(view, { title, sub, md, save }) {
    let content = md;
    const slug = (title || 'document').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'document';
    view.innerHTML = `
      <div class="no-print">${pageHead(esc(title), esc(sub),
        `<button id="edit" class="btn-ghost">Edit</button><button id="copy" class="btn-ghost">Copy</button>
         <button id="word" class="btn-ghost">Download Word</button><button id="print" class="btn-primary">Print / PDF</button>`)}</div>
      <article class="card print-area p-6 sm:p-10"><div id="doc" class="doc">${markdown(content)}</div>
        <div id="editor" class="no-print hidden"><textarea id="md" rows="30" class="field font-mono !text-[13px] leading-relaxed">${esc(content)}</textarea>
          <div class="mt-3 flex justify-end gap-2"><button id="cancel-edit" class="btn-ghost">Cancel</button><button id="save" class="btn-primary">Save changes</button></div></div>
      </article>`;
    $('#print').addEventListener('click', () => window.print());
    $('#copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(content); toast('Copied to clipboard.'); } catch { toast('Copy failed. Select the text instead.', 'error'); }
    });
    $('#word').addEventListener('click', () => {
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)}</title>
        <style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45}h1{font-size:20pt;color:#0B1F5C}h2{font-size:14pt;color:#1E3A8A;margin-top:18pt}h3{font-size:12pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4pt;vertical-align:top}th{background:#E8EDFF}.ph{background:#FFE4E8;color:#9B0020}</style></head><body>${markdown(content)}</body></html>`;
      download(slug + '.doc', new Blob(['﻿', html], { type: 'application/msword' }));
    });
    const toggle = (editing) => {
      $('#doc').classList.toggle('hidden', editing);
      $('#editor').classList.toggle('hidden', !editing);
    };
    $('#edit').addEventListener('click', () => toggle(true));
    $('#cancel-edit').addEventListener('click', () => { $('#md').value = content; toggle(false); });
    $('#save').addEventListener('click', async () => {
      const next = $('#md').value;
      try {
        await save(next);
        content = next;
        $('#doc').innerHTML = markdown(content);
        toggle(false);
        toast('Saved.');
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // ------------------------------------------------------------------ forgot and reset password

  const authFrame = (inner) => `
    <main class="flex min-h-screen items-center justify-center px-4 py-12">
      <div class="w-full max-w-md">
        <img src="/assets/gpp-by-contract-bros.png" alt="GovProposalPro by Contract Bros" width="1200" height="386" class="mx-auto mb-8 h-auto w-72" />
        ${inner}
      </div>
    </main>`;
  const errBox = (id) => `<p id="${id}" class="mt-4 hidden rounded-2xl border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-redSoft" role="alert"></p>`;
  const okBox = (id) => `<p id="${id}" class="mt-4 hidden rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200" role="status"></p>`;
  function showMsg(id, msg) {
    const el = $('#' + id);
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function renderForgot() {
    state.shellReady = false;
    $('#root').innerHTML = authFrame(`
      <form id="forgot" class="card p-7 sm:p-9" novalidate>
        <h1 class="text-xl font-bold text-white">Reset your password</h1>
        <p class="mt-1 text-sm text-mist-400">Enter the email you use for GovProposalPro and we'll send you a link to choose a new password.</p>
        <div class="mt-6"><label class="label" for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" class="field" required /></div>
        ${errBox('forgot-error')}${okBox('forgot-ok')}
        <button class="btn-primary mt-6 w-full !py-3.5 !text-base" type="submit">Email me a reset link</button>
        <p class="mt-5 text-center text-sm text-mist-400"><a class="font-semibold text-brand-blueSoft hover:text-white" href="/app/login" data-link>Back to sign in</a></p>
      </form>`);
    const form = $('#forgot');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      $('#forgot-error').classList.add('hidden');
      btn.disabled = true;
      try {
        const r = await api('/auth/forgot', { method: 'POST', body: { email: form.email.value } });
        showMsg('forgot-ok', r.message);
      } catch (err) {
        showMsg('forgot-error', err.message);
      }
      btn.disabled = false;
    });
  }

  async function renderReset() {
    state.shellReady = false;
    state.me = null;
    const token = location.hash.slice(1);
    $('#root').innerHTML = authFrame('<div class="card flex justify-center p-10"><span class="spinner"></span></div>');
    let info;
    try {
      info = await api('/auth/reset/check', { method: 'POST', body: { token } });
    } catch (err) {
      $('#root').innerHTML = authFrame(`
        <div class="card p-7 text-center sm:p-9">
          <h1 class="text-xl font-bold text-white">This link no longer works</h1>
          <p class="mt-2 text-sm text-mist-400">${esc(err.message)}</p>
          <a href="/app/forgot" data-link class="btn-primary mt-6 w-full">Send me a new link</a>
        </div>`);
      return;
    }
    $('#root').innerHTML = authFrame(`
      <form id="reset" class="card p-7 sm:p-9" novalidate>
        <h1 class="text-xl font-bold text-white">${info.invite ? 'Create your password' : 'Choose a new password'}</h1>
        <p class="mt-1 text-sm text-mist-400">${info.invite ? 'Welcome to GovProposalPro. Set the password' : 'Set a new password'} for <span class="text-mist-100">${esc(info.email)}</span>.</p>
        <input type="email" name="username" autocomplete="username" value="${esc(info.email)}" class="sr-only" tabindex="-1" readonly />
        <div class="mt-6 space-y-4">
          <div><label class="label" for="pw">New password</label><input id="pw" name="password" type="password" autocomplete="new-password" class="field" required /></div>
          <div><label class="label" for="pw2">Confirm password</label><input id="pw2" name="confirmPassword" type="password" autocomplete="new-password" class="field" required /></div>
          <p class="text-xs text-mist-500">At least 12 characters, with an uppercase letter, a lowercase letter and a number.</p>
        </div>
        ${errBox('reset-error')}
        <button class="btn-primary mt-6 w-full !py-3.5 !text-base" type="submit">${info.invite ? 'Create password' : 'Save new password'}</button>
      </form>`);
    const form = $('#reset');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      $('#reset-error').classList.add('hidden');
      btn.disabled = true;
      try {
        await api('/auth/reset', { method: 'POST', body: { token, password: form.password.value, confirmPassword: form.confirmPassword.value } });
        history.replaceState(null, '', '/app/reset');
        $('#root').innerHTML = authFrame(`
          <div class="card p-7 text-center sm:p-9">
            <h1 class="text-xl font-bold text-white">Password saved</h1>
            <p class="mt-2 text-sm text-mist-400">Sign in with ${esc(info.email)} and your new password.</p>
            <a href="/app/login" data-link class="btn-primary mt-6 w-full">Sign in</a>
          </div>`);
      } catch (err) {
        showMsg('reset-error', err.message);
        btn.disabled = false;
      }
    });
  }

  // ------------------------------------------------------------------ business profile (onboarding and profile page)

  const CERTS = { '8a': '8(a)', wosb: 'WOSB', sdvosb: 'SDVOSB', vosb: 'VOSB', hubzone: 'HUBZone', sdb: 'SDB' };
  const SAM_STATUS = { active: 'Active', in_progress: 'In progress', not_started: 'Not started' };
  const EMPLOYEES = { 1: 'Just me', '2-10': '2 to 10', '11-50': '11 to 50', '51-200': '51 to 200', '201+': 'More than 200' };
  const DOC_KIND = { capability_statement: 'Capability statement', past_performance: 'Past performance', resume: 'Resume', company_overview: 'Company overview', other: 'Other' };

  function fld(name, label, value, o = {}) {
    const id = 'f-' + name;
    const attrs = `id="${id}" name="${name}" class="field" ${o.attrs || ''}`;
    const input = o.rows ? `<textarea ${attrs} rows="${o.rows}">${esc(value ?? '')}</textarea>`
      : o.options ? `<select ${attrs}><option value="">Choose</option>${Object.entries(o.options).map(([v, l]) =>
        `<option value="${esc(v)}" ${String(value ?? '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
        : `<input ${attrs} type="${o.type || 'text'}" value="${esc(value ?? '')}" />`;
    return `<div class="${o.wide ? 'sm:col-span-2' : ''}"><label class="label" for="${id}">${label}</label>${input}${o.help ? `<p class="mt-1.5 text-xs text-mist-500">${o.help}</p>` : ''}</div>`;
  }

  const SECTION = {
    company: (u) => `
      ${fld('businessName', 'Legal business name', u.businessName, { attrs: 'maxlength="160"' })}
      ${fld('fullName', 'Your name', u.fullName, { attrs: 'maxlength="120"' })}
      ${fld('uei', 'UEI (from SAM.gov)', u.uei, { attrs: 'maxlength="12" placeholder="12 letters and numbers"' })}
      ${fld('cageCode', 'CAGE code', u.cageCode, { attrs: 'maxlength="5" placeholder="5 characters"' })}
      ${fld('samStatus', 'SAM.gov registration', u.samStatus, { options: SAM_STATUS })}
      ${fld('samExpiresOn', 'SAM.gov expiration date', u.samExpiresOn, { type: 'date', help: 'We email you 60, 30 and 7 days before it lapses.' })}
      ${fld('website', 'Website', u.website, { attrs: 'maxlength="200" placeholder="https://"' })}
      ${fld('phone', 'Phone', u.phone, { type: 'tel', attrs: 'maxlength="30"' })}
      ${fld('address', 'Business address', u.address, { wide: true, attrs: 'maxlength="300"' })}
      ${fld('yearFounded', 'Year founded', u.yearFounded, { type: 'number', attrs: 'min="1800" max="2100"' })}
      ${fld('employees', 'Employees', u.employees, { options: EMPLOYEES })}`,
    work: (u) => `
      ${fld('naics', 'NAICS codes', u.naics, { wide: true, attrs: 'maxlength="200" placeholder="e.g. 561720, 561730"' })}
      ${fld('capabilities', 'Core capabilities', u.capabilities, { wide: true, rows: 5, attrs: 'maxlength="4000" placeholder="What you and your subcontractors deliver, for whom, and at what scale."', help: 'The proposal engine leans on this more than anything else.' })}
      ${fld('differentiators', 'What makes you different', u.differentiators, { wide: true, rows: 3, attrs: 'maxlength="2000" placeholder="Response times, certifications, equipment, local presence, safety record..."' })}
      ${fld('serviceArea', 'Where you work', u.serviceArea, { wide: true, attrs: 'maxlength="300" placeholder="e.g. Texas and Oklahoma, or nationwide"' })}
      <fieldset class="sm:col-span-2"><legend class="label">Certifications</legend><div class="flex flex-wrap gap-2">
        ${Object.entries(CERTS).map(([v, l]) => `<label class="chip"><input type="checkbox" name="certifications" value="${v}" class="accent-brand-blue" ${u.certifications.includes(v) ? 'checked' : ''} />${l}</label>`).join('')}
      </div></fieldset>`,
    team: (u) => `
      ${fld('keyPersonnel', 'Key personnel', u.keyPersonnel, { wide: true, rows: 4, attrs: 'maxlength="4000"', help: 'Name, role and relevant experience for each person you would put on a contract.' })}
      <div class="sm:col-span-2"><p class="label">Past performance</p><div class="pp-list space-y-3"></div>
        <button type="button" class="pp-add btn-ghost mt-3">${icon('plus', 'h-4 w-4')}Add a project</button>
        <p class="mt-1.5 text-xs text-mist-500">Federal, state, subcontract and commercial work all count. Up to 25 projects.</p></div>`,
  };

  /** Repeating past performance rows. */
  function ppEditor(root, items) {
    const list = $('.pp-list', root);
    const row = (p) => `
      <div class="pp rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4"><div class="grid gap-3 sm:grid-cols-2">
        <input class="field" data-k="title" maxlength="200" placeholder="Project or contract name" value="${esc(p.title)}" />
        <input class="field" data-k="customer" maxlength="200" placeholder="Customer (agency or company)" value="${esc(p.customer)}" />
        <input class="field" data-k="value" maxlength="60" placeholder="Value, e.g. $250,000" value="${esc(p.value)}" />
        <input class="field" data-k="period" maxlength="80" placeholder="Period, e.g. 2023 to 2025" value="${esc(p.period)}" />
        <select class="field" data-k="role">${[['prime', 'Prime contractor'], ['sub', 'Subcontractor'], ['commercial', 'Commercial client']].map(([v, l]) =>
          `<option value="${v}" ${p.role === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <div class="flex justify-end"><button type="button" class="pp-del btn-ghost">Remove</button></div>
        <textarea class="field sm:col-span-2" data-k="description" rows="3" maxlength="2000" placeholder="What you delivered and the results">${esc(p.description)}</textarea>
      </div></div>`;
    const get = () => $$('.pp', list)
      .map((el) => Object.fromEntries($$('[data-k]', el).map((i) => [i.dataset.k, i.value.trim()])))
      .filter((p) => p.title || p.description);
    const add = (p = {}) => {
      if ($$('.pp', list).length >= 25) { toast('You can add up to 25 projects.', 'error'); return; }
      list.insertAdjacentHTML('beforeend', row(p));
    };
    (items || []).forEach(add);
    $('.pp-add', root).addEventListener('click', () => add());
    list.addEventListener('click', (e) => { const b = e.target.closest('.pp-del'); if (b) b.closest('.pp').remove(); });
    return { get, add };
  }

  function readProfileForm(form, pp) {
    const data = {};
    $$('input[name], select[name], textarea[name]', form).forEach((el) => {
      if (el.name !== 'certifications') data[el.name] = el.value;
    });
    if ($('input[name=certifications]', form)) data.certifications = $$('input[name=certifications]:checked', form).map((c) => c.value);
    if (pp) data.pastPerformance = pp.get();
    return data;
  }

  /** Fills empty profile fields from what the AI read in a document. Never overwrites what the member typed. */
  function fillFromDocument(form, pp, x) {
    if (!x) return 0;
    let n = 0;
    const ok = { uei: /^[A-Z0-9]{12}$/i, cageCode: /^[A-Z0-9]{5}$/i };
    for (const k of ['businessName', 'uei', 'cageCode', 'naics', 'website', 'address', 'capabilities', 'differentiators', 'keyPersonnel']) {
      const el = form.elements[k];
      const v = (x[k] || '').trim();
      if (el && v && !el.value.trim() && (!ok[k] || ok[k].test(v))) { el.value = v; n++; }
    }
    if (pp && Array.isArray(x.pastPerformance)) {
      const have = new Set(pp.get().map((p) => p.title.toLowerCase()));
      x.pastPerformance.forEach((p) => {
        if (p.title && !have.has(p.title.toLowerCase())) { pp.add(p); have.add(p.title.toLowerCase()); n++; }
      });
    }
    return n;
  }

  /** Upload list for company documents. Calls onReady(doc) when a document finishes reading. */
  async function documentsPanel(box, onReady) {
    let docs = (await api('/me/documents')).documents;
    let file = null;
    const draw = () => {
      box.innerHTML = `
        <div class="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label class="field flex min-w-0 cursor-pointer items-center gap-2 !py-2.5" for="doc-file">${icon('upload', 'h-4 w-4 shrink-0')}<span id="doc-name" class="truncate text-mist-400">${file ? esc(file.name) : 'Choose a PDF'}</span>
            <input id="doc-file" type="file" accept="application/pdf,.pdf" class="sr-only" /></label>
          <select id="doc-kind" class="field !py-2.5" aria-label="Document type">${Object.entries(DOC_KIND).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
          <button type="button" id="doc-up" class="btn-primary">Upload</button>
        </div>
        <ul class="mt-4 space-y-2">${docs.map((d) => `
          <li class="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div class="flex items-center justify-between gap-3">
              <span class="min-w-0"><span class="block truncate text-sm font-medium text-white">${esc(d.fileName)}</span><span class="text-xs text-mist-500">${esc(DOC_KIND[d.kind] || 'Document')} · ${fmtDate(d.createdAt)}</span></span>
              <span class="flex shrink-0 items-center gap-2">${statusPill(d.status)}<button type="button" class="btn-ghost !px-2.5 !py-1 !text-xs" data-del="${d.id}">Remove</button></span>
            </div>
            ${d.status === 'failed' ? `<p class="mt-2 text-xs text-brand-redSoft">${esc(d.error)}</p>` : ''}
          </li>`).join('') || '<li class="text-sm text-mist-500">No documents yet.</li>'}</ul>`;
      $('#doc-file', box).addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { toast('Please choose a PDF file.', 'error'); return; }
        if (f.size > 20 * 1024 * 1024) { toast('PDFs up to 20 MB are supported.', 'error'); return; }
        file = f;
        $('#doc-name', box).textContent = f.name;
      });
      $('#doc-up', box).addEventListener('click', upload);
      $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Remove this document? The AI will stop using it.')) return;
        try {
          await api('/me/documents/' + b.dataset.del, { method: 'DELETE' });
          docs = docs.filter((d) => String(d.id) !== b.dataset.del);
          draw();
        } catch (err) { toast(err.message, 'error'); }
      }));
    };
    async function upload() {
      if (!file) { toast('Choose a PDF first.', 'error'); return; }
      const btn = $('#doc-up', box);
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';
      try {
        const kind = $('#doc-kind', box).value;
        const { id } = await api('/me/documents', { method: 'POST', body: { pdfBase64: await readBase64(file), fileName: file.name, kind } });
        docs.unshift({ id, fileName: file.name, kind, status: 'working', createdAt: new Date().toISOString() });
        file = null;
        draw();
        poll();
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Upload';
      }
    }
    let polling = false;
    function poll() {
      if (polling) return;
      polling = true;
      every(4000, async () => {
        if (!docs.some((d) => d.status === 'working')) return;
        try {
          const fresh = (await api('/me/documents')).documents;
          const before = new Map(docs.map((d) => [d.id, d.status]));
          docs = fresh;
          draw();
          fresh.filter((d) => d.status === 'ready' && before.get(d.id) === 'working').forEach((d) => onReady && onReady(d));
        } catch { /* keep polling */ }
      });
    }
    draw();
    if (docs.some((d) => d.status === 'working')) poll();
  }

  async function viewWelcome(view) {
    const u = state.me.user;
    const steps = [
      ['Upload what you have', 'Capability statement, past performance write-ups, resumes, a company overview. We read them and fill in your profile for you. No documents yet? Skip this step.', null],
      ['Company basics', 'The facts every proposal, form and capability statement asks for.', 'company'],
      ['What you do', 'Proposals are written around this, so be specific.', 'work'],
      ['Team and track record', 'Evaluators score experience. Add every relevant project, including commercial and subcontract work.', 'team'],
    ];
    view.innerHTML = `
      <div class="mx-auto max-w-3xl">
        <p class="text-xs font-semibold uppercase tracking-widest text-brand-blueSoft">Set up your company</p>
        <h1 class="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Teach the engine about your business</h1>
        <p class="mt-2 text-mist-400">Every proposal, capability statement and bid check uses what you add here. It takes about five minutes and you can change it anytime from your profile.</p>
        <ol class="mt-6 grid grid-cols-4 gap-2">${steps.map((st, i) => `<li class="step" data-i="${i}"><span class="step-bar"></span><span class="mt-2 hidden text-xs text-mist-400 sm:block">${i + 1}. ${st[0]}</span></li>`).join('')}</ol>
        <form id="ob" class="card mt-6 p-6 sm:p-8" novalidate>
          ${steps.map((st, i) => `
            <section class="ob-step ${i ? 'hidden' : ''}" data-i="${i}">
              <h2 class="text-lg font-semibold text-white">${st[0]}</h2>
              <p class="mt-1 text-sm text-mist-400">${st[1]}</p>
              ${st[2] ? `<div class="mt-6 grid gap-5 sm:grid-cols-2">${SECTION[st[2]](u)}</div>`
                : `<div id="docs" class="mt-6"></div>${okBox('autofill')}`}
            </section>`).join('')}
          ${errBox('ob-error')}
          <div class="mt-8 flex flex-wrap items-center justify-between gap-3">
            <button type="button" id="ob-back" class="btn-ghost">Back</button>
            <div class="flex gap-2"><button type="button" id="ob-later" class="btn-ghost">Finish later</button><button type="submit" id="ob-next" class="btn-primary">Continue</button></div>
          </div>
        </form>
      </div>`;
    const form = $('#ob');
    const pp = ppEditor(form, u.pastPerformance);
    let i = 0;
    const show = () => {
      $$('.ob-step', form).forEach((el) => el.classList.toggle('hidden', Number(el.dataset.i) !== i));
      $$('.step').forEach((el) => el.classList.toggle('done', Number(el.dataset.i) <= i));
      $('#ob-back').classList.toggle('invisible', i === 0);
      $('#ob-next').textContent = i === 0 ? 'Continue' : i === steps.length - 1 ? 'Finish setup' : 'Save and continue';
      $('#ob-error').classList.add('hidden');
      window.scrollTo(0, 0);
    };
    const save = async () => { if (i > 0) await api('/me/profile', { method: 'PATCH', body: readProfileForm(form, pp) }); };
    await documentsPanel($('#docs'), (d) => {
      const n = fillFromDocument(form, pp, d.extracted);
      showMsg('autofill', n ? `Read ${d.fileName} and filled in ${n} field${n === 1 ? '' : 's'}. Check them on the next steps.` : `Read ${d.fileName}. The proposal engine will use it.`);
    });
    show();
    $('#ob-back').addEventListener('click', () => { i = Math.max(0, i - 1); show(); });
    $('#ob-later').addEventListener('click', async () => {
      try { await save(); } catch { /* keep what saved */ }
      try { sessionStorage.setItem('gpp_setup_later', '1'); } catch { /* private mode */ }
      await refreshMe().catch(() => {});
      navigate('/');
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#ob-next');
      btn.disabled = true;
      try {
        await save();
        if (i < steps.length - 1) {
          i++;
          show();
        } else {
          await api('/me/onboarding/complete', { method: 'POST' });
          await refreshMe();
          state.shellReady = false;
          toast('Your company profile is set. Every proposal will use it.');
          navigate('/');
        }
      } catch (err) {
        showMsg('ob-error', err.message);
      }
      btn.disabled = false;
    });
  }

  async function viewProfile(view) {
    const u = state.me.user;
    view.innerHTML = `
      ${pageHead('Business profile', 'Every AI feature writes from this. Keep it current.')}
      <div class="grid items-start gap-6 xl:grid-cols-3">
        <form id="profile-form" class="card p-6 sm:p-8 xl:col-span-2" novalidate>
          <h2 class="font-semibold text-white">Company</h2><div class="mt-4 grid gap-5 sm:grid-cols-2">${SECTION.company(u)}</div>
          <h2 class="mt-10 font-semibold text-white">What you do</h2><div class="mt-4 grid gap-5 sm:grid-cols-2">${SECTION.work(u)}</div>
          <h2 class="mt-10 font-semibold text-white">Team and track record</h2><div class="mt-4 grid gap-5 sm:grid-cols-2">${SECTION.team(u)}</div>
          <div class="sticky bottom-4 mt-8 flex justify-end"><button type="submit" class="btn-primary">Save profile</button></div>
        </form>
        <div class="space-y-6">
          <section class="card p-6">
            <h2 class="font-semibold text-white">Company documents</h2>
            <p class="mt-1 text-sm text-mist-400">The proposal engine and capability statement generator read these for facts about your work.</p>
            <div id="docs" class="mt-4"></div>
          </section>
          <section class="card p-6">
            <h2 class="font-semibold text-white">Email reminders</h2>
            <label class="mt-3 flex items-start gap-3 text-sm text-mist-100"><input id="alerts-toggle" type="checkbox" class="mt-1 accent-brand-blue" ${u.emailAlerts ? 'checked' : ''} />
              <span>Email me 7, 3 and 1 days before a bid or questions deadline, and before my SAM.gov registration expires.</span></label>
          </section>
          <form id="pw-form" class="card p-6" novalidate>
            <h2 class="font-semibold text-white">Password</h2>
            <input type="email" name="username" autocomplete="username" value="${esc(u.email)}" class="sr-only" tabindex="-1" readonly />
            <div class="mt-4 space-y-3">
              <div><label class="label" for="pw-cur">Current password</label><input id="pw-cur" name="currentPassword" type="password" autocomplete="current-password" class="field" /></div>
              <div><label class="label" for="pw-new">New password</label><input id="pw-new" name="password" type="password" autocomplete="new-password" class="field" /></div>
              <div><label class="label" for="pw-new2">Confirm new password</label><input id="pw-new2" name="confirmPassword" type="password" autocomplete="new-password" class="field" /></div>
            </div>
            <p class="mt-3 text-xs text-mist-500">At least 12 characters. Changing it signs you out everywhere else.</p>
            <button type="submit" class="btn-ghost mt-4 w-full">Change password</button>
          </form>
          <p class="px-2 text-xs text-mist-500">Signed in as ${esc(u.email)}</p>
        </div>
      </div>`;
    const form = $('#profile-form');
    const pp = ppEditor(form, u.pastPerformance);
    await documentsPanel($('#docs'), (d) => {
      const n = fillFromDocument(form, pp, d.extracted);
      toast(n ? `Filled in ${n} empty field${n === 1 ? '' : 's'} from ${d.fileName}. Review them, then save.` : `Read ${d.fileName}.`);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/me/profile', { method: 'PATCH', body: readProfileForm(form, pp) });
        await refreshMe();
        state.shellReady = false;
        toast('Profile saved.');
        render();
      } catch (err) { toast(err.message, 'error'); }
    });
    $('#alerts-toggle').addEventListener('change', async (e) => {
      try {
        await api('/me/settings', { method: 'PATCH', body: { emailAlerts: e.target.checked } });
        state.me.user.emailAlerts = e.target.checked;
        toast(e.target.checked ? 'Email reminders on.' : 'Email reminders off.');
      } catch (err) { e.target.checked = !e.target.checked; toast(err.message, 'error'); }
    });
    $('#pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api('/me/password', { method: 'POST', body: { currentPassword: f.currentPassword.value, password: f.password.value, confirmPassword: f.confirmPassword.value } });
        f.reset();
        toast('Password changed. Other devices were signed out.');
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  const profileGaps = () => {
    const u = state.me.user;
    return [['businessName', 'business name'], ['capabilities', 'capabilities'], ['uei', 'UEI'], ['naics', 'NAICS codes']]
      .filter(([k]) => !u[k]).map(([, l]) => l)
      .concat(u.pastPerformance.length ? [] : ['past performance']);
  };

  // ------------------------------------------------------------------ Capability Statement Generator

  async function viewCapabilityList(view) {
    const { statements } = await api('/capability-statements');
    const gaps = profileGaps();
    view.innerHTML = `
      ${pageHead('Capability Statement Generator', 'A one-page capability statement written from your profile and documents.',
        `<button id="gen" class="btn-primary">${icon('spark', 'h-4 w-4')}Generate statement</button>`)}
      ${gaps.length ? `<div class="mb-6 rounded-3xl border border-brand-red/25 bg-brand-red/10 p-5 text-sm text-mist-100">Your profile is missing ${esc(gaps.join(', '))}. The statement will leave placeholders for them. <a href="/app/profile" data-link class="font-semibold text-brand-blueSoft hover:text-white">Complete your profile</a></div>` : ''}
      ${statements.length ? `<ul class="grid gap-2">${statements.map((c) => `<li><a href="/app/capability/${c.id}" data-link class="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 transition hover:border-brand-blueSoft/30">
          <span class="min-w-0"><span class="block truncate text-sm font-medium text-white">Capability statement</span><span class="text-xs text-mist-500">${fmtDate(c.createdAt)}</span></span>${statusPill(c.status)}</a></li>`).join('')}</ul>`
        : emptyState('No capability statements yet', 'Contracting officers and primes ask for one before they ask for anything else. Generate yours in about a minute.')}`;
    $('#gen').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const { id } = await api('/capability-statements', { method: 'POST' });
        navigate('/capability/' + id);
      } catch (err) { toast(err.message, 'error'); e.target.disabled = false; }
    });
    if (statements.some((c) => c.status === 'working')) every(6000, () => render());
  }

  async function viewCapability(view, id) {
    const load = async () => (await api('/capability-statements/' + id)).statement;
    const c = await load();
    if (c.status === 'working') {
      view.innerHTML = working('Writing your capability statement', 'Pulling your strongest facts into one page.');
      every(4000, async () => {
        try { if ((await load()).status !== 'working') render(); } catch { /* keep polling */ }
      });
      return;
    }
    if (c.status === 'failed') {
      view.innerHTML = emptyState('This one did not finish', esc(c.error || 'Please try again.'), '<a href="/app/capability" data-link class="btn-primary">Try again</a>');
      return;
    }
    docViewer(view, {
      title: (state.me.user.businessName || 'Capability') + ' Capability Statement',
      sub: 'Check every [INSERT] and [CONFIRM] placeholder, then export to Word or PDF.',
      md: c.contentMd,
      save: (md) => api('/capability-statements/' + id, { method: 'PATCH', body: { contentMd: md } }),
    });
  }

  // ------------------------------------------------------------------ Limits on Subcontracting (FAR 52.219-14)

  const SUB_RULES = {
    services: { label: 'Services (except construction)', cap: 50, materials: false },
    supplies: { label: 'Supplies or products (not as a nonmanufacturer)', cap: 50, materials: true },
    general_construction: { label: 'General construction', cap: 85, materials: true },
    special_trade: { label: 'Special trade construction', cap: 75, materials: true },
  };

  function viewSubcontracting(view) {
    view.innerHTML = `
      ${pageHead('Subcontracting Limits Checker', 'Check a deal against FAR 52.219-14 before you bid, so a set-aside award never turns into a compliance problem.')}
      <div class="grid items-start gap-6 lg:grid-cols-5">
        <form id="sub-form" class="card p-6 sm:p-8 lg:col-span-3" novalidate>
          <div class="grid gap-5 sm:grid-cols-2">
            <div class="sm:col-span-2"><label class="label" for="s-type">Type of contract</label>
              <select id="s-type" name="type" class="field">${Object.entries(SUB_RULES).map(([k, r]) => `<option value="${k}">${esc(r.label)}</option>`).join('')}</select></div>
            <div><label class="label" for="s-total">Total the government pays you ($)</label><input id="s-total" name="total" type="number" min="0" step="1" class="field" placeholder="e.g. 500000" /></div>
            <div id="s-mat-wrap"><label class="label" for="s-mat">Cost of materials ($)</label><input id="s-mat" name="materials" type="number" min="0" step="1" class="field" placeholder="0" />
              <p class="mt-1.5 text-xs text-mist-500">Excluded from the calculation for supplies and construction.</p></div>
            <div><label class="label" for="s-other">Paid to subs that are NOT similarly situated ($)</label><input id="s-other" name="other" type="number" min="0" step="1" class="field" placeholder="e.g. 200000" />
              <p class="mt-1.5 text-xs text-mist-500">Large businesses, or small businesses without your set-aside status.</p></div>
            <div><label class="label" for="s-similar">Paid to similarly situated subs ($)</label><input id="s-similar" name="similar" type="number" min="0" step="1" class="field" placeholder="0" />
              <p class="mt-1.5 text-xs text-mist-500">Same set-aside status. Counts as your own work, unless they subcontract it again.</p></div>
          </div>
          <p class="mt-6 text-xs text-mist-500">A planning tool, not legal advice. The clause applies to small business set-asides and sole-source awards; always check the percentages and clause date in your solicitation.</p>
        </form>
        <section id="sub-result" class="card p-6 lg:col-span-2"></section>
      </div>`;
    const form = $('#sub-form');
    const num = (n) => { const v = Number(form.elements[n].value); return Number.isFinite(v) && v > 0 ? v : 0; };
    const calc = () => {
      const rule = SUB_RULES[form.type.value];
      $('#s-mat-wrap').classList.toggle('hidden', !rule.materials);
      const total = num('total');
      const materials = rule.materials ? num('materials') : 0;
      const other = num('other');
      const similar = num('similar');
      const base = total - materials;
      const out = $('#sub-result');
      if (!total) {
        out.innerHTML = `<h2 class="font-semibold text-white">Your limit</h2><p class="mt-2 text-sm text-mist-400">You may pay non-similarly-situated subcontractors no more than <strong class="text-white">${rule.cap}%</strong> of what the government pays you${rule.materials ? ', after taking out the cost of materials' : ''}. Enter your numbers to check a deal.</p>`;
        return;
      }
      if (base <= 0 || other + similar > base) {
        out.innerHTML = '<h2 class="font-semibold text-white">Check the numbers</h2><p class="mt-2 text-sm text-brand-redSoft">Subcontract amounts and materials add up to more than the contract. Adjust them to see your result.</p>';
        return;
      }
      const limit = (base * rule.cap) / 100;
      const pct = (other / base) * 100;
      const okay = other <= limit;
      const own = base - other - similar;
      out.innerHTML = `
        <span class="pill ${okay ? 'bg-emerald-500/15 text-emerald-300' : 'bg-brand-red/20 text-brand-redSoft'}">${okay ? 'Within the limit' : 'Over the limit'}</span>
        <p class="mt-3 text-4xl font-bold text-white">${pct.toFixed(1)}%<span class="text-base font-medium text-mist-400"> of ${rule.cap}% allowed</span></p>
        <div class="meter mt-4"><span id="sub-meter"></span></div>
        <dl class="mt-6 space-y-3 text-sm">
          <div class="flex justify-between gap-3"><dt class="text-mist-400">Amount the limit is based on</dt><dd class="text-white">${fmtMoney(base)}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-mist-400">Most you can pay non-similarly-situated subs</dt><dd class="text-white">${fmtMoney(limit)}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-mist-400">Planned for them</dt><dd class="text-white">${fmtMoney(other)}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-mist-400">Kept by you and similarly situated subs</dt><dd class="text-white">${fmtMoney(own + similar)}</dd></div>
        </dl>
        <p class="mt-6 rounded-2xl border ${okay ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100' : 'border-brand-red/30 bg-brand-red/10 text-brand-redSoft'} p-4 text-sm">${okay
          ? `You have ${fmtMoney(limit - other)} of room left before you hit the limit.`
          : `You are ${fmtMoney(other - limit)} over. Move that much work in-house or to a similarly situated small business before you bid.`}</p>`;
      const m = $('#sub-meter');
      m.style.width = Math.min(100, (pct / rule.cap) * 100) + '%';
      if (!okay) { m.style.backgroundImage = 'none'; m.style.backgroundColor = '#FF1F3D'; }
    };
    form.addEventListener('input', calc);
    calc();
  }

  // ------------------------------------------------------------------ SAM.gov Registration Checklist

  const SAM_STEPS = [
    ['login_gov', 'Create a Login.gov account', 'SAM.gov signs you in through Login.gov with two-step verification. Use an email you will keep.', 'https://login.gov'],
    ['uei', 'Get your Unique Entity ID (UEI)', 'Request a UEI in SAM.gov under "Get Started". It is free. Registering in SAM.gov never costs anything, so ignore anyone who charges for it.', 'https://sam.gov'],
    ['docs', 'Gather your documents', 'Legal business name and EIN exactly as the IRS has them, physical address, bank routing and account numbers for payment, and your NAICS codes.', null],
    ['entity_core', 'Complete Core Data', 'Business information, taxpayer details, banking for electronic payment, and business types such as veteran-owned or woman-owned.', null],
    ['assertions', 'Complete Assertions', 'List every NAICS code you want to bid on, plus your revenue and employee counts. These set your size status.', null],
    ['reps_certs', 'Complete Reps and Certs', 'Answer the FAR and DFARS representations and certifications carefully. They are legally binding and contracting officers rely on them.', null],
    ['pocs', 'Add points of contact', 'At minimum an Electronic Business POC and a Government Business POC. Use people who will answer the phone.', null],
    ['submit', 'Submit the registration', 'SAM.gov then validates your tax information with the IRS and your entity details. Allow up to ten business days and watch your email for requests.', null],
    ['cage', 'Receive your CAGE code', 'The Defense Logistics Agency assigns a CAGE code once validation passes. Add it to your profile.', null],
    ['active', 'Confirm you are Active', 'Search your UEI in SAM.gov and confirm the status says Active. Note the expiration date and add it to your profile for reminders.', 'https://sam.gov/search/'],
    ['dsbs', 'Fill out your SBA small business profile', 'Your SAM.gov data feeds the SBA Small Business Search. Add a strong capabilities narrative, keywords and past performance; contracting officers search it.', 'https://search.certifications.sba.gov'],
    ['certs_sba', 'Apply for SBA certifications that fit', '8(a), HUBZone and WOSB/EDWOSB through MySBA Certifications; SDVOSB and VOSB through VetCert. These unlock set-aside contracts.', 'https://certifications.sba.gov'],
    ['renewal', 'Renew every year', 'Registrations expire after 365 days. Renew at least 30 to 60 days early so payments and awards never stall.', null],
  ];

  function viewSamChecklist(view) {
    const done = state.me.user.samChecklist || {};
    const draw = () => {
      const n = SAM_STEPS.filter(([k]) => done[k]).length;
      view.innerHTML = `
        ${pageHead('SAM.gov Registration Checklist', 'Every step to get registered, found and certified, in order.')}
        <div class="card mb-6 p-5"><div class="flex items-center justify-between text-sm"><span class="text-mist-300">${n} of ${SAM_STEPS.length} steps done</span>
          <a href="https://sam.gov" target="_blank" rel="noopener noreferrer" class="font-semibold text-brand-blueSoft hover:text-white">Open SAM.gov</a></div>
          <div class="meter mt-3"><span id="sam-meter"></span></div></div>
        <ol class="space-y-3">${SAM_STEPS.map(([k, title, body, link], i) => `
          <li class="card flex gap-4 p-5 ${done[k] ? 'opacity-70' : ''}">
            <label class="mt-0.5 shrink-0"><input type="checkbox" data-step="${k}" class="h-5 w-5 accent-brand-blue" ${done[k] ? 'checked' : ''} aria-label="Mark step ${i + 1} done" /></label>
            <div class="min-w-0">
              <p class="font-semibold text-white">${i + 1}. ${esc(title)}${done[k] ? ` <span class="pill ml-1 bg-emerald-500/15 text-emerald-300">Done ${fmtDate(done[k])}</span>` : ''}</p>
              <p class="mt-1 text-sm text-mist-400">${esc(body)}</p>
              ${link ? `<a href="${link}" target="_blank" rel="noopener noreferrer" class="mt-2 inline-block text-sm font-semibold text-brand-blueSoft hover:text-white">${esc(link.replace(/^https:\/\//, '').replace(/\/$/, ''))}</a>` : ''}
            </div>
          </li>`).join('')}</ol>`;
      $('#sam-meter').style.width = Math.round((n / SAM_STEPS.length) * 100) + '%';
      $$('[data-step]', view).forEach((cb) => cb.addEventListener('change', async () => {
        const k = cb.dataset.step;
        try {
          await api('/me/sam-checklist', { method: 'PATCH', body: { step: k, done: cb.checked } });
          if (cb.checked) done[k] = new Date().toISOString().slice(0, 10); else delete done[k];
          state.me.user.samChecklist = done;
          draw();
        } catch (err) { cb.checked = !cb.checked; toast(err.message, 'error'); }
      }));
    };
    draw();
  }

  // ------------------------------------------------------------------ Deadline Alerts

  async function viewAlerts(view) {
    const { alerts } = await api('/alerts');
    const u = state.me.user;
    view.innerHTML = `
      ${pageHead('Deadline Alerts', 'Proposal and question deadlines from your Bid CRM, plus your SAM.gov renewal.')}
      <div class="grid items-start gap-6 lg:grid-cols-3">
        <section class="card p-6 lg:col-span-2">
          <h2 class="font-semibold text-white">Coming up in the next 3 weeks</h2>
          ${alerts.length ? `<ul class="mt-2 divide-y divide-white/[0.06]">${alerts.map(alertRow).join('')}</ul>`
            : '<p class="mt-3 text-sm text-mist-500">Nothing due. Add response and questions dates to opportunities in your Bid CRM and they show up here.</p>'}
        </section>
        <div class="space-y-6">
          <section class="card p-6">
            <h2 class="font-semibold text-white">Email reminders</h2>
            <label class="mt-3 flex items-start gap-3 text-sm text-mist-100"><input id="alerts-toggle" type="checkbox" class="mt-1 accent-brand-blue" ${u.emailAlerts ? 'checked' : ''} />
              <span>Email me 7, 3 and 1 days before each deadline, and 60, 30 and 7 days before my SAM.gov registration expires.</span></label>
          </section>
          <section class="card p-6 text-sm">
            <h2 class="font-semibold text-white">SAM.gov expiration</h2>
            <p class="mt-2 ${u.samExpiresOn ? 'text-mist-100' : 'text-mist-400'}">${u.samExpiresOn ? fmtDate(u.samExpiresOn) : 'Not set yet. Add it to your profile to get renewal reminders.'}</p>
            <a href="/app/profile" data-link class="mt-3 inline-block font-semibold text-brand-blueSoft hover:text-white">${u.samExpiresOn ? 'Update' : 'Add it now'}</a>
          </section>
        </div>
      </div>`;
    $('#alerts-toggle').addEventListener('change', async (e) => {
      try {
        await api('/me/settings', { method: 'PATCH', body: { emailAlerts: e.target.checked } });
        state.me.user.emailAlerts = e.target.checked;
        toast(e.target.checked ? 'Email reminders on.' : 'Email reminders off.');
      } catch (err) { e.target.checked = !e.target.checked; toast(err.message, 'error'); }
    });
  }

  // ------------------------------------------------------------------ Sub-Safe SAM.gov Vetting

  const VERDICT = {
    clear: ['Clear', 'bg-emerald-500/15 text-emerald-300', 'Active in SAM.gov with no active exclusions.'],
    excluded: ['Excluded', 'bg-brand-red/20 text-brand-redSoft', 'An active exclusion was found. Do not team with or pay this company on a federal contract.'],
    not_registered: ['Not registered', 'bg-amber-400/15 text-amber-200', 'No SAM.gov registration found for that search. Ask for their UEI, or have them register before you rely on them.'],
    review: ['Review', 'bg-brand-blue/20 text-brand-blueSoft', 'More than one match, or a registration that is not active. Search by UEI to confirm the exact company.'],
  };

  function vettingResult(v) {
    const r = v.result || {};
    const [label, cls, text] = VERDICT[v.verdict] || VERDICT.review;
    const table = (head, rows) => `<div class="mt-3 overflow-x-auto"><table class="w-full text-left text-sm"><thead><tr class="text-xs uppercase tracking-wider text-mist-500">${head.map((h) => `<th class="pb-2 pr-4 font-semibold">${h}</th>`).join('')}</tr></thead>
      <tbody class="divide-y divide-white/[0.06]">${rows.map((cells) => `<tr>${cells.map((c) => `<td class="py-2 pr-4 align-top text-mist-100">${esc(c || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    return `
      <div class="flex flex-wrap items-center gap-3"><span class="pill ${cls}">${label}</span><span class="text-sm text-mist-400">${esc(v.query)} · checked ${fmtDate(r.checkedAt || v.createdAt)}</span></div>
      <p class="mt-3 text-sm text-mist-100">${text}</p>
      <h3 class="mt-6 text-sm font-semibold text-white">SAM.gov registrations${r.totalEntities > (r.entities || []).length ? ` (showing ${(r.entities || []).length} of ${r.totalEntities})` : ''}</h3>
      ${(r.entities || []).length ? table(['Company', 'UEI', 'CAGE', 'Status', 'Expires', 'Location'], r.entities.map((e) => [e.name, e.uei, e.cage, e.status, e.expires, e.location])) : '<p class="mt-2 text-sm text-mist-500">None found.</p>'}
      <h3 class="mt-6 text-sm font-semibold text-white">Exclusions</h3>
      ${(r.exclusions || []).length ? table(['Name', 'Type', 'Agency', 'Active', 'Ends'], r.exclusions.map((x) => [x.name, x.type, x.agency, x.active ? 'Yes' : 'No', x.terminationDate || 'Indefinite']))
        : '<p class="mt-2 text-sm text-mist-500">No exclusion records found.</p>'}`;
  }

  async function viewVetting(view) {
    const { vettings, configured } = await api('/vetting');
    view.innerHTML = `
      ${pageHead('Sub-Safe SAM.gov Vetting', 'Check a subcontractor against SAM.gov registrations and the federal exclusions list before you sign anything.')}
      ${configured ? '' : '<div class="mb-6 rounded-3xl border border-amber-300/25 bg-amber-400/10 p-5 text-sm text-amber-100">SAM.gov vetting is being switched on. Searches will work shortly.</div>'}
      <form id="vet-form" class="card mb-6 flex flex-wrap gap-3 p-5" novalidate>
        <label class="sr-only" for="vet-q">Business name or UEI</label>
        <input id="vet-q" name="query" class="field min-w-0 flex-1" maxlength="200" placeholder="Subcontractor legal business name or 12-character UEI" />
        <button type="submit" class="btn-primary">${icon('shield', 'h-4 w-4')}Vet subcontractor</button>
      </form>
      <section id="vet-result" class="card mb-6 hidden p-6"></section>
      <section class="card p-6"><h2 class="font-semibold text-white">Past checks</h2>
        ${vettings.length ? `<ul class="mt-3 divide-y divide-white/[0.06]">${vettings.map((v, i) => `<li><button type="button" data-i="${i}" class="flex w-full items-center justify-between gap-3 py-2.5 text-left">
          <span class="min-w-0"><span class="block truncate text-sm text-mist-100">${esc(v.query)}</span><span class="text-xs text-mist-500">${fmtDate(v.createdAt)}</span></span>
          <span class="pill shrink-0 ${(VERDICT[v.verdict] || VERDICT.review)[1]}">${(VERDICT[v.verdict] || VERDICT.review)[0]}</span></button></li>`).join('')}</ul>`
          : '<p class="mt-3 text-sm text-mist-500">No checks yet.</p>'}
      </section>`;
    const out = $('#vet-result');
    const showResult = (v) => { out.innerHTML = vettingResult(v); out.classList.remove('hidden'); out.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    $$('[data-i]', view).forEach((b) => b.addEventListener('click', () => showResult(vettings[Number(b.dataset.i)])));
    $('#vet-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', e.target);
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Checking SAM.gov';
      try {
        const { vetting } = await api('/vetting', { method: 'POST', body: { query: e.target.query.value } });
        vettings.unshift(vetting);
        showResult(vetting);
      } catch (err) { toast(err.message, 'error'); }
      btn.disabled = false;
      btn.innerHTML = icon('shield', 'h-4 w-4') + 'Vet subcontractor';
    });
  }

  render();
})();
