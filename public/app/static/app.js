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
    gauge: '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 13h6"/>',
    dollar: '<path d="M12 2v20"/><path d="M17 6.5c0-1.9-2.2-3.5-5-3.5s-5 1.6-5 3.5S9.2 10 12 10s5 1.6 5 3.5-2.2 3.5-5 3.5-5-1.6-5-3.5"/>',
    handshake: '<path d="m11 17 2 2a1.4 1.4 0 0 0 2-2"/><path d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2l-3.9-3.9a2 2 0 0 0-2.8 0l-.9.9a1.4 1.4 0 0 1-2-2l2.8-2.8a3.6 3.6 0 0 1 4.3-.6L18 7l3 1v7h-2"/><path d="M3 8l3-1 1 1M3 8v7l6 6a1.4 1.4 0 0 0 2-2"/>',
    grade: '<path d="M9 11l2 2 4-4"/><rect x="4" y="3" width="16" height="18" rx="2"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17h.01"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    trophy: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    voice: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    lockshield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><rect x="9" y="11" width="6" height="5" rx="1"/><path d="M10 11V9.5a2 2 0 0 1 4 0V11"/>',
    pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    radar: '<circle cx="12" cy="12" r="9"/><path d="M12 12 18 6"/><circle cx="12" cy="12" r="4"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
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
        // Short stacked lines (signature blocks, addresses) keep their line breaks; prose lines join.
        const stacked = para.length > 1 && para.every((x) => x.trim().length < 70);
        out.push(`<p>${para.map((x) => inline(x.trim())).join(stacked ? '<br>' : ' ')}</p>`);
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
    autopilot: '/autopilot',
    proposal_engine: '/proposals', bid_decryptor: '/decryptor', go_no_go: '/go-no-go', bid_crm: '/crm', bid_matchmaker: '/matchmaker',
    vendor_scraper: '/vendors', outreach: '/outreach', foia: '/foia', pricing_matrix: '/pricing', teaming_legal: '/teaming',
    section_m: '/section-m', rfi_ghostwriter: '/rfi', milestones: '/milestones', invoicing: '/invoices',
    capability_statement: '/capability', past_performance: '/portfolio', winning_voice: '/winning-voice', cmmc_checklist: '/cmmc',
    compliance_pulse: '/pulse', subcontracting_check: '/subcontracting', sam_checklist: '/sam-checklist', sub_vetting: '/vetting',
    state_directory: '/states', deadline_alerts: '/alerts',
  };
  const ICON_OF = {
    autopilot: 'bolt',
    proposal_engine: 'proposal', bid_decryptor: 'decrypt', go_no_go: 'gauge', bid_crm: 'crm', bid_matchmaker: 'radar',
    vendor_scraper: 'users', outreach: 'mail', foia: 'folder', pricing_matrix: 'dollar', teaming_legal: 'handshake',
    section_m: 'grade', rfi_ghostwriter: 'question', milestones: 'flag', invoicing: 'receipt',
    capability_statement: 'badge', past_performance: 'trophy', winning_voice: 'voice', cmmc_checklist: 'lockshield',
    compliance_pulse: 'pulse', subcontracting_check: 'scale', sam_checklist: 'check', sub_vetting: 'shield',
    state_directory: 'map', deadline_alerts: 'bell',
  };
  const NAV_GROUPS = [
    ['Autopilot', ['autopilot']],
    ['Win work', ['proposal_engine', 'bid_decryptor', 'go_no_go', 'bid_crm', 'bid_matchmaker']],
    ['Subs and pricing', ['vendor_scraper', 'outreach', 'pricing_matrix', 'foia', 'teaming_legal', 'sub_vetting']],
    ['Review and submit', ['section_m', 'rfi_ghostwriter']],
    ['After award', ['milestones', 'invoicing']],
    ['Company and compliance', ['capability_statement', 'past_performance', 'winning_voice', 'cmmc_checklist', 'compliance_pulse',
      'subcontracting_check', 'sam_checklist', 'state_directory', 'deadline_alerts']],
  ];
  const ABOUT = {
    autopilot: 'Your hands-off government contracting assistant. It learns your business, finds matching solicitations on SAM.gov, reads them, emails vendors for quotes, checks what the government really paid, prices every line at your margin and writes the proposal, as many bids a day as you set.',
    go_no_go: 'Analyzes each solicitation against your business profile and tells you if you are legally qualified to bid, including set-aside and limits on subcontracting checks.',
    invoicing: 'Builds SF-1034 public vouchers (with SF-1035 continuation lines) for purchases and services, numbered and totaled so you get paid on time.',
    winning_voice: 'Upload your past winning proposals and every new draft is written in your own proven voice.',
    cmmc_checklist: 'A 17-point CMMC Level 1 self-assessment based on FAR 52.204-21, with progress you can show a prime or contracting officer.',
    compliance_pulse: 'The newest FAR, DFARS and agency rule changes from the Federal Register, plus the 2026 rules every bidder must know.',
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
    const byKey = new Map(f.map((x) => [x.key, x]));
    const link = (href, ic, label, extra = '') =>
      `<a href="/app${href === '/' ? '' : href}" data-link data-path="${href}" class="nav-link">${icon(ic, 'h-[18px] w-[18px] shrink-0')}<span class="flex-1 truncate">${esc(label)}</span>${extra}</a>`;
    const item = (x) => (x.unlocked && x.status === 'live'
      ? link(ROUTE_OF[x.key], ICON_OF[x.key], x.name)
      : link('/feature/' + x.key, x.unlocked ? ICON_OF[x.key] : 'lock', x.name,
        x.unlocked ? '<span class="pill bg-white/[0.08] text-mist-400">Soon</span>' : '<span class="pill bg-gradient-to-r from-brand-blue/30 to-brand-red/30 text-white">Ent</span>'));
    return `
      ${link('/', 'home', 'Command Center')}
      ${NAV_GROUPS.map(([title, keys]) => {
        const items = keys.map((k) => byKey.get(k)).filter(Boolean);
        return items.length ? `<p class="mt-5 px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-mist-500">${title}</p>${items.map(item).join('')}` : '';
      }).join('')}
    `;
  }

  const brandLockup = (h = 'h-8') => `<img src="/assets/gpp-logo-mark.png" alt="" width="480" height="499" class="${h} w-auto" />
    <span class="text-[17px] font-semibold tracking-tight text-white">GovProposal<span class="text-mist-400">Pro</span></span>`;

  function renderShell() {
    const me = state.me;
    const ent = me.tier.key === 'enterprise';
    document.body.classList.toggle('ed-enterprise', ent);
    document.body.classList.toggle('ed-core', !ent);
    $('#root').innerHTML = `
      <div class="flex min-h-screen">
        <aside class="no-print sticky top-0 hidden h-screen w-[17rem] shrink-0 flex-col border-r border-white/[0.07] bg-black/80 px-4 pb-4 pt-5 backdrop-blur-2xl lg:flex">
          <a href="/app" data-link class="mb-1 flex items-center gap-2.5 px-2">${brandLockup()}</a>
          <div class="mb-4 px-2"><span class="edition-badge mt-2">${esc(me.tier.label)}</span></div>
          <nav class="flex-1 space-y-0.5 overflow-y-auto pl-1.5 pr-1">${navItems()}</nav>
          <div class="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
            <p class="truncate text-sm font-medium text-mist-100">${esc(me.user.businessName || me.user.fullName || me.user.email)}</p>
            <p class="truncate text-xs text-mist-500">${esc(me.user.email)}</p>
            <div class="mt-2 flex gap-2">
              <a href="/app/profile" data-link class="btn-ghost flex-1 !px-2 !py-1.5 !text-xs">${icon('user', 'h-4 w-4')}Profile</a>
              <button id="logout" class="btn-ghost flex-1 !px-2 !py-1.5 !text-xs">${icon('out', 'h-4 w-4')}Sign out</button>
            </div>
          </div>
        </aside>
        <div class="flex min-w-0 flex-1 flex-col">
          <header class="no-print sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.07] bg-black/80 px-4 py-3 backdrop-blur-2xl lg:hidden">
            <a href="/app" data-link class="flex items-center gap-2">${brandLockup('h-7')}<span class="edition-badge !px-2 !py-0.5 !text-[9px]">${ent ? 'Enterprise' : 'Core'}</span></a>
            <button id="menu" class="btn-ghost !p-2" aria-label="Menu">${icon('menu')}</button>
          </header>
          <div id="mobile-nav" class="no-print fixed inset-0 top-14 z-20 hidden overflow-y-auto bg-black/95 p-4 backdrop-blur-2xl lg:hidden">
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

  const hasTool = (key) => Boolean(state.me && state.me.features.some((f) => f.key === key && f.unlocked && f.status === 'live'));

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
    // Company setup comes first and is required: every proposal is written from it.
    if (!state.me.user.onboarded && path !== '/welcome' && path !== '/profile') {
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
      else if (path === '/autopilot') await viewAutopilot(view);
      else if ((m = path.match(/^\/autopilot\/(\d+)$/))) await viewAutopilotItem(view, m[1]);
      else if (path === '/welcome') await viewWelcome(view);
      else if (path === '/capability') await viewCapabilityList(view);
      else if ((m = path.match(/^\/capability\/(\d+)$/))) await viewCapability(view, m[1]);
      else if (path === '/subcontracting') viewSubcontracting(view);
      else if (path === '/sam-checklist') viewSamChecklist(view);
      else if (path === '/alerts') await viewAlerts(view);
      else if (path === '/vetting') await viewVetting(view);
      else if (path === '/go-no-go') await viewGoNoGo(view);
      else if (path === '/matchmaker') await viewMatchmaker(view);
      else if (path === '/vendors') await viewVendors(view);
      else if (path === '/outreach') await viewOutreach(view);
      else if (path === '/foia') await viewFoia(view);
      else if (path === '/pricing') await viewPricingList(view);
      else if ((m = path.match(/^\/pricing\/(new|\d+)$/))) await viewPricing(view, m[1]);
      else if (path === '/teaming') await viewTeaming(view);
      else if ((m = path.match(/^\/teaming\/(\d+)$/))) await viewLegalDoc(view, m[1]);
      else if (path === '/section-m') await viewJobs(view, 'section_m');
      else if (path === '/rfi') await viewJobs(view, 'rfi');
      else if (path === '/portfolio') await viewJobs(view, 'case_study');
      else if ((m = path.match(/^\/(section-m|rfi|portfolio)\/(\d+)$/))) await viewJob(view, JOB_KIND_OF[m[1]], m[2]);
      else if (path === '/milestones') await viewMilestones(view);
      else if (path === '/invoices') await viewInvoices(view);
      else if ((m = path.match(/^\/invoices\/(new|\d+)$/))) await viewInvoice(view, m[1]);
      else if (path === '/winning-voice') await viewWinningVoice(view);
      else if (path === '/cmmc') await viewCmmc(view);
      else if (path === '/pulse') await viewPulse(view);
      else if (path === '/states') await viewStates(view);
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
          <img src="/assets/gpp-logo.png" alt="GovProposalPro" width="900" height="543" class="mx-auto h-auto w-56" /><p class="mb-10 mt-3 text-center text-xs font-medium uppercase tracking-[0.3em] text-mist-500">by Contract Bros</p>
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

    const ent = me.tier.key === 'enterprise';
    const quick = (ent ? [['autopilot', 'autopilot', 'Run the Autopilot'], ['matchmaker', 'bid_matchmaker', 'Find matched bids'], ['section-m', 'section_m', 'Grade a proposal'], ['pricing', 'pricing_matrix', 'Price with Fringe/G&A']]
      : [['go-no-go', 'go_no_go', 'Go/No-Go a bid'], ['vendors', 'vendor_scraper', 'Find subcontractors'], ['pricing', 'pricing_matrix', 'Price a bid'], ['cmmc', 'cmmc_checklist', 'CMMC Level 1 check']]);

    view.innerHTML = `
      <section class="card relative mb-8 overflow-hidden p-6 sm:p-8">
        <div class="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-40 blur-3xl accent-glow"></div>
        <span class="edition-badge">${ent ? 'Enterprise Edition' : 'Core Edition'}</span>
        <h1 class="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">${ent ? 'Your <span class="accent-text">Enterprise</span> Command Center.' : 'Your <span class="accent-text">Core</span> Command Center.'}</h1>
        <p class="mt-2 max-w-2xl text-mist-400">${first ? `Welcome back, ${esc(first)}. ` : ''}${ent ? 'Your GovCon Autopilot finds, prices and writes bids for you. Plus 50 proposals a month, predictive matching, legal teaming, compliance grading and your winning voice.' : 'Upload a solicitation and the engine writes the proposal. 10 proposals a month and every tool to find, price, win and invoice federal contracts.'}</p>
        <div class="mt-6 flex flex-wrap gap-2">${quick.map(([path, key, label]) => `<a href="/app/${path}" data-link class="btn-ghost !bg-white/[0.06]">${icon(ICON_OF[key] || 'spark', 'h-4 w-4')}${label}</a>`).join('')}</div>
        ${ent ? '' : '<p class="mt-5 text-xs text-mist-500">Enterprise adds the GovCon Autopilot (it finds the bids, gets vendor quotes, prices and writes the proposals for you), the Predictive Bid Matchmaker, Section M grading, teaming agreements and 50 proposals a month.</p>'}
      </section>
      ${pageHead('Today', 'Your pipeline, deadlines and proposals at a glance.',
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
      ${pageHead('AI Bid Decryptor', 'Drop in the solicitation and its amendments. Get the one-page brief: scope, line items, FAR clauses, who to submit to, due dates and disqualifiers.')}
      <div class="grid gap-6 lg:grid-cols-5">
        <form id="decrypt-form" class="card p-6 lg:col-span-3" novalidate>
          <label id="drop" for="pdf" class="flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-mist-300/20 bg-ink-900/50 px-6 py-12 text-center transition hover:border-brand-blueSoft/50">
            <span class="mb-3 rounded-2xl bg-gradient-to-br from-brand-blue/30 to-brand-red/20 p-3 text-white">${icon('upload', 'h-6 w-6')}</span>
            <span id="drop-label" class="font-semibold text-white">Drop the solicitation here</span>
            <span class="mt-1 text-sm text-mist-400">PDF or Word. Add amendments, Q&amp;A and attachments too (up to 6 files, 30 MB).</span>
            <input id="pdf" type="file" multiple accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="sr-only" />
          </label>
          <ul id="sol-files" class="mt-3 space-y-2"></ul>
          <details class="mt-4">
            <summary class="cursor-pointer text-sm text-mist-400 hover:text-white">No file? Paste the solicitation text instead</summary>
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

    const picked = [];
    const input = $('#pdf');
    const drop = $('#drop');
    const drawPicked = () => {
      $('#sol-files').innerHTML = picked.map((f, i) => `<li class="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
        <span class="min-w-0 truncate text-sm text-mist-100">${esc(f.name)}</span><button type="button" class="btn-ghost !px-2.5 !py-1 !text-xs" data-rm="${i}">Remove</button></li>`).join('');
      $('#drop-label').textContent = picked.length ? 'Add another file (amendment, Q&A, attachment)' : 'Drop the solicitation here';
    };
    const pick = (list) => {
      for (const f of list) {
        if (!/\.(pdf|docx)$/i.test(f.name)) { toast(`${f.name}: upload PDF or Word (.docx) files.`, 'error'); continue; }
        if (picked.length >= 6) { toast('Up to 6 files at a time.', 'error'); break; }
        if (picked.reduce((t, x) => t + x.size, 0) + f.size > 30 * 1024 * 1024) { toast('Files can add up to 30 MB.', 'error'); break; }
        picked.push(f);
      }
      drawPicked();
    };
    input.addEventListener('change', () => { pick(input.files); input.value = ''; });
    $('#sol-files').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { picked.splice(Number(b.dataset.rm), 1); drawPicked(); } });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('border-brand-blueSoft/60'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('border-brand-blueSoft/60'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('border-brand-blueSoft/60'); pick(e.dataTransfer.files); });

    $('#decrypt-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', e.target);
      const errEl = $('#decrypt-error');
      errEl.classList.add('hidden');
      const text = $('#paste').value.trim();
      if (!picked.length && text.length < 200) {
        errEl.textContent = 'Upload the solicitation or paste at least a few paragraphs of it.';
        errEl.classList.remove('hidden');
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Uploading';
      try {
        const body = { bidId: $('#link-bid').value ? Number($('#link-bid').value) : null };
        if (picked.length) body.files = await Promise.all(picked.map(async (f) => ({ name: f.name, data: await readBase64(f) })));
        else body.text = text;
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
      ${hasTool('go_no_go') ? goNoGoPanel(d) : ''}
      <div class="mb-6 rounded-[22px] border border-white/[0.08] bg-ink-800 p-5">
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
        ${d.contracting_officer ? block('Submit to', (() => {
          const co = d.contracting_officer;
          const rows = [co.name, co.title, co.email, co.phone, co.office, co.address].filter((x) => x && !/^not stated$/i.test(x));
          return rows.length ? rows.map((x) => `<p>${esc(x)}</p>`).join('') : '<p class="text-mist-500">Not stated</p>';
        })()) : ''}
        ${d.far_clauses ? block('FAR and agency clauses', d.far_clauses.length ? `<div class="overflow-x-auto"><table class="w-full text-left text-sm"><thead class="text-xs uppercase tracking-wider text-mist-500"><tr><th class="pb-2 pr-4 font-semibold">Clause</th><th class="pb-2 pr-4 font-semibold">Title</th><th class="pb-2 font-semibold">What you must do</th></tr></thead>
          <tbody class="divide-y divide-white/[0.06]">${d.far_clauses.map((c) => `<tr class="${/^none/i.test(c.offeror_action || '') ? 'text-mist-500' : ''}"><td class="py-2 pr-4 align-top font-mono text-xs text-white">${esc(c.number)}</td><td class="py-2 pr-4 align-top">${esc(c.title)}</td><td class="py-2 align-top">${esc(c.offeror_action)}</td></tr>`).join('')}</tbody></table></div>
          <p class="mt-3 text-xs text-mist-500">The Proposal Engine writes a compliance statement for each clause that needs one.</p>` : '<p class="text-mist-500">None listed</p>', 'lg:col-span-2') : ''}
        ${d.line_items && d.line_items.length ? block('Line items to price', `<ul class="space-y-2">${d.line_items.map((li) => `<li><p class="text-white">${esc([li.item, li.description].filter(Boolean).join(' · '))}</p><p class="text-xs text-mist-500">${esc([li.quantity, li.unit].filter(Boolean).join(' '))}</p></li>`).join('')}</ul>`, 'lg:col-span-3') : ''}
        ${d.amendments && d.amendments.length ? block('Amendments', list(d.amendments), 'lg:col-span-3') : ''}
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

  const CONTRACT_TYPES = ['Firm Fixed Price', 'Time and Materials', 'Labor Hour', 'Cost Reimbursement', 'IDIQ', 'BPA', 'Purchase Order', 'Not sure'];
  const FILE_ACCEPT = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const step = (n, title, sub) => `<div class="mb-4 flex items-start gap-3"><span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-blue to-brand-red text-xs font-bold text-white">${n}</span>
    <div><h2 class="font-semibold text-white">${title}</h2>${sub ? `<p class="mt-0.5 text-sm text-mist-400">${sub}</p>` : ''}</div></div>`;

  async function viewNewProposal(view) {
    const params = new URLSearchParams(location.search);
    const [{ bids }, { summaries }, { usage }] = await Promise.all([api('/bids'), api('/decryptor'), api('/proposals')]);
    const ready = summaries.filter((s) => s.status === 'ready');
    const left = usage.limit - usage.used;
    const files = [];
    view.innerHTML = `
      ${pageHead('New proposal', left > 0 ? `Uses 1 of your ${left} remaining proposals this month.` : 'You have reached this month\'s proposal limit.')}
      <form id="proposal-form" class="max-w-4xl space-y-6" novalidate>
        <section class="card p-6 sm:p-8">
          ${step(1, 'The solicitation', 'The engine pulls the contracting officer, the FAR clauses you must answer, line items and grading criteria from it.')}
          <div class="grid gap-5 sm:grid-cols-2">
            <div class="sm:col-span-2"><label class="label" for="pf-sum">Decrypted solicitation (strongly recommended)</label>
              <select id="pf-sum" name="rfpSummaryId" class="field"><option value="">None</option>${ready.map((s) => `<option value="${s.id}" ${String(s.id) === params.get('summary') ? 'selected' : ''}>${esc(s.title || s.fileName)}</option>`).join('')}</select>
              <p class="mt-1.5 text-xs text-mist-500">Not there yet? <a href="/app/decryptor" data-link class="font-semibold text-brand-blueSoft hover:text-white">Upload the solicitation and amendments</a> first (PDF or Word). It takes a minute.</p></div>
            <div><label class="label" for="pf-bid">Opportunity from your Bid CRM</label>
              <select id="pf-bid" name="bidId" class="field"><option value="">None</option>${bids.map((b) => `<option value="${b.id}" ${String(b.id) === params.get('bid') ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select></div>
            <div><label class="label" for="pf-title">Proposal title (optional)</label><input id="pf-title" name="title" class="field" maxlength="200" /></div>
          </div>
          <div id="pf-sol" class="mt-5 hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm"></div>
        </section>

        <section class="card p-6 sm:p-8">
          ${step(2, 'Contract type and delivery', 'Use what the solicitation states. Pick "Not sure" if it does not say.')}
          <div class="grid gap-5 sm:grid-cols-2">
            <div><label class="label" for="pf-type">Contract type</label>
              <select id="pf-type" name="contractType" class="field"><option value="">Choose</option>${CONTRACT_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></div>
            <div><label class="label" for="pf-del">Delivery, lead time or period of performance</label><input id="pf-del" name="deliveryTerms" class="field" maxlength="300" placeholder="e.g. 7 to 9 weeks after award, FOB destination" /></div>
          </div>
        </section>

        <section class="card p-6 sm:p-8">
          ${step(3, 'Your pricing', 'Enter what you will charge the government: your supplier or subcontractor cost plus your markup. The engine builds the price table from these exact numbers.')}
          <div class="overflow-x-auto"><table class="w-full min-w-[640px] text-left text-sm">
            <thead class="text-xs uppercase tracking-wider text-mist-500"><tr><th class="pb-2 pr-2 font-semibold">Item</th><th class="pb-2 pr-2 font-semibold">Description</th><th class="pb-2 pr-2 font-semibold">Unit</th><th class="pb-2 pr-2 font-semibold">Qty</th><th class="pb-2 pr-2 font-semibold">Unit price ($)</th><th class="pb-2 pr-2 text-right font-semibold">Total</th><th></th></tr></thead>
            <tbody id="pf-items"></tbody>
          </table></div>
          <button type="button" id="pf-add-item" class="btn-ghost mt-3">${icon('plus', 'h-4 w-4')}Add line item</button>
          <h3 class="mt-6 text-sm font-semibold text-mist-300">Other charges</h3>
          <div id="pf-extras" class="mt-2 space-y-2"></div>
          <button type="button" id="pf-add-extra" class="btn-ghost mt-3">${icon('plus', 'h-4 w-4')}Add a charge (shipping, installation, freight...)</button>
          <div class="mt-6 flex justify-end"><div class="w-full max-w-xs space-y-1 text-sm">
            <div class="flex justify-between text-mist-400"><span>Subtotal</span><span id="pf-sub">$0</span></div>
            <div class="flex justify-between text-base font-bold text-white"><span>Total</span><span id="pf-total">$0</span></div>
          </div></div>
        </section>

        <section class="card p-6 sm:p-8">
          ${step(4, 'Photos and supporting files', 'Supplier quotes, product spec sheets, price lists, photos of the product or job site, authorization letters, certifications. Phone photos work. Up to 8 files, 25 MB total.')}
          <label id="pf-drop" for="pf-files" class="flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-mist-300/20 bg-ink-900/50 px-6 py-8 text-center transition hover:border-brand-blueSoft/50">
            <span class="mb-2 rounded-2xl bg-gradient-to-br from-brand-blue/30 to-brand-red/20 p-3 text-white">${icon('upload', 'h-6 w-6')}</span>
            <span class="font-semibold text-white">Drop files here or click to add</span>
            <span class="mt-1 text-sm text-mist-400">JPG, PNG or PDF</span>
            <input id="pf-files" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf" class="sr-only" />
          </label>
          <ul id="pf-file-list" class="mt-3 space-y-2"></ul>
        </section>

        <section class="card p-6 sm:p-8">
          ${step(5, 'Anything else the writer should know', '')}
          <textarea id="pf-notes" name="instructions" rows="5" class="field" maxlength="6000" placeholder="Brand or model you are offering, the subcontractor or supplier you plan to use, warranty, win themes, staffing. If you have no solicitation selected, describe the contract here."></textarea>
          <p id="pf-error" class="mt-4 hidden text-sm text-brand-redSoft" role="alert"></p>
          <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p class="text-xs text-mist-500">Facts we don't have are left as <span class="doc"><span class="ph">[INSERT: ...]</span></span> placeholders, never made up.</p>
            <button type="submit" class="btn-primary !px-6 !py-3" ${left <= 0 ? 'disabled' : ''}>${icon('spark', 'h-5 w-5')}Generate proposal</button>
          </div>
          ${left <= 0 ? `<p class="mt-4 rounded-2xl border border-brand-red/30 bg-brand-red/10 p-4 text-sm text-brand-redSoft">You've used all ${usage.limit} proposals this month.${state.me.tier.key !== 'enterprise' ? ' Enterprise Edition raises your limit to 50 a month.' : ''}</p>` : ''}
        </section>
      </form>`;

    const form = $('#proposal-form');
    const num = (v) => { const n = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) && n >= 0 ? n : null; };
    const money2 = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    const itemRow = (it = {}) => `<tr class="pf-item align-top">
      <td class="py-1 pr-2"><input class="field !w-20 !px-3 !py-2" data-k="item" maxlength="20" placeholder="0001" value="${esc(it.item)}" /></td>
      <td class="py-1 pr-2"><input class="field !py-2" data-k="description" maxlength="300" placeholder="What you are providing" value="${esc(it.description)}" /></td>
      <td class="py-1 pr-2"><input class="field !w-24 !px-3 !py-2" data-k="unit" maxlength="30" placeholder="Each" value="${esc(it.unit)}" /></td>
      <td class="py-1 pr-2"><input class="field !w-24 !px-3 !py-2" data-k="quantity" inputmode="decimal" value="${esc(it.quantity)}" /></td>
      <td class="py-1 pr-2"><input class="field !w-32 !px-3 !py-2" data-k="unitPrice" inputmode="decimal" placeholder="0.00" value="${esc(it.unitPrice)}" /></td>
      <td class="py-3 pr-2 text-right text-white" data-total>-</td>
      <td class="py-1"><button type="button" class="btn-ghost !px-2.5 !py-2 pf-del" aria-label="Remove line">&times;</button></td></tr>`;
    const extraRow = (x = {}) => `<div class="pf-extra flex gap-2"><input class="field !py-2" data-k="label" maxlength="100" placeholder="e.g. Shipping and handling" value="${esc(x.label)}" />
      <input class="field !w-40 !py-2" data-k="amount" inputmode="decimal" placeholder="0.00" value="${esc(x.amount)}" /><button type="button" class="btn-ghost !px-2.5 pf-del" aria-label="Remove charge">&times;</button></div>`;
    const recalc = () => {
      let sub = 0;
      $$('.pf-item', form).forEach((tr) => {
        const q = num($('[data-k=quantity]', tr).value);
        const p = num($('[data-k=unitPrice]', tr).value);
        const t = q !== null && p !== null && $('[data-k=unitPrice]', tr).value !== '' ? q * p : null;
        $('[data-total]', tr).textContent = t === null ? '-' : money2(t);
        sub += t || 0;
      });
      const extras = $$('.pf-extra', form).reduce((t, el) => t + (num($('[data-k=amount]', el).value) || 0), 0);
      $('#pf-sub').textContent = money2(sub);
      $('#pf-total').textContent = money2(sub + extras);
    };
    // A pricing sheet sent from the Profit Pricing Matrix fills the price table.
    let handoff = null;
    try { handoff = JSON.parse(sessionStorage.getItem('gpp-pricing') || 'null'); sessionStorage.removeItem('gpp-pricing'); } catch { handoff = null; }
    if (handoff && Array.isArray(handoff.items) && handoff.items.length) {
      $('#pf-items').innerHTML = handoff.items.slice(0, 60).map(itemRow).join('');
      (handoff.extras || []).slice(0, 20).forEach((x) => $('#pf-extras').insertAdjacentHTML('beforeend', extraRow(x)));
      if (handoff.title) form.elements.title.value = handoff.title;
      if (handoff.bidId) form.elements.bidId.value = String(handoff.bidId);
      recalc();
      toast('Prices copied from your pricing sheet.');
    } else {
      $('#pf-items').insertAdjacentHTML('beforeend', itemRow());
    }
    $('#pf-add-item').addEventListener('click', () => { $('#pf-items').insertAdjacentHTML('beforeend', itemRow()); recalc(); });
    $('#pf-add-extra').addEventListener('click', () => { $('#pf-extras').insertAdjacentHTML('beforeend', extraRow()); recalc(); });
    form.addEventListener('click', (e) => {
      const d = e.target.closest('.pf-del');
      if (d) { (d.closest('.pf-item') || d.closest('.pf-extra')).remove(); recalc(); }
    });
    form.addEventListener('input', (e) => { if (e.target.closest('.pf-item, .pf-extra')) recalc(); });

    // Picking a decrypted solicitation shows who it goes to and the clauses, and pre-fills its line items.
    const showSolicitation = async () => {
      const id = $('#pf-sum').value;
      const box = $('#pf-sol');
      if (!id) { box.classList.add('hidden'); return; }
      try {
        const d = (await api('/decryptor/' + id)).summary.summary || {};
        const co = d.contracting_officer || {};
        const must = (d.far_clauses || []).filter((c) => !/^none/i.test(c.offeror_action || ''));
        box.innerHTML = `
          <p class="text-mist-300"><span class="text-mist-500">Submitted to:</span> ${esc([co.name, co.title, co.email].filter((x) => x && !/^not stated$/i.test(x)).join(', ') || 'Not stated in the solicitation')}</p>
          <p class="mt-1 text-mist-300"><span class="text-mist-500">Contract type:</span> ${esc(d.contract_type || 'Not stated')}</p>
          <p class="mt-1 text-mist-300"><span class="text-mist-500">Clauses the proposal will answer:</span> ${must.length ? must.map((c) => esc(c.number)).join(', ') : 'None that need a statement'}</p>`;
        box.classList.remove('hidden');
        const typeSel = $('#pf-type');
        if (!typeSel.value) {
          const match = CONTRACT_TYPES.find((t) => (d.contract_type || '').toLowerCase().includes(t.toLowerCase()));
          if (match) typeSel.value = match;
        }
        const empty = $$('.pf-item', form).every((tr) => !$('[data-k=description]', tr).value.trim());
        if (empty && (d.line_items || []).length) {
          $('#pf-items').innerHTML = d.line_items.slice(0, 60).map((li) => itemRow({
            item: li.item, description: li.description, unit: li.unit,
            quantity: /^\d+(\.\d+)?$/.test((li.quantity || '').replace(/,/g, '')) ? li.quantity.replace(/,/g, '') : '',
          })).join('');
          recalc();
          toast('Line items copied from the solicitation. Add your prices.');
        }
      } catch { box.classList.add('hidden'); }
    };
    $('#pf-sum').addEventListener('change', showSolicitation);
    if ($('#pf-sum').value) showSolicitation();

    const drawFiles = () => {
      $('#pf-file-list').innerHTML = files.map((f, i) => `<li class="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
        <span class="min-w-0 truncate text-sm text-mist-100">${esc(f.name)}</span><span class="flex shrink-0 items-center gap-3 text-xs text-mist-500">${(f.size / 1048576).toFixed(1)} MB
        <button type="button" class="btn-ghost !px-2.5 !py-1 !text-xs" data-rm="${i}">Remove</button></span></li>`).join('');
    };
    const addFiles = (list) => {
      for (const f of list) {
        if (!FILE_ACCEPT.includes(f.type) && !/\.pdf$/i.test(f.name)) { toast(`${f.name}: use JPG, PNG or PDF.`, 'error'); continue; }
        if (files.length >= 8) { toast('Up to 8 files.', 'error'); break; }
        if (files.reduce((t, x) => t + x.size, 0) + f.size > 25 * 1024 * 1024) { toast('Files can add up to 25 MB.', 'error'); break; }
        files.push(f);
      }
      drawFiles();
    };
    $('#pf-files').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
    const drop = $('#pf-drop');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('border-brand-blueSoft/60'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('border-brand-blueSoft/60'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('border-brand-blueSoft/60'); addFiles(e.dataTransfer.files); });
    $('#pf-file-list').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { files.splice(Number(b.dataset.rm), 1); drawFiles(); } });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      const errEl = $('#pf-error');
      errEl.classList.add('hidden');
      const val = (n) => form.elements[n].value;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Starting';
      try {
        const data = {
          bidId: val('bidId') ? Number(val('bidId')) : null,
          rfpSummaryId: val('rfpSummaryId') ? Number(val('rfpSummaryId')) : null,
          title: val('title'),
          instructions: val('instructions'),
          contractType: val('contractType') || null,
          deliveryTerms: val('deliveryTerms'),
          pricingItems: $$('.pf-item', form).map((tr) => Object.fromEntries($$('[data-k]', tr).map((i) => [i.dataset.k, i.value.trim()]))).filter((it) => it.description),
          pricingExtras: $$('.pf-extra', form).map((el) => Object.fromEntries($$('[data-k]', el).map((i) => [i.dataset.k, i.value.trim()]))).filter((x) => x.label && x.amount),
          attachments: await Promise.all(files.map(async (f) => ({ name: f.name, mediaType: f.type || 'application/pdf', data: await readBase64(f) }))),
        };
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
      book: (md) => openProposalBook(p, md),
      word: async (md) => proposalWord(await proposalContext(p), md),
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
        <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-blue via-[#5B3BFF] to-brand-red"></div>
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

  const ALERT_LABEL = { proposal_due: 'Proposal due', questions_due: 'Questions due', sam_expiring: 'SAM.gov renewal' };
  const daysLabel = (n) => (n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days`);
  const alertRow = (a) => `
    <li class="flex items-center justify-between gap-3 py-2.5">
      <span class="min-w-0"><span class="block truncate text-sm text-mist-100">${esc(a.title)}</span><span class="text-xs text-mist-500">${ALERT_LABEL[a.kind]} · ${fmtDate(a.date)}</span></span>
      <span class="pill shrink-0 ${a.daysLeft <= 3 ? 'bg-brand-red/20 text-brand-redSoft' : 'bg-white/[0.06] text-mist-300'}">${icon(a.kind === 'sam_expiring' ? 'check' : 'cal', 'h-3.5 w-3.5')}${daysLabel(a.daysLeft)}</span>
    </li>`;

  /** Read-only document view with edit, copy, Word and print. Used by proposals and capability statements. */
  function docViewer(view, { title, sub, md, save, book, word }) {
    let content = md;
    const slug = (title || 'document').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'document';
    view.innerHTML = `
      <div class="no-print">${pageHead(esc(title), esc(sub),
        `<button id="edit" class="btn-ghost">Edit</button><button id="copy" class="btn-ghost">Copy</button>
         <button id="word" class="btn-ghost">Download Word</button><button id="print" class="btn-primary">${book ? 'Proposal PDF' : 'Print / PDF'}</button>`)}</div>
      <article class="card print-area p-6 sm:p-10"><div id="doc" class="doc">${markdown(content)}</div>
        <div id="editor" class="no-print hidden"><textarea id="md" rows="30" class="field font-mono !text-[13px] leading-relaxed">${esc(content)}</textarea>
          <div class="mt-3 flex justify-end gap-2"><button id="cancel-edit" class="btn-ghost">Cancel</button><button id="save" class="btn-primary">Save changes</button></div></div>
      </article>`;
    $('#print').addEventListener('click', () => (book ? book(content).catch((err) => toast(err.message, 'error')) : window.print()));
    $('#copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(content); toast('Copied to clipboard.'); } catch { toast('Copy failed. Select the text instead.', 'error'); }
    });
    $('#word').addEventListener('click', () => {
      if (word) { word(content).catch((err) => toast(err.message, 'error')); return; }
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
        <img src="/assets/gpp-logo.png" alt="GovProposalPro" width="900" height="543" class="mx-auto h-auto w-56" /><p class="mb-10 mt-3 text-center text-xs font-medium uppercase tracking-[0.3em] text-mist-500">by Contract Bros</p>
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
  const STRUCTURES = { 'Limited Liability Company': 'LLC', Corporation: 'Corporation', 'S Corporation': 'S Corporation', 'Sole Proprietorship': 'Sole proprietorship', Partnership: 'Partnership', Other: 'Other' };
  const EMPLOYEES = { 1: 'Just me', '2-10': '2 to 10', '11-50': '11 to 50', '51-200': '51 to 200', '201+': 'More than 200' };
  const DOC_KIND = { capability_statement: 'Capability statement', past_performance: 'Past performance', resume: 'Resume', company_overview: 'Company overview', winning_proposal: 'Winning proposal (Enterprise)', other: 'Other' };

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
      ${fld('businessName', 'Legal business name *', u.businessName, { attrs: 'maxlength="160" required' })}
      ${fld('fullName', 'Your name (point of contact)', u.fullName, { attrs: 'maxlength="120"' })}
      ${fld('contactTitle', 'Your title', u.contactTitle, { attrs: 'maxlength="120" placeholder="e.g. Founder and President"' })}
      ${fld('entityStructure', 'Business structure', u.entityStructure, { options: STRUCTURES })}
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
      ${fld('naics', 'NAICS codes *', u.naics, { wide: true, attrs: 'maxlength="200" placeholder="e.g. 561720, 561730" required' })}
      ${fld('capabilities', 'Core capabilities *', u.capabilities, { wide: true, rows: 5, attrs: 'maxlength="4000" placeholder="What you and your subcontractors deliver, for whom, and at what scale."', help: 'The proposal engine leans on this more than anything else.' })}
      ${fld('differentiators', 'What makes you different', u.differentiators, { wide: true, rows: 3, attrs: 'maxlength="2000" placeholder="Response times, certifications, equipment, local presence, safety record..."' })}
      ${fld('serviceArea', 'Where you work', u.serviceArea, { wide: true, attrs: 'maxlength="300" placeholder="e.g. Texas and Oklahoma, or nationwide"' })}
      ${fld('primaryMarkets', 'Who you sell to', u.primaryMarkets, { wide: true, attrs: 'maxlength="300" placeholder="e.g. VA medical centers, school districts, state and local agencies"' })}
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
  // `only` limits the panel to one kind of document (the Winning Voice page uses it).
  async function documentsPanel(box, onReady, only) {
    let docs = (await api('/me/documents')).documents;
    const kinds = Object.entries(DOC_KIND).filter(([v]) => (only ? v === only : v !== 'winning_proposal' || state.me.tier.key === 'enterprise'));
    let file = null;
    const draw = () => {
      box.innerHTML = `
        <div class="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label class="field flex min-w-0 cursor-pointer items-center gap-2 !py-2.5" for="doc-file">${icon('upload', 'h-4 w-4 shrink-0')}<span id="doc-name" class="truncate text-mist-400">${file ? esc(file.name) : 'Choose a PDF, Word file or photo'}</span>
            <input id="doc-file" type="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp" class="sr-only" /></label>
          <select id="doc-kind" class="field !py-2.5 ${only ? 'hidden' : ''}" aria-label="Document type">${kinds.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
          <button type="button" id="doc-up" class="btn-primary">Upload</button>
        </div>
        <ul class="mt-4 space-y-2">${docs.filter((d) => !only || d.kind === only).map((d) => `
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
        if (!/\.(pdf|docx|jpe?g|png|webp)$/i.test(f.name)) { toast('Choose a PDF, Word (.docx) file or a JPG/PNG photo.', 'error'); return; }
        if (f.size > 20 * 1024 * 1024) { toast('Files up to 20 MB are supported.', 'error'); return; }
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
      if (!file) { toast('Choose a file first.', 'error'); return; }
      const btn = $('#doc-up', box);
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';
      try {
        const kind = $('#doc-kind', box).value;
        const { id } = await api('/me/documents', { method: 'POST', body: { data: await readBase64(file), fileName: file.name, kind } });
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
      ['Upload what you have', 'Capability statement, past performance write-ups, resumes, a company overview: PDF, Word or a photo. We read them and fill in your profile for you. No documents yet? Continue to fill it in by hand.', null],
      ['Company basics', 'The facts every proposal, form and capability statement asks for.', 'company'],
      ['What you do', 'Proposals are written around this, so be specific.', 'work'],
      ['Team and track record', 'Evaluators score experience. Add every relevant project, including commercial and subcontract work.', 'team'],
    ];
    view.innerHTML = `
      <div class="mx-auto max-w-3xl">
        <p class="text-xs font-semibold uppercase tracking-widest text-brand-blueSoft">Set up your company</p>
        <h1 class="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Teach the engine about your business</h1>
        <p class="mt-2 text-mist-400">Every proposal, capability statement and bid check is written from what you add here, so this comes first. It takes about five minutes and you can change it anytime from your profile. Fields marked * are required.</p>
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
            <button type="submit" id="ob-next" class="btn-primary">Continue</button>
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
          if (hasTool('autopilot')) {
            toast('Your company is set. Now teach the Autopilot what to hunt for.');
            navigate('/autopilot?setup=1');
          } else {
            toast('Your company profile is set. Every proposal will use it.');
            navigate('/');
          }
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
            <h2 class="font-semibold text-white">Company logo</h2>
            <p class="mt-1 text-sm text-mist-400">Shown on your proposal PDF cover and at the top of every page.</p>
            <div id="logo-panel" class="mt-4"></div>
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
    logoPanel($('#logo-panel'));
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

  // Colors for the member's own capability statement (their document, so neutral, not our brand).
  const CAP_ACCENTS = {
    navy: { label: 'Navy', main: '#1B2F5E', rule: '#B8963E' },
    teal: { label: 'Teal', main: '#1F6F75', rule: '#C2A15A' },
    maroon: { label: 'Maroon', main: '#6E1E2C', rule: '#B8963E' },
    charcoal: { label: 'Charcoal', main: '#2B2F36', rule: '#8C96A3' },
  };
  const phInline = (s) => esc(s).replace(/\[(INSERT|TBD|CONFIRM)[^\]]*\]|Pending assignment/g, (m) => `<span class="cap-ph">${m}</span>`);

  /** The capability statement page: header band, intro, two columns. Classes only (strict CSP). */
  function capPage(c) {
    const ul = (items) => `<ul>${(items || []).map((x) => `<li>${phInline(x)}</li>`).join('')}</ul>`;
    return `
      <div class="cap cap-${esc(c.accent || 'navy')}">
        <header class="cap-head"><h1>${phInline(c.companyName)}</h1><p>Capability Statement</p></header>
        <p class="cap-intro">${phInline(c.overview)}</p>
        <div class="cap-cols">
          <div class="cap-main">
            <h2>Core Capabilities</h2>${ul(c.coreCapabilities)}
            ${c.capabilitiesNote ? `<p class="cap-note">${phInline(c.capabilitiesNote)}</p>` : ''}
            <h2>Core Competencies</h2><p>${(c.coreCompetencies || []).map(phInline).join(' &nbsp;•&nbsp; ')}</p>
            <h2>Differentiators</h2>${ul(c.differentiators)}
          </div>
          <aside class="cap-side">
            <h2>Company Data</h2>
            ${(c.companyData || []).map((d) => `<p><strong>${esc(d.label)}:</strong> ${phInline(d.value)}</p>`).join('')}
            ${(c.representativeClients || []).length ? `<h2>Representative Clients</h2>${ul(c.representativeClients.map((r) => (r.role ? `${r.name} — ${r.role}` : r.name)))}` : ''}
            <h2>Point of Contact</h2>
            <p class="cap-poc">${phInline(c.contact.name)}</p>
            ${c.contact.title ? `<p><em>${phInline(c.contact.title)}</em></p>` : ''}
            ${[c.contact.email, c.contact.phone, c.contact.website].filter(Boolean).map((x) => `<p>${phInline(x)}</p>`).join('')}
          </aside>
        </div>
      </div>`;
  }

  /** Same page for Word: tables and inline styles, which Word understands. */
  function capWord(c) {
    const a = CAP_ACCENTS[c.accent] || CAP_ACCENTS.navy;
    const h2 = (t) => `<p style="margin:12pt 0 4pt;padding-bottom:3pt;border-bottom:1.5pt solid ${a.rule};font-family:Georgia,serif;font-size:12pt;font-weight:bold;color:${a.main}">${esc(t).toUpperCase()}</p>`;
    const ul = (items) => `<ul style="margin:0 0 0 14pt;padding:0">${(items || []).map((x) => `<li style="margin:2pt 0">${esc(x)}</li>`).join('')}</ul>`;
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(c.companyName)} Capability Statement</title></head>
      <body style="font-family:Georgia,'Times New Roman',serif;font-size:10.5pt;color:#222">
      <table width="100%" cellpadding="10" style="border-collapse:collapse;background:${a.main}"><tr><td>
        <p style="margin:0;font-size:22pt;font-weight:bold;color:#fff">${esc(c.companyName).toUpperCase()}</p>
        <p style="margin:2pt 0 0;font-size:12pt;font-weight:bold;color:${a.rule}">Capability Statement</p></td></tr></table>
      <p style="margin:10pt 0;font-style:italic">${esc(c.overview)}</p>
      <table width="100%" cellpadding="8" style="border-collapse:collapse"><tr>
        <td width="60%" valign="top" style="border-right:1.5pt solid ${a.rule}">
          ${h2('Core Capabilities')}${ul(c.coreCapabilities)}${c.capabilitiesNote ? `<p style="font-style:italic">${esc(c.capabilitiesNote)}</p>` : ''}
          ${h2('Core Competencies')}<p>${(c.coreCompetencies || []).map(esc).join(' • ')}</p>
          ${h2('Differentiators')}${ul(c.differentiators)}
        </td>
        <td width="40%" valign="top" style="background:#F2F2F2">
          ${h2('Company Data')}${(c.companyData || []).map((d) => `<p style="margin:2pt 0"><b style="color:${a.main}">${esc(d.label)}:</b> ${esc(d.value)}</p>`).join('')}
          ${(c.representativeClients || []).length ? h2('Representative Clients') + ul(c.representativeClients.map((r) => (r.role ? `${r.name} — ${r.role}` : r.name))) : ''}
          ${h2('Point of Contact')}<p style="margin:2pt 0"><b>${esc(c.contact.name)}</b></p>${c.contact.title ? `<p style="margin:2pt 0;font-style:italic">${esc(c.contact.title)}</p>` : ''}
          ${[c.contact.email, c.contact.phone, c.contact.website].filter(Boolean).map((x) => `<p style="margin:2pt 0">${esc(x)}</p>`).join('')}
        </td></tr></table></body></html>`;
  }

  function capEditor(c) {
    const lines = (a) => esc((a || []).join('\n'));
    const ta = (name, label, value, rows, help) => `<div class="sm:col-span-2"><label class="label" for="ce-${name}">${label}</label><textarea id="ce-${name}" name="${name}" rows="${rows}" class="field">${value}</textarea>${help ? `<p class="mt-1 text-xs text-mist-500">${help}</p>` : ''}</div>`;
    const inp = (name, label, value) => `<div><label class="label" for="ce-${name}">${label}</label><input id="ce-${name}" name="${name}" class="field" value="${esc(value)}" /></div>`;
    return `<form id="cap-edit" class="grid gap-4 sm:grid-cols-2" novalidate>
      <div class="sm:col-span-2">${inp('companyName', 'Company name', c.companyName)}</div>
      ${ta('overview', 'Intro', esc(c.overview), 3)}
      ${ta('coreCapabilities', 'Core capabilities', lines(c.coreCapabilities), 6, 'One per line.')}
      ${ta('capabilitiesNote', 'Note under capabilities', esc(c.capabilitiesNote), 2)}
      ${ta('coreCompetencies', 'Core competencies', lines(c.coreCompetencies), 5, 'One per line.')}
      ${ta('differentiators', 'Differentiators', lines(c.differentiators), 5, 'One per line.')}
      ${ta('companyData', 'Company data', esc((c.companyData || []).map((d) => `${d.label}: ${d.value}`).join('\n')), 8, 'One per line, as Label: value.')}
      ${ta('representativeClients', 'Representative clients', esc((c.representativeClients || []).map((r) => (r.role ? `${r.name} — ${r.role}` : r.name)).join('\n')), 6, 'One per line, as Client — role.')}
      ${inp('contactName', 'Contact name', c.contact.name)}${inp('contactTitle', 'Contact title', c.contact.title)}
      ${inp('contactEmail', 'Email', c.contact.email)}${inp('contactPhone', 'Phone', c.contact.phone)}
      <div class="sm:col-span-2">${inp('contactWebsite', 'Website', c.contact.website)}</div>
      <div class="flex justify-end gap-2 sm:col-span-2"><button type="button" id="ce-cancel" class="btn-ghost">Cancel</button><button type="submit" class="btn-primary">Save changes</button></div>
    </form>`;
  }

  function readCapEditor(form, base) {
    const v = (n) => form.elements[n].value.trim();
    const list = (n) => v(n).split('\n').map((x) => x.trim()).filter(Boolean);
    return {
      accent: base.accent,
      companyName: v('companyName'),
      overview: v('overview'),
      coreCapabilities: list('coreCapabilities'),
      capabilitiesNote: v('capabilitiesNote'),
      coreCompetencies: list('coreCompetencies'),
      differentiators: list('differentiators'),
      companyData: list('companyData').map((l) => { const i = l.indexOf(':'); return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: 'Note', value: l }; }),
      representativeClients: list('representativeClients').map((l) => { const [name, ...role] = l.split(/\s+[—–-]\s+/); return { name: name.trim(), role: role.join(' - ').trim() }; }),
      contact: { name: v('contactName'), title: v('contactTitle'), email: v('contactEmail'), phone: v('contactPhone'), website: v('contactWebsite') },
    };
  }

  async function viewCapability(view, id) {
    const load = async () => (await api('/capability-statements/' + id)).statement;
    const st = await load();
    if (st.status === 'working') {
      view.innerHTML = working('Writing your capability statement', 'Pulling your strongest facts into one page.');
      every(4000, async () => {
        try { if ((await load()).status !== 'working') render(); } catch { /* keep polling */ }
      });
      return;
    }
    if (st.status === 'failed') {
      view.innerHTML = emptyState('This one did not finish', esc(st.error || 'Please try again.'), '<a href="/app/capability" data-link class="btn-primary">Try again</a>');
      return;
    }
    const title = (state.me.user.businessName || 'Capability') + ' Capability Statement';
    if (!st.content) {
      // Statements made before the two-column layout were plain Markdown.
      docViewer(view, { title, sub: 'Check every [INSERT] placeholder, then export.', md: st.contentMd,
        save: (md) => api('/capability-statements/' + id, { method: 'PATCH', body: { contentMd: md } }) });
      return;
    }
    let c = st.content;
    const slug = (c.companyName || 'capability').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 50) + '-capability-statement';
    const save = async (next) => {
      await api('/capability-statements/' + id, { method: 'PATCH', body: { content: next } });
      c = next;
    };
    view.innerHTML = `
      <div class="no-print">${pageHead(esc(title), 'Fix anything highlighted in red, pick a color, then download it for Word or save it as a PDF.',
        `<button id="edit" class="btn-ghost">Edit</button><button id="copy" class="btn-ghost">Copy text</button>
         <button id="word" class="btn-ghost">Download Word</button><button id="print" class="btn-primary">Print / PDF</button>`)}
        <div class="mb-4 flex flex-wrap items-center gap-2"><span class="text-sm text-mist-400">Color</span>
          ${Object.entries(CAP_ACCENTS).map(([k, a]) => `<button type="button" class="cap-swatch cap-sw-${k}" data-accent="${k}" aria-label="${a.label}" title="${a.label}"></button>`).join('')}</div></div>
      <div id="cap-view" class="print-area overflow-x-auto rounded-3xl bg-white">${capPage(c)}</div>
      <div id="cap-form" class="card no-print hidden p-6 sm:p-8"></div>`;
    const redraw = () => {
      $('#cap-view').innerHTML = capPage(c);
      $$('[data-accent]').forEach((b) => b.classList.toggle('on', b.dataset.accent === (c.accent || 'navy')));
    };
    redraw();
    $$('[data-accent]').forEach((b) => b.addEventListener('click', async () => {
      try { await save({ ...c, accent: b.dataset.accent }); redraw(); } catch (err) { toast(err.message, 'error'); }
    }));
    $('#print').addEventListener('click', () => (book ? book(content).catch((err) => toast(err.message, 'error')) : window.print()));
    $('#copy').addEventListener('click', async () => {
      const md = (await load()).contentMd;
      try { await navigator.clipboard.writeText(md); toast('Copied to clipboard.'); } catch { toast('Copy failed.', 'error'); }
    });
    $('#word').addEventListener('click', () => download(slug + '.doc', new Blob(['﻿', capWord(c)], { type: 'application/msword' })));
    $('#edit').addEventListener('click', () => {
      const box = $('#cap-form');
      box.innerHTML = capEditor(c);
      box.classList.remove('hidden');
      $('#cap-view').classList.add('hidden');
      const close = () => { box.classList.add('hidden'); $('#cap-view').classList.remove('hidden'); };
      $('#ce-cancel').addEventListener('click', close);
      $('#cap-edit').addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await save(readCapEditor(e.target, c)); close(); redraw(); toast('Saved.'); } catch (err) { toast(err.message, 'error'); }
      });
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

    // ---- 05-autopilot.js
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

  // ---- 10-shared.js
  /* Edition toolkit: shared helpers for the views in frontend/app/tools/. Spliced into app.js. */

  const num = (v) => {
    const n = Number(String(v ?? '').replace(/[$,%\s]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const money2 = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const isEnterprise = () => state.me.tier.key === 'enterprise';
  const today = () => new Date().toISOString().slice(0, 10);
  const memberName = () => state.me.user.fullName || '[INSERT: your name]';
  const memberCompany = () => state.me.user.businessName || '[INSERT: company name]';

  function addBusinessDays(iso, n) {
    const d = new Date(iso + 'T12:00:00');
    let left = n;
    while (left > 0) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) left--;
    }
    return d.toISOString().slice(0, 10);
  }

  async function copyText(text, done = 'Copied to clipboard.') {
    try { await navigator.clipboard.writeText(text); toast(done); } catch { toast('Copy failed. Select the text instead.', 'error'); }
  }

  /** Opens the member's email app with a drafted message. */
  function mailto({ to = '', bcc = '', subject = '', body = '' }) {
    const q = [bcc && `bcc=${encodeURIComponent(bcc)}`, `subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body)}`].filter(Boolean).join('&');
    const addr = to.split(',').map((t) => t.trim()).filter(Boolean).map((t) => encodeURIComponent(t).replace(/%40/g, '@')).join(',');
    window.location.href = `mailto:${addr}?${q}`;
  }

  /** Word-compatible download of an HTML fragment. */
  function wordDoc(title, bodyHtml) {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45}h1{font-size:18pt}h2{font-size:13pt;margin-top:14pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4pt;vertical-align:top}th{background:#EEE}</style></head><body>${bodyHtml}</body></html>`;
    const slug = title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'document';
    download(slug + '.doc', new Blob(['﻿', html], { type: 'application/msword' }));
  }

  function csvDownload(name, rows) {
    const cell = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s;
    };
    download(name, new Blob([rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' }));
  }

  const loadBids = async () => (await api('/bids')).bids;
  const loadSubs = async () => (await api('/subs')).items;
  const bidOptions = (bids, selected, empty = 'None') => `<option value="">${empty}</option>${bids.map((b) =>
    `<option value="${b.id}" ${String(b.id) === String(selected ?? '') ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}`;

  const verdictPill = (v) => ({
    go: '<span class="pill bg-emerald-500/15 text-emerald-300">Go</span>',
    caution: '<span class="pill bg-amber-400/15 text-amber-200">Caution</span>',
    no_go: '<span class="pill bg-brand-red/20 text-brand-redSoft">No-Go</span>',
  }[v] || '<span class="pill bg-white/[0.06] text-mist-400">Not scored</span>');

  /** A score ring drawn with CSS only (a conic gradient set through a class per 5 points). */
  const scoreRing = (score, size = 'h-20 w-20') => {
    const s = Math.max(0, Math.min(100, Math.round((Number(score) || 0) / 5) * 5));
    return `<div class="ring-score ring-${s} ${size}"><span>${Number(score) || 0}</span></div>`;
  };

  const sectionCard = (title, body, cls = '') => `<section class="card p-6 ${cls}"><h2 class="mb-3 font-semibold text-white">${title}</h2>${body}</section>`;

  const lockedTeaser = (title, body) => `
    <div class="card relative overflow-hidden p-6">
      <div class="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-blue via-[#5B3BFF] to-brand-red"></div>
      <div class="flex items-start gap-4">
        <span class="rounded-2xl bg-white/[0.06] p-2.5 text-mist-300">${icon('lock', 'h-5 w-5')}</span>
        <div><p class="font-semibold text-white">${title} <span class="pill ml-1 bg-gradient-to-r from-brand-blue/30 to-brand-red/30 text-white">Enterprise</span></p>
          <p class="mt-1 text-sm text-mist-400">${body}</p></div>
      </div>
    </div>`;

  /** Polls a list page while any row is still working. */
  const pollWhileWorking = (rows) => { if (rows.some((r) => r.status === 'working')) every(5000, () => render()); };

  // ---- 15-proposal-pdf.js
  // ------------------------------------------------------------------ Proposal PDF in the house format
  //
  // Lays a proposal out the way winning small-business proposals look: a two-column cover page
  // (submitted to, offeror, business size, title, solicitation number, response date, photos),
  // a table of contents with real page numbers, the company logo banner on every page, numbered
  // "Part N:" sections that each start a new page, blue-ruled price tables and "Page N" footers.
  // Pages are laid out here at US Letter size so the preview, the PDF and the page numbers agree.

  const BOOK_CERTS = { '8a': '8(a)', wosb: 'WOSB', sdvosb: 'SDVOSB', vosb: 'VOSB', hubzone: 'HUBZone', sdb: 'SDB' };

  /** Everything the cover and part headers need, from the solicitation summary and the profile. */
  async function proposalContext(p) {
    const [sum, logo] = await Promise.all([
      p.rfpSummaryId ? api('/decryptor/' + p.rfpSummaryId).then((r) => r.summary.summary || {}).catch(() => ({})) : {},
      api('/me/logo').then((r) => r.logo).catch(() => null),
    ]);
    const u = state.me.user;
    const has = (v) => v && !/^not stated$/i.test(String(v).trim());
    const co = sum.contracting_officer || {};
    const certs = (u.certifications || []).map((c) => BOOK_CERTS[c] || c);
    return {
      title: has(sum.title) ? sum.title : p.title.replace(/^Proposal:\s*/i, ''),
      solNumber: has(sum.solicitation_number) ? sum.solicitation_number : '[INSERT: solicitation number]',
      responseDue: has(sum.response_due) ? sum.response_due : '[INSERT: response date]',
      submittedTo: [has(co.name) && `${co.name}${has(co.title) ? `-${co.title}` : ''}`, co.email, sum.agency, co.office, co.address].filter(has),
      company: u.businessName || '[INSERT: company name]',
      offeror: [u.fullName && `${u.fullName}${u.contactTitle ? `-${u.contactTitle}` : ''}`, u.address, u.phone && `Phone: ${u.phone}`,
        u.uei && `UEI: ${u.uei}`, u.cageCode && `Cage: ${u.cageCode}`].filter(Boolean),
      email: u.email,
      website: u.website,
      size: ['Small Business', ...certs].join(', '),
      logo,
      date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    };
  }

  /** Splits the proposal Markdown into parts (one per H2), dropping the AI's own cover page. */
  function proposalParts(md) {
    const holder = document.createElement('div');
    holder.innerHTML = markdown(md);
    const parts = [];
    let cur = null;
    for (const node of [...holder.children]) {
      if (node.tagName === 'H2') {
        const name = node.textContent.replace(/^\s*(part\s*\d+\s*[:.\-–]\s*|\d+[.)]\s*)/i, '').trim();
        cur = /^cover( page)?$/i.test(name) ? null : { name, html: node.innerHTML.replace(/^\s*(part\s*\d+\s*[:.\-–]\s*|\d+[.)]\s*)/i, ''), blocks: [] };
        if (cur) parts.push(cur);
      } else if (cur && node.tagName !== 'H1') cur.blocks.push(node);
    }
    if (!parts.length) parts.push({ name: 'Proposal', html: 'Proposal', blocks: [...holder.children].filter((n) => n.tagName !== 'H1') });
    return parts;
  }

  function bookPage(ctx, cls = '') {
    const page = document.createElement('section');
    page.className = 'bp ' + cls;
    page.innerHTML = `<header class="bp-head">${ctx.logo ? `<img class="bp-logo" alt="" src="${esc(ctx.logo)}" />` : `<span class="bp-logo-box">${esc(ctx.company)}</span>`}</header>
      <div class="bp-body"></div><footer class="bp-foot"></footer>`;
    return page;
  }

  /** Flows blocks into pages, splitting long tables and lists across pages. Returns the pages. */
  function flowBlocks(book, ctx, blocks, onBlock) {
    const pages = [];
    let page;
    let body;
    const newPage = () => {
      page = bookPage(ctx);
      book.appendChild(page);
      pages.push(page);
      body = page.querySelector('.bp-body');
    };
    const fits = () => body.scrollHeight <= body.clientHeight + 1;
    newPage();
    const queue = [...blocks];
    while (queue.length) {
      const block = queue.shift();
      body.appendChild(block);
      if (fits()) { if (onBlock) onBlock(block, pages.length); continue; }
      body.removeChild(block);
      const empty = !body.children.length;
      // Tables and lists continue on the next page rather than leaving a gap or overflowing.
      if (block.tagName === 'TABLE' || block.tagName === 'UL' || block.tagName === 'OL') {
        const rowsOf = (el) => (el.tagName === 'TABLE' ? [...el.tBodies[0].rows] : [...el.children]);
        const shell = () => {
          const c = block.cloneNode(false);
          if (block.tagName === 'TABLE') { if (block.tHead) c.appendChild(block.tHead.cloneNode(true)); c.appendChild(document.createElement('tbody')); }
          return c;
        };
        const target = (el) => (el.tagName === 'TABLE' ? el.tBodies[0] : el);
        const rows = rowsOf(block);
        const first = shell();
        body.appendChild(first);
        let moved = 0;
        for (const r of rows) {
          target(first).appendChild(r);
          if (!fits()) { target(first).removeChild(r); break; }
          moved += 1;
        }
        if (moved) {
          if (onBlock) onBlock(first, pages.length);
          const rest = shell();
          rows.slice(moved).forEach((r) => target(rest).appendChild(r));
          if (rows.length > moved) { newPage(); queue.unshift(rest); }
          continue;
        }
        body.removeChild(first);
        target(block).insertBefore(rows[0], target(block).firstChild);
      }
      if (empty) {
        // Taller than a whole page: let it run over rather than loop forever.
        body.appendChild(block);
        if (onBlock) onBlock(block, pages.length);
        if (queue.length) newPage();
        continue;
      }
      // Keep a heading with what follows it.
      const last = body.lastElementChild;
      newPage();
      if (last && /^H[1-4]$/.test(last.tagName) && !last.classList.contains('bp-part')) queue.unshift(last);
      queue.unshift(block);
    }
    return pages;
  }

  const tocLine = (cls, label, page) => `<p class="${cls}"><span>${label}</span><i></i><b>${page ?? ''}</b></p>`;

  function coverPage(ctx, photos) {
    const page = document.createElement('section');
    page.className = 'bp bp-cover';
    page.innerHTML = `
      <div class="bpc-grid">
        <div class="bpc-left">
          <div class="bpc-logo">${ctx.logo ? `<img alt="" src="${esc(ctx.logo)}" />` : `<span class="bp-logo-box bp-logo-lg">${esc(ctx.company)}</span>`}</div>
          <h3>SUBMITTED TO:</h3>
          <p>${ctx.submittedTo.length ? ctx.submittedTo.map(esc).join('<br>') : '<span class="ph">[INSERT: contracting officer, agency and address]</span>'}</p>
          <h3>OFFEROR:</h3>
          <p>${[ctx.company, ...ctx.offeror].map(esc).join('<br>')}</p>
          <p class="bpc-links">${ctx.email ? `<span>${esc(ctx.email)}</span>` : ''}${ctx.website ? `<span>${esc(ctx.website)}</span>` : ''}</p>
          <h4>Business Size and Type</h4>
          <p class="bpc-size">${esc(ctx.size)}</p>
        </div>
        <div class="bpc-right">
          <h1>${esc(ctx.title)}</h1>
          <p><b>Solicitation Number</b>: ${markdownInline(ctx.solNumber)}</p>
          <p><b>Response Date</b>: ${markdownInline(ctx.responseDue)}</p>
          <div class="bpc-photos">${photos.map((src) => `<img alt="" src="${esc(src)}" />`).join('')}</div>
        </div>
      </div>`;
    return page;
  }

  const markdownInline = (s) => esc(s).replace(/\[(INSERT|TBD|CONFIRM)[^\]]*\]/g, (m) => `<span class="ph">${m}</span>`);

  /** Lays out the whole book into `book`. */
  function layoutBook(book, ctx, md, photos) {
    book.innerHTML = '';
    const parts = proposalParts(md);
    book.appendChild(coverPage(ctx, photos));

    // Table of contents first with blank page numbers, to know how many pages it takes.
    const toc = [];
    parts.forEach((part, n) => {
      toc.push({ cls: 'bp-toc1', label: `Part ${n + 1}: ${part.html}`, part: n });
      let k = 0;
      part.blocks.forEach((b) => {
        if (b.tagName !== 'H3') return;
        k += 1;
        const clean = b.innerHTML.replace(/^\s*\d+(\.\d+)*[.)]?\s+/, '');
        b.innerHTML = `${n + 1}.${k} ${clean}`;
        toc.push({ cls: 'bp-toc2', label: b.innerHTML, node: b });
      });
    });
    const tocBlocks = () => {
      const h = document.createElement('h2');
      h.className = 'bp-toc-title';
      h.textContent = 'Table of Contents';
      return [h, ...toc.map((t) => { const d = document.createElement('div'); d.innerHTML = tocLine(t.cls, t.label, t.page); return d.firstElementChild; })];
    };
    const tocPages = flowBlocks(book, ctx, tocBlocks());
    const startAt = 2 + tocPages.length; // cover is page 1

    let pageNo = startAt - 1;
    parts.forEach((part, n) => {
      const head = document.createElement('h2');
      head.className = 'bp-part';
      head.innerHTML = `Part ${n + 1}: ${part.html}`;
      const meta = document.createElement('div');
      meta.className = 'bp-meta';
      meta.innerHTML = `<p><b>Solicitation Number:</b> ${markdownInline(ctx.solNumber)}</p><p><b>Offeror:</b> ${esc(ctx.company)}</p><p><b>Date of Submission:</b> ${esc(ctx.date)}</p>`;
      const blocks = n === 0 ? [head, ...part.blocks] : [head, meta, ...part.blocks];
      const before = pageNo;
      const pages = flowBlocks(book, ctx, blocks, (block, idx) => {
        const entry = toc.find((t) => t.node === block);
        if (entry) entry.page = before + idx;
      });
      toc.find((t) => t.part === n).page = before + 1;
      pageNo = before + pages.length;
    });

    // Tables: bold the subtotal and total rows, as on a real price schedule.
    book.querySelectorAll('.bp-body table tr').forEach((tr) => {
      const first = tr.cells[0] && tr.cells[0].textContent.trim();
      if (/^(\**)?(sub)?total\b/i.test(first || '') || /^grand total/i.test(first || '')) tr.classList.add('bp-total');
    });

    // Now the real page numbers in the contents, and "Page N" on every page after the cover.
    const holder = document.createElement('div');
    book.insertBefore(holder, tocPages[0]);
    tocPages.forEach((pg) => pg.remove());
    flowBlocks(holder, ctx, tocBlocks()).forEach((pg) => book.insertBefore(pg, holder));
    holder.remove();
    [...book.querySelectorAll('.bp')].forEach((pg, i) => {
      const foot = pg.querySelector('.bp-foot');
      if (foot) foot.textContent = `Page ${i + 1}`;
    });
    return book.querySelectorAll('.bp').length;
  }

  /** Full-screen preview of the formatted proposal, with cover photos and Print / Save as PDF. */
  async function openProposalBook(p, md) {
    const ctx = await proposalContext(p);
    const photos = [];
    const wrap = document.createElement('div');
    wrap.id = 'book-wrap';
    wrap.className = 'book-wrap';
    wrap.innerHTML = `
      <div class="book-bar no-print">
        <div class="min-w-0"><p class="truncate text-sm font-semibold text-white">${esc(ctx.title)}</p><p class="text-xs text-mist-400" id="book-count"></p></div>
        <div class="flex flex-wrap gap-2">
          <label class="btn-ghost cursor-pointer">${icon('upload', 'h-4 w-4')}Cover photos<input id="book-photos" type="file" accept="image/png,image/jpeg,image/webp" multiple class="sr-only" /></label>
          <button id="book-word" class="btn-ghost">Word</button>
          <button id="book-print" class="btn-primary">Save as PDF</button>
          <button id="book-close" class="btn-ghost" aria-label="Close">&times;</button>
        </div>
      </div>
      ${ctx.logo ? '' : '<p class="book-tip no-print">Tip: add your company logo on your Profile page and it appears on the cover and every page header.</p>'}
      <div id="book" class="book"></div>`;
    document.body.appendChild(wrap);
    document.body.classList.add('book-open');
    const draw = () => { $('#book-count').textContent = `${layoutBook($('#book'), ctx, md, photos)} pages · US Letter`; };
    draw();
    const close = () => { wrap.remove(); document.body.classList.remove('book-open'); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    $('#book-close').addEventListener('click', close);
    $('#book-print').addEventListener('click', () => window.print());
    $('#book-word').addEventListener('click', () => proposalWord(ctx, md));
    $('#book-photos').addEventListener('change', async (e) => {
      const files = [...e.target.files].slice(0, 3);
      photos.length = 0;
      for (const f of files) {
        if (f.size > 6 * 1024 * 1024) { toast(`${f.name} is over 6 MB.`, 'error'); continue; }
        photos.push(await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); }));
      }
      draw();
    });
  }

  /** The same layout as a Word document: cover table, contents, one part per page. */
  function proposalWord(ctx, md) {
    const parts = proposalParts(md);
    const br = '<br clear="all" style="page-break-before:always">';
    const cover = `<table class="cover"><tr><td width="50%">${ctx.logo ? `<img src="${esc(ctx.logo)}" width="220">` : `<p class="logo">${esc(ctx.company)}</p>`}
        <h3>SUBMITTED TO:</h3><p>${ctx.submittedTo.map(esc).join('<br>') || '[INSERT: contracting officer, agency and address]'}</p>
        <h3>OFFEROR:</h3><p>${[ctx.company, ...ctx.offeror, ctx.email, ctx.website].filter(Boolean).map(esc).join('<br>')}</p>
        <h4>Business Size and Type</h4><p>${esc(ctx.size)}</p></td>
      <td width="50%" align="center"><h1>${esc(ctx.title)}</h1><p><b>Solicitation Number</b>: ${esc(ctx.solNumber)}</p><p><b>Response Date</b>: ${esc(ctx.responseDue)}</p></td></tr></table>`;
    const toc = `<h2 class="toc">Table of Contents</h2>${parts.map((pt, n) => `<p class="t1">Part ${n + 1}: ${pt.html}</p>`).join('')}`;
    const body = parts.map((pt, n) => `<h2>Part ${n + 1}: ${pt.html}</h2>${n ? `<p><b>Solicitation Number:</b> ${esc(ctx.solNumber)}<br><b>Offeror:</b> ${esc(ctx.company)}<br><b>Date of Submission:</b> ${esc(ctx.date)}</p>` : ''}${pt.blocks.map((b) => b.outerHTML).join('')}`).join(br);
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(ctx.title)}</title>
      <style>@page{size:8.5in 11in;margin:0.8in}body{font-family:'Times New Roman',Times,serif;font-size:11pt;line-height:1.3}h1{font-size:16pt;text-transform:uppercase}
      h2{font-size:14pt;color:#1F4E79;text-decoration:underline;margin-top:6pt}h3{font-size:12pt;text-decoration:underline}h4{font-size:12pt}
      table{border-collapse:collapse;width:100%}td,th{border:1.5pt solid #1F4E8C;padding:4pt;vertical-align:top}th{text-align:center}
      table.cover td{border:0;border-right:1.5pt solid #1F4E8C}.logo{background:#1F3A68;color:#fff;font-size:16pt;padding:14pt}
      .toc{color:#000}.t1{font-weight:bold;font-size:12pt}.ph{background:#FFE4E8;color:#9B0020}</style></head>
      <body>${cover}${br}${toc}${br}${body}</body></html>`;
    const slug = ctx.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'proposal';
    download(slug + '.doc', new Blob(['﻿', html], { type: 'application/msword' }));
  }

  /** Profile card: upload, preview and remove the company logo (shrunk in the browser to stay small). */
  async function logoPanel(el) {
    const { logo } = await api('/me/logo').catch(() => ({ logo: null }));
    el.innerHTML = `<div class="flex items-center gap-4">
        <div class="flex h-20 w-40 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white">${logo ? `<img alt="Your logo" src="${esc(logo)}" class="max-h-full max-w-full object-contain" />` : '<span class="text-xs text-black/50">No logo yet</span>'}</div>
        <div class="flex flex-col gap-2"><label class="btn-ghost cursor-pointer !py-1.5 !text-xs">${icon('upload', 'h-4 w-4')}${logo ? 'Replace' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg" class="sr-only" /></label>
          ${logo ? '<button type="button" class="btn-ghost !py-1.5 !text-xs" data-remove>Remove</button>' : ''}</div></div>`;
    $('input', el).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('That image could not be read.')); r.readAsDataURL(file); });
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That image could not be read.')); i.src = src; });
        const scale = Math.min(1, 900 / img.width, 360 / img.height);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let data = c.toDataURL('image/png');
        if (data.length > 380000) data = c.toDataURL('image/jpeg', 0.88);
        await api('/me/logo', { method: 'PUT', body: { logo: data } });
        toast('Logo saved. It now appears on your proposal PDFs.');
        logoPanel(el);
      } catch (err) { toast(err.message, 'error'); }
    });
    const rm = $('[data-remove]', el);
    if (rm) rm.addEventListener('click', async () => { await api('/me/logo', { method: 'PUT', body: { logo: null } }); logoPanel(el); });
  }

  // ---- 20-gonogo.js
  // ------------------------------------------------------------------ Go/No-Go Indicator

  const STATE_NAMES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
    DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
    MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
    PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
    VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  };

  /**
   * Instant checks from the member's profile, no AI: NAICS, set-aside, SAM.gov, location and
   * deadline. Shown next to the AI verdict, and on their own for briefs decrypted before it existed.
   */
  function profileChecks(d) {
    const u = state.me.user;
    const stated = (v) => v && !/^not stated$/i.test(v);
    const checks = [];
    const myNaics = (u.naics || '').match(/\d{6}/g) || [];
    const theirNaics = (d.naics || '').match(/\d{6}/g) || [];
    if (theirNaics.length) {
      const hit = theirNaics.some((n) => myNaics.includes(n));
      checks.push({ check: `NAICS ${theirNaics.join(', ')}`, status: hit ? 'pass' : 'fail',
        detail: hit ? 'It is one of your NAICS codes.' : 'Not in your profile. Add it in SAM.gov and your profile if you can perform the work, and confirm you meet its size standard.' });
    }
    const sa = (d.set_aside || '').toLowerCase();
    if (stated(d.set_aside)) {
      const has = (c) => u.certifications.includes(c);
      let need = null;
      if (/service[- ]disabled|sdvosb/.test(sa)) need = ['sdvosb', 'SDVOSB'];
      else if (/hubzone/.test(sa)) need = ['hubzone', 'HUBZone'];
      else if (/8\(a\)|8a\b/.test(sa)) need = ['8a', '8(a)'];
      else if (/women|wosb/.test(sa)) need = ['wosb', 'WOSB'];
      else if (/veteran|vosb/.test(sa)) need = ['vosb', 'VOSB'];
      if (need) {
        const ok = has(need[0]) || (need[0] === 'vosb' && has('sdvosb'));
        checks.push({ check: `Set-aside: ${d.set_aside}`, status: ok ? 'pass' : 'fail', detail: ok ? `Your profile lists ${need[1]}.` : `Requires ${need[1]} certification, which is not in your profile.` });
      } else if (/small/.test(sa)) {
        checks.push({ check: `Set-aside: ${d.set_aside}`, status: 'unknown', detail: 'Confirm you are small under the size standard for this NAICS code (SBA size standards table).' });
      } else {
        checks.push({ check: `Set-aside: ${d.set_aside}`, status: 'pass', detail: 'Open to your business.' });
      }
    }
    const due = Date.parse((d.response_due || '').replace(/(\d)(st|nd|rd|th)\b/g, '$1'));
    if (u.samStatus === 'active') {
      const exp = u.samExpiresOn && Date.parse(u.samExpiresOn);
      checks.push(exp && Number.isFinite(due) && exp < due
        ? { check: 'SAM.gov registration', status: 'fail', detail: `Your registration expires ${fmtDate(u.samExpiresOn)}, before the response is due. Renew now.` }
        : { check: 'SAM.gov registration', status: 'pass', detail: u.samExpiresOn ? `Active through ${fmtDate(u.samExpiresOn)}.` : 'Active.' });
    } else {
      checks.push({ check: 'SAM.gov registration', status: u.samStatus === 'in_progress' ? 'unknown' : 'fail',
        detail: u.samStatus === 'in_progress' ? 'In progress. It must be active before award.' : 'You must be registered and active in SAM.gov to be awarded.' });
    }
    if (stated(d.place_of_performance)) {
      const area = `${u.serviceArea || ''} ${u.address || ''}`.toLowerCase();
      const code = Object.keys(STATE_NAMES).find((c) => new RegExp(`\\b${c}\\b`).test(d.place_of_performance) || d.place_of_performance.toLowerCase().includes(STATE_NAMES[c].toLowerCase()));
      const local = /nationwide|anywhere|all 50/.test(area) || (code && (new RegExp(`\\b${code.toLowerCase()}\\b`).test(area) || area.includes(STATE_NAMES[code].toLowerCase())));
      checks.push({ check: `Place of performance: ${d.place_of_performance}`, status: local ? 'pass' : 'unknown',
        detail: local ? 'Inside the area you serve.' : 'Outside the area in your profile. Line up a local subcontractor or confirm you can staff it.' });
    }
    if (Number.isFinite(due)) {
      const days = Math.ceil((due - Date.now()) / 86400000);
      checks.push({ check: 'Time to respond', status: days < 0 ? 'fail' : days < 5 ? 'unknown' : 'pass',
        detail: days < 0 ? 'The response date has passed.' : `${days} day${days === 1 ? '' : 's'} left.` });
    }
    return checks;
  }

  const CHECK_PILL = {
    pass: '<span class="pill bg-emerald-500/15 text-emerald-300">Pass</span>',
    fail: '<span class="pill bg-brand-red/20 text-brand-redSoft">Fail</span>',
    unknown: '<span class="pill bg-amber-400/15 text-amber-200">Check</span>',
  };
  const checkTable = (rows) => `<table class="tbl"><tbody>${rows.map((c) => `<tr><td class="w-24">${CHECK_PILL[c.status] || CHECK_PILL.unknown}</td>
    <td><p class="font-medium text-white">${esc(c.check)}</p><p class="mt-0.5 text-mist-400">${esc(c.detail)}</p></td></tr>`).join('')}</tbody></table>`;

  /** The Go/No-Go panel for one decrypted solicitation. */
  function goNoGoPanel(d) {
    const g = d.go_no_go;
    const quick = profileChecks(d);
    const fails = quick.filter((c) => c.status === 'fail').length;
    const verdict = g ? g.verdict : fails ? 'no_go' : quick.some((c) => c.status === 'unknown') ? 'caution' : 'go';
    const score = g ? g.score : Math.max(5, 90 - fails * 35 - quick.filter((c) => c.status === 'unknown').length * 10);
    return `
      <section class="card mb-6 overflow-hidden">
        <div class="flex flex-wrap items-center gap-5 border-b border-white/[0.06] p-6">
          ${scoreRing(score)}
          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-mist-500">Go/No-Go</p>
            <p class="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold text-white">${verdictPill(verdict)} ${esc(g ? g.headline : fails ? 'Profile checks found a disqualifier.' : 'No disqualifiers found in your profile checks.')}</p>
            ${g && g.disqualifiers && g.disqualifiers.length ? `<ul class="mt-2 space-y-1 text-sm text-brand-redSoft">${g.disqualifiers.map((x) => `<li>• ${esc(x)}</li>`).join('')}</ul>` : ''}
          </div>
        </div>
        <div class="grid gap-0 lg:grid-cols-2">
          <div class="p-6 lg:border-r lg:border-white/[0.06]"><h3 class="mb-2 text-sm font-semibold text-mist-300">Against your profile</h3>${quick.length ? checkTable(quick) : '<p class="text-sm text-mist-500">Not enough detail in the brief.</p>'}</div>
          <div class="p-6"><h3 class="mb-2 text-sm font-semibold text-mist-300">From the full solicitation</h3>${g && g.checks && g.checks.length ? checkTable(g.checks)
            : '<p class="text-sm text-mist-500">Solicitations decrypted from now on include a full legal and technical qualification review here.</p>'}</div>
        </div>
      </section>`;
  }

  async function viewGoNoGo(view) {
    const { summaries } = await api('/decryptor');
    const ready = summaries.filter((s) => s.status === 'ready');
    view.innerHTML = `
      ${pageHead('Go/No-Go Indicator', 'Every decrypted solicitation, scored against your business profile. Bid on the ones you can win.',
        `<a href="/app/decryptor" data-link class="btn-primary">${icon('decrypt', 'h-4 w-4')}Decrypt a solicitation</a>`)}
      ${ready.length ? `<div class="grid gap-3">${ready.map((s) => `
        <a href="/app/decryptor/${s.id}" data-link class="card card-hover flex items-center gap-5 p-5">
          ${scoreRing(s.score ?? 0, 'h-14 w-14')}
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2"><span class="truncate font-semibold text-white">${esc(s.title || s.fileName)}</span>${verdictPill(s.verdict)}</p>
            <p class="mt-1 truncate text-sm text-mist-400">${esc(s.headline || [s.agency, s.setAside].filter((x) => x && !/^not stated$/i.test(x)).join(' · ') || 'Open to see the profile checks')}</p>
          </div>
          <span class="hidden text-right text-xs text-mist-500 sm:block">${s.responseDue ? 'Due<br>' + esc(s.responseDue) : ''}</span>
        </a>`).join('')}</div>`
        : emptyState('Nothing to score yet', 'Decrypt a solicitation and the Go/No-Go Indicator checks it against your set-aside status, NAICS codes, SAM.gov registration, location and deadline.',
          '<a href="/app/decryptor" data-link class="btn-primary">Decrypt a solicitation</a>')}`;
  }

  // ---- 30-matchmaker.js
  // ------------------------------------------------------------------ Predictive Bid Matchmaker (Enterprise)

  const toIsoDate = (v) => {
    const t = Date.parse(v || '');
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
  };

  async function viewMatchmaker(view) {
    view.innerHTML = `${pageHead('Predictive Bid Matchmaker', 'Open federal opportunities for your NAICS codes, ranked by how likely you are to win them.')}
      <div class="card flex items-center justify-center gap-3 p-10 text-mist-400"><span class="spinner"></span>Searching SAM.gov for your matches</div>`;
    let data;
    try {
      data = await api('/matchmaker');
    } catch (err) {
      view.innerHTML = pageHead('Predictive Bid Matchmaker', '') + emptyState('SAM.gov did not answer', esc(err.message), '<button id="retry" class="btn-primary">Try again</button>');
      $('#retry').addEventListener('click', () => render());
      return;
    }
    if (!data.configured) {
      view.innerHTML = pageHead('Predictive Bid Matchmaker', '') + emptyState('Matchmaker is being switched on', 'Your matches will appear here as soon as the SAM.gov connection is live.');
      return;
    }
    if (data.needsNaics) {
      view.innerHTML = pageHead('Predictive Bid Matchmaker', '') + emptyState('Add your NAICS codes', 'The Matchmaker searches SAM.gov with the 6-digit NAICS codes in your profile.', '<a href="/app/profile" data-link class="btn-primary">Open profile</a>');
      return;
    }
    let filter = 'all';
    const draw = () => {
      const list = data.matches.filter((o) => filter === 'all' || (filter === 'setaside' && o.reasons.some((r) => /you qualify/.test(r))) ||
        (filter === 'soon' && o.responseDeadline && Date.parse(o.responseDeadline) - Date.now() < 14 * 86400000));
      view.innerHTML = `
        ${pageHead('Predictive Bid Matchmaker', `Open opportunities posted in the last 30 days for NAICS ${data.codes.map(esc).join(', ')}, best fit first.`)}
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div class="seg" role="tablist">${[['all', 'All matches'], ['setaside', 'Set-asides you qualify for'], ['soon', 'Due in 2 weeks']].map(([k, l]) =>
            `<button type="button" data-f="${k}" class="${filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <p class="text-sm text-mist-500">${list.length} of ${data.matches.length} shown · refreshed every 6 hours</p>
        </div>
        ${list.length ? `<div class="grid gap-3">${list.map((o, i) => `
          <article class="card p-5">
            <div class="flex flex-wrap items-start gap-5">
              ${scoreRing(o.score, 'h-14 w-14')}
              <div class="min-w-0 flex-1">
                <p class="font-semibold leading-snug text-white">${esc(o.title)}</p>
                <p class="mt-1 text-sm text-mist-400">${esc([o.agency, o.office].filter(Boolean).join(' · '))}</p>
                <div class="mt-2.5 flex flex-wrap gap-1.5">
                  <span class="pill bg-white/[0.06] text-mist-300">${esc(o.type || 'Notice')}</span>
                  ${o.setAside ? `<span class="pill bg-brand-blue/15 text-brand-blueSoft">${esc(o.setAside)}</span>` : ''}
                  ${o.state ? `<span class="pill bg-white/[0.06] text-mist-300">${esc([o.city, o.state].filter(Boolean).join(', '))}</span>` : ''}
                  ${o.responseDeadline ? `<span class="pill bg-white/[0.06] text-mist-300">${icon('cal', 'h-3 w-3')}Due ${fmtDate(toIsoDate(o.responseDeadline))}</span>` : ''}
                </div>
                <ul class="mt-3 space-y-1 text-sm text-mist-400">${o.reasons.map((r) => `<li>• ${esc(r)}</li>`).join('')}</ul>
              </div>
              <div class="flex shrink-0 flex-col gap-2">
                <button type="button" class="btn-primary" data-add="${i}">${icon('crm', 'h-4 w-4')}Add to Bid CRM</button>
                <a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer" class="btn-ghost">Open on SAM.gov</a>
              </div>
            </div>
          </article>`).join('')}</div>`
          : emptyState('No matches with this filter', 'Try another filter, or add more NAICS codes to your profile.')}`;
      $$('[data-f]', view).forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; draw(); }));
      $$('[data-add]', view).forEach((b) => b.addEventListener('click', async () => {
        const o = list[Number(b.dataset.add)];
        b.disabled = true;
        try {
          await api('/bids', { method: 'POST', body: {
            title: o.title.slice(0, 200), agency: o.agency.slice(0, 200), solicitationNumber: (o.solicitationNumber || '').slice(0, 100),
            naics: o.naics, setAside: (o.setAside || '').slice(0, 60), placeOfPerformance: [o.city, o.state].filter(Boolean).join(', '),
            dueAt: toIsoDate(o.responseDeadline) || null, stage: 'qualifying',
            notes: `Found by the Predictive Bid Matchmaker (fit score ${o.score}).\n${o.url}${o.contact ? `\nContact: ${o.contact}` : ''}`,
          } });
          b.innerHTML = 'Added';
          toast('Added to your Bid CRM.');
        } catch (err) { b.disabled = false; toast(err.message, 'error'); }
      }));
    };
    draw();
  }

  // ---- 40-subs.js
  // ------------------------------------------------------------------ Smart Vendor Scraper and saved subcontractors

  const US_STATES = Object.keys(STATE_NAMES);

  function subModal(sub, bids, onSaved) {
    const s = sub || {};
    const f = (name, label, value, attrs = '') => `<div><label class="label" for="sm-${name}">${label}</label><input id="sm-${name}" name="${name}" class="field" value="${esc(value ?? '')}" ${attrs} /></div>`;
    const m = openModal(`
      <form id="sub-form" novalidate>
        <div class="mb-5 flex items-start justify-between"><h2 class="text-xl font-semibold text-white">${sub ? 'Subcontractor' : 'Add a subcontractor'}</h2>
          <button type="button" data-close class="text-2xl leading-none text-mist-400 hover:text-white" aria-label="Close">&times;</button></div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">${f('company', 'Company *', s.company, 'maxlength="200"')}</div>
          ${f('contactName', 'Contact name', s.contactName, 'maxlength="120"')}${f('trade', 'Trade or service', s.trade, 'maxlength="120" placeholder="e.g. Janitorial"')}
          ${f('email', 'Email', s.email, 'type="email" maxlength="254"')}${f('phone', 'Phone', s.phone, 'maxlength="40"')}
          ${f('location', 'Location', s.location, 'maxlength="200"')}${f('website', 'Website', s.website, 'maxlength="200"')}
          ${f('uei', 'UEI', s.uei, 'maxlength="12"')}${f('quote', 'Their quote ($)', s.quote, 'inputmode="decimal"')}
          <div class="sm:col-span-2"><label class="label" for="sm-bid">For opportunity</label><select id="sm-bid" name="bidId" class="field">${bidOptions(bids, s.bidId)}</select></div>
          <div class="sm:col-span-2"><label class="label" for="sm-notes">Notes</label><textarea id="sm-notes" name="notes" rows="3" class="field">${esc(s.notes || '')}</textarea></div>
        </div>
        ${errBox('sub-error')}
        <div class="mt-6 flex flex-wrap justify-between gap-2">
          <div>${sub ? '<button type="button" id="sub-del" class="btn-danger">Delete</button>' : ''}</div>
          <div class="flex gap-2"><button type="button" data-close class="btn-ghost">Cancel</button><button type="submit" class="btn-primary">Save</button></div>
        </div>
      </form>`);
    const form = $('#sub-form', m.el);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form));
      body.bidId = body.bidId || null;
      try {
        if (sub) await api('/subs/' + sub.id, { method: 'PATCH', body });
        else await api('/subs', { method: 'POST', body: { ...body, source: 'manual' } });
        m.close();
        onSaved();
      } catch (err) { showMsg('sub-error', err.message); }
    });
    const del = $('#sub-del', m.el);
    if (del) del.addEventListener('click', async () => {
      if (!confirm(`Delete ${sub.company}?`)) return;
      try { await api('/subs/' + sub.id, { method: 'DELETE' }); m.close(); onSaved(); } catch (err) { toast(err.message, 'error'); }
    });
  }

  const subRow = (s, bids) => {
    const bid = bids.find((b) => b.id === s.bidId);
    return `<tr data-sub="${s.id}" class="cursor-pointer hover:bg-white/[0.03]">
      <td><p class="font-medium text-white">${esc(s.company)}</p><p class="text-xs text-mist-500">${esc([s.contactName, s.trade].filter(Boolean).join(' · '))}</p></td>
      <td class="text-mist-300">${esc([s.email, s.phone].filter(Boolean).join(' · ') || '—')}</td>
      <td class="text-mist-300">${esc(s.location || '—')}</td>
      <td class="text-mist-300">${bid ? esc(bid.title) : '—'}</td>
      <td class="text-right text-white">${s.quote ? money2(s.quote) : '—'}</td></tr>`;
  };

  async function viewVendors(view) {
    const [bids, subs] = await Promise.all([loadBids(), loadSubs()]);
    const myNaics = (state.me.user.naics || '').match(/\d{6}/g) || [];
    const ent = hasTool('sub_vetting');
    const homeState = US_STATES.find((c) => new RegExp(`\\b${c}\\b`).test(state.me.user.address || '')) || '';
    view.innerHTML = `
      ${pageHead('Smart Vendor Scraper', 'Find subcontractors for the job by NAICS code and location, then save them to quote, team and track.',
        `<button id="add-sub" class="btn-ghost">${icon('plus', 'h-4 w-4')}Add manually</button>`)}
      <div class="grid items-start gap-6 xl:grid-cols-5">
        <section class="card p-6 xl:col-span-3">
          <h2 class="font-semibold text-white">SAM.gov registered businesses</h2>
          <p class="mt-1 text-sm text-mist-400">Active registrants ready to work on federal contracts, with UEI and CAGE for your teaming paperwork.</p>
          <form id="sam-search" class="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" novalidate>
            <div><label class="label" for="vs-naics">NAICS code</label><input id="vs-naics" class="field" list="vs-naics-list" inputmode="numeric" maxlength="6" value="${esc(myNaics[0] || '')}" placeholder="e.g. 561720" />
              <datalist id="vs-naics-list">${myNaics.map((n) => `<option value="${n}">`).join('')}</datalist></div>
            <div><label class="label" for="vs-state">State where the work is</label><select id="vs-state" class="field"><option value="">Choose</option>${US_STATES.map((c) => `<option value="${c}" ${c === homeState ? 'selected' : ''}>${STATE_NAMES[c]}</option>`).join('')}</select></div>
            <div class="flex items-end"><button class="btn-primary w-full" type="submit">${icon('users', 'h-4 w-4')}Search</button></div>
          </form>
          <div id="sam-results" class="mt-5"></div>
        </section>
        <div class="xl:col-span-2">
          ${ent ? `<section class="card p-6">
              <h2 class="font-semibold text-white">Top-rated local businesses</h2>
              <p class="mt-1 text-sm text-mist-400">Highly reviewed private companies near the job, with phone and website. Many are not in SAM.gov yet and make great subs.</p>
              <form id="places-search" class="mt-4 space-y-3" novalidate>
                <div><label class="label" for="ps-trade">Trade or service</label><input id="ps-trade" class="field" maxlength="80" placeholder="e.g. commercial janitorial" /></div>
                <div><label class="label" for="ps-where">City and state, or ZIP code</label><input id="ps-where" class="field" maxlength="120" placeholder="e.g. Dallas, TX" /></div>
                <button class="btn-primary w-full" type="submit">${icon('target', 'h-4 w-4')}Find top-rated subs</button>
              </form>
              <div id="places-results" class="mt-5"></div>
            </section>`
            : lockedTeaser('Top-rated local subcontractors', 'Enterprise adds the best-reviewed private businesses near the job, with phone numbers and websites, ranked by rating.')}
        </div>
      </div>
      <section class="card mt-6 p-6">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 class="font-semibold text-white">Your subcontractors (${subs.length})</h2>
          <div class="flex gap-2">${subs.length ? '<button id="subs-csv" class="btn-ghost !py-1.5 !text-xs">Export CSV</button>' : ''}<a href="/app/outreach" data-link class="btn-ghost !py-1.5 !text-xs">${icon('mail', 'h-3.5 w-3.5')}Request quotes</a></div></div>
        ${subs.length ? `<div class="overflow-x-auto"><table class="tbl min-w-[760px]"><thead><tr><th>Company</th><th>Contact</th><th>Location</th><th>Opportunity</th><th class="text-right">Quote</th></tr></thead>
          <tbody>${subs.map((s) => subRow(s, bids)).join('')}</tbody></table></div>`
          : '<p class="text-sm text-mist-500">Search above and save the ones you like, or add a sub you already know.</p>'}
      </section>`;

    $('#add-sub').addEventListener('click', () => subModal(null, bids, render));
    $$('[data-sub]', view).forEach((tr) => tr.addEventListener('click', () => subModal(subs.find((s) => String(s.id) === tr.dataset.sub), bids, render)));
    const csv = $('#subs-csv');
    if (csv) csv.addEventListener('click', () => csvDownload('subcontractors.csv', [['Company', 'Contact', 'Email', 'Phone', 'Trade', 'Location', 'Website', 'UEI', 'CAGE', 'Quote', 'Source'],
      ...subs.map((s) => [s.company, s.contactName, s.email, s.phone, s.trade, s.location, s.website, s.uei, s.cage, s.quote, s.source])]));

    const save = async (btn, body) => {
      btn.disabled = true;
      try { await api('/subs', { method: 'POST', body }); btn.textContent = 'Saved'; toast(`${body.company} saved to your subcontractors.`); } catch (err) { btn.disabled = false; toast(err.message, 'error'); }
    };

    $('#sam-search').addEventListener('submit', async (e) => {
      e.preventDefault();
      const out = $('#sam-results');
      const naics = $('#vs-naics').value.trim();
      const st = $('#vs-state').value;
      out.innerHTML = '<div class="flex items-center gap-2 text-sm text-mist-400"><span class="spinner"></span>Searching SAM.gov</div>';
      try {
        const r = await api(`/vendors/search?naics=${encodeURIComponent(naics)}&state=${encodeURIComponent(st)}`);
        if (!r.configured) { out.innerHTML = '<p class="text-sm text-amber-200">SAM.gov search is being switched on. Try again shortly.</p>'; return; }
        if (!r.entities.length) { out.innerHTML = '<p class="text-sm text-mist-500">No active registrants for that NAICS code in that state. Try a related code or a neighboring state.</p>'; return; }
        out.innerHTML = `<p class="mb-2 text-xs text-mist-500">Showing ${r.entities.length} of ${r.total.toLocaleString()} active registrants.</p>
          <ul class="space-y-2">${r.entities.map((x, i) => `<li class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <span class="min-w-0"><span class="block font-medium text-white">${esc(x.company)}</span>
              <span class="text-xs text-mist-500">${esc([x.location, x.uei && 'UEI ' + x.uei, x.cage && 'CAGE ' + x.cage, x.contactName].filter(Boolean).join(' · '))}</span></span>
            <span class="flex gap-2">${x.website ? `<a class="btn-ghost !px-3 !py-1.5 !text-xs" href="${esc(/^https?:/.test(x.website) ? x.website : 'https://' + x.website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}
              <button type="button" class="btn-primary !px-3 !py-1.5 !text-xs" data-save-sam="${i}">Save</button></span></li>`).join('')}</ul>`;
        $$('[data-save-sam]', out).forEach((b) => b.addEventListener('click', () => {
          const x = r.entities[Number(b.dataset.saveSam)];
          save(b, { company: x.company, contactName: x.contactName || null, uei: x.uei || null, cage: x.cage || null, location: x.location || null,
            website: x.website || null, trade: `NAICS ${naics}`, source: 'sam' });
        }));
      } catch (err) { out.innerHTML = `<p class="text-sm text-brand-redSoft">${esc(err.message)}</p>`; }
    });

    const ps = $('#places-search');
    if (ps) ps.addEventListener('submit', async (e) => {
      e.preventDefault();
      const out = $('#places-results');
      out.innerHTML = '<div class="flex items-center gap-2 text-sm text-mist-400"><span class="spinner"></span>Finding top-rated businesses</div>';
      try {
        const trade = $('#ps-trade').value.trim();
        const r = await api(`/vendors/top-rated?trade=${encodeURIComponent(trade)}&where=${encodeURIComponent($('#ps-where').value.trim())}`);
        if (!r.configured) { out.innerHTML = '<p class="text-sm text-amber-200">Top-rated search is being switched on. Try again shortly.</p>'; return; }
        if (!r.places.length) { out.innerHTML = '<p class="text-sm text-mist-500">No businesses found. Try a broader trade or a nearby city.</p>'; return; }
        out.innerHTML = `<ul class="space-y-2">${r.places.map((p, i) => `<li class="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div class="flex items-start justify-between gap-3"><span class="min-w-0"><span class="block font-medium text-white">${esc(p.company)}</span>
            <span class="text-xs text-amber-200">${p.rating ? `★ ${p.rating.toFixed(1)}` : 'No rating'} <span class="text-mist-500">(${p.reviews} reviews)</span></span>
            <span class="block text-xs text-mist-500">${esc(p.location)}</span>
            ${p.phone ? `<span class="block text-xs text-mist-300">${esc(p.phone)}</span>` : ''}</span>
            <button type="button" class="btn-primary shrink-0 !px-3 !py-1.5 !text-xs" data-save-pl="${i}">Save</button></div>
          <div class="mt-2 flex gap-3 text-xs">${p.website ? `<a class="accent-text hover:text-white" href="${esc(p.website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}${p.mapsUrl ? `<a class="accent-text hover:text-white" href="${esc(p.mapsUrl)}" target="_blank" rel="noopener noreferrer">Map and reviews</a>` : ''}</div></li>`).join('')}</ul>
          <p class="mt-3 text-[11px] text-mist-500">Business listings from Google. Ask each sub for their email when you call.</p>`;
        $$('[data-save-pl]', out).forEach((b) => b.addEventListener('click', () => {
          const p = r.places[Number(b.dataset.savePl)];
          save(b, { company: p.company, phone: p.phone || null, website: p.website || null, location: p.location || null, rating: p.rating, trade, source: 'places' });
        }));
      } catch (err) { out.innerHTML = `<p class="text-sm text-brand-redSoft">${esc(err.message)}</p>`; }
    });
  }

  // ------------------------------------------------------------------ 1-Click Outreach Sequences

  const OUTREACH_STEPS = [
    { key: 'rfq', label: 'Request for quote', day: 0 },
    { key: 'follow', label: 'Follow-up', day: 3 },
    { key: 'last', label: 'Last call', day: 6 },
  ];

  function outreachEmail(stepKey, sub, bid) {
    const u = state.me.user;
    const hi = sub && sub.contactName ? `Hi ${sub.contactName.split(' ')[0]},` : 'Hello,';
    const job = bid ? bid.title : '[INSERT: project name]';
    const where = bid && bid.placeOfPerformance ? ` in ${bid.placeOfPerformance}` : '';
    const quoteBy = bid && bid.dueAt ? fmtDate(addBusinessDays(new Date(Date.parse(bid.dueAt) - 5 * 86400000).toISOString().slice(0, 10), 0)) : '[INSERT: quote deadline]';
    const sol = bid && bid.solicitationNumber ? ` (solicitation ${bid.solicitationNumber})` : '';
    const agency = bid && bid.agency ? ` for ${bid.agency}` : '';
    const sig = [memberName(), u.contactTitle, memberCompany(), u.phone, u.email].filter(Boolean).join('\n');
    if (stepKey === 'rfq') return {
      subject: `Quote request: ${job}${sol}`,
      body: `${hi}

${memberCompany()} is preparing a bid on a government contract${agency}: ${job}${sol}${where}. We are looking for a qualified ${sub && sub.trade ? sub.trade.replace(/^NAICS /, 'NAICS ') + ' ' : ''}partner to perform the work as our subcontractor, and your company stood out.

Could you send us a quote by ${quoteBy}? Please include:
• Your price (unit prices or a lump sum) and what it covers
• Your availability and start date
• Proof of insurance and any licenses or certifications required
• Your UEI if you are registered in SAM.gov (not required to quote)

I'm happy to send the scope of work and drawings, or set up a quick call.

Thank you,
${sig}`,
    };
    if (stepKey === 'follow') return {
      subject: `Following up: quote for ${job}`,
      body: `${hi}

Following up on my note about ${job}${sol}${where}. We would still like to include your company in our bid. Could you send a quote, or let me know if you need anything from us, by ${quoteBy}?

Thank you,
${sig}`,
    };
    return {
      subject: `Last call: quote for ${job}`,
      body: `${hi}

We are finalizing pricing for ${job}${sol} and need quotes by ${quoteBy}. If you would like to be considered, please reply with your price and availability. If now is not a good time, no problem; we will keep you in mind for the next one.

Thank you,
${sig}`,
    };
  }

  async function viewOutreach(view) {
    const [bids, subs] = await Promise.all([loadBids(), loadSubs()]);
    const params = new URLSearchParams(location.search);
    let bidId = params.get('bid') || (bids.find((b) => !['won', 'lost', 'submitted'].includes(b.stage)) || {}).id || '';
    const draw = () => {
      const bid = bids.find((b) => String(b.id) === String(bidId)) || null;
      const list = subs.filter((s) => !bid || !s.bidId || s.bidId === bid.id);
      view.innerHTML = `
        ${pageHead('1-Click Outreach Sequences', 'Three-step quote requests, filled in with the contract and each subcontractor. Send from your own email so replies come to you.')}
        <div class="card mb-6 grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div><label class="label" for="ob-bid">Opportunity</label><select id="ob-bid" class="field">${bidOptions(bids, bidId, 'General (no opportunity)')}</select></div>
          <button id="ob-all" class="btn-primary" ${list.some((s) => s.email) ? '' : 'disabled'}>${icon('mail', 'h-4 w-4')}Email all with an address (BCC)</button>
        </div>
        ${list.length ? `<div class="grid gap-3">${list.map((s) => {
          const sent = s.outreach || {};
          const next = OUTREACH_STEPS.find((st) => !sent[st.key]);
          const firstSent = sent.rfq;
          return `<article class="card p-5" data-sub="${s.id}">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0"><p class="font-semibold text-white">${esc(s.company)}</p>
                <p class="text-sm text-mist-400">${esc([s.contactName, s.email || 'No email yet', s.phone].filter(Boolean).join(' · '))}</p></div>
              ${s.quote ? `<span class="pill bg-emerald-500/15 text-emerald-300">Quoted ${money2(s.quote)}</span>` : next ? `<span class="pill bg-white/[0.06] text-mist-300">Next: ${next.label}${firstSent && next.day ? ` · ${fmtDate(addBusinessDays(firstSent, next.day))}` : ''}</span>` : '<span class="pill bg-white/[0.06] text-mist-400">Sequence done</span>'}
            </div>
            <ol class="mt-4 grid gap-2 sm:grid-cols-3">${OUTREACH_STEPS.map((st) => `
              <li class="rounded-2xl border ${sent[st.key] ? 'border-emerald-400/20 bg-emerald-500/5' : 'border-white/[0.06] bg-white/[0.02]'} p-3">
                <p class="text-xs font-semibold uppercase tracking-wider ${sent[st.key] ? 'text-emerald-300' : 'text-mist-500'}">Day ${st.day} · ${st.label}</p>
                <p class="mt-1 text-xs text-mist-500">${sent[st.key] ? `Sent ${fmtDate(sent[st.key])}` : 'Not sent'}</p>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" class="btn-ghost !px-2.5 !py-1 !text-xs" data-send="${st.key}" ${s.email ? '' : 'disabled title="Add their email first"'}>Open email</button>
                  <button type="button" class="btn-ghost !px-2.5 !py-1 !text-xs" data-copy="${st.key}">Copy</button>
                  <button type="button" class="btn-ghost !px-2.5 !py-1 !text-xs" data-mark="${st.key}">${sent[st.key] ? 'Undo' : 'Mark sent'}</button>
                </div></li>`).join('')}</ol>
            <div class="mt-3 flex items-center gap-2"><label class="text-xs text-mist-500" for="q-${s.id}">Quote received ($)</label>
              <input id="q-${s.id}" class="field !w-40 !py-1.5 !text-sm" inputmode="decimal" value="${esc(s.quote ?? '')}" data-quote /></div>
          </article>`;
        }).join('')}</div>`
          : emptyState('No subcontractors yet', 'Find subs with the Smart Vendor Scraper or add one you know, then come back to request quotes.', '<a href="/app/vendors" data-link class="btn-primary">Find subcontractors</a>')}`;

      $('#ob-bid').addEventListener('change', (e) => { bidId = e.target.value; draw(); });
      const patchOutreach = async (s, key, on) => {
        const next = { ...(s.outreach || {}) };
        if (on) next[key] = today(); else delete next[key];
        await api('/subs/' + s.id, { method: 'PATCH', body: { outreach: next } });
        s.outreach = next;
      };
      $$('[data-sub]', view).forEach((card) => {
        const s = subs.find((x) => String(x.id) === card.dataset.sub);
        $$('[data-send]', card).forEach((b) => b.addEventListener('click', async () => {
          const mail = outreachEmail(b.dataset.send, s, bid);
          mailto({ to: s.email, ...mail });
          try { await patchOutreach(s, b.dataset.send, true); setTimeout(draw, 400); } catch (err) { toast(err.message, 'error'); }
        }));
        $$('[data-copy]', card).forEach((b) => b.addEventListener('click', () => {
          const mail = outreachEmail(b.dataset.copy, s, bid);
          copyText(`Subject: ${mail.subject}\n\n${mail.body}`, 'Email copied. Paste it into your email app.');
        }));
        $$('[data-mark]', card).forEach((b) => b.addEventListener('click', async () => {
          try { await patchOutreach(s, b.dataset.mark, !(s.outreach || {})[b.dataset.mark]); draw(); } catch (err) { toast(err.message, 'error'); }
        }));
        $('[data-quote]', card).addEventListener('change', async (e) => {
          try { await api('/subs/' + s.id, { method: 'PATCH', body: { quote: e.target.value } }); s.quote = e.target.value ? num(e.target.value) : null; toast('Quote saved.'); draw(); } catch (err) { toast(err.message, 'error'); }
        });
      });
      $('#ob-all').addEventListener('click', async () => {
        const targets = list.filter((s) => s.email && !(s.outreach || {}).rfq);
        const pool = targets.length ? targets : list.filter((s) => s.email);
        const mail = outreachEmail('rfq', null, bid);
        mailto({ bcc: pool.map((s) => s.email).join(','), ...mail });
        try { await Promise.all(pool.map((s) => patchOutreach(s, 'rfq', true))); setTimeout(draw, 400); } catch (err) { toast(err.message, 'error'); }
      });
    };
    draw();
  }

  // ---- 50-foia.js
  // ------------------------------------------------------------------ FOIA Automator

  const FOIA_AGENCIES = [
    'Department of Veterans Affairs', 'Department of Defense', 'Department of the Army', 'Department of the Navy', 'Department of the Air Force',
    'Defense Logistics Agency', 'General Services Administration', 'Department of Homeland Security', 'Department of Health and Human Services',
    'Department of Agriculture', 'Department of the Interior', 'Department of Energy', 'Department of Justice', 'Department of Transportation',
    'Department of Commerce', 'Department of State', 'Department of the Treasury', 'Department of Labor', 'Department of Education',
    'Department of Housing and Urban Development', 'Environmental Protection Agency', 'National Aeronautics and Space Administration',
    'Small Business Administration', 'Social Security Administration', 'U.S. Army Corps of Engineers', 'Federal Bureau of Prisons',
    'National Park Service', 'U.S. Forest Service', 'Indian Health Service', 'U.S. Coast Guard',
  ];

  const FOIA_WANTS = {
    award: 'A copy of the awarded contract, including the price schedule (Section B) and any modifications',
    proposal: 'The winning offeror\'s price proposal and technical proposal, with exempt material redacted',
    abstract: 'The price abstract or bid tabulation listing every offeror\'s total price',
    evaluation: 'The source selection decision document and the evaluation of the winning offer',
  };

  const STATUS_PILL = {
    draft: '<span class="pill bg-white/[0.06] text-mist-300">Draft</span>',
    sent: '<span class="pill bg-brand-blue/15 text-brand-blueSoft">Sent</span>',
    received: '<span class="pill bg-emerald-500/15 text-emerald-300">Received</span>',
  };

  function foiaLetter(f) {
    const u = state.me.user;
    const wants = (f.wants || []).map((k) => `- ${FOIA_WANTS[k]}`).join('\n');
    return `${fmtDate(today())}

FOIA Officer
${f.agency}${f.office ? `\n${f.office}` : ''}

Re: Freedom of Information Act Request, ${f.subject}

Dear FOIA Officer:

Under the Freedom of Information Act, 5 U.S.C. § 552, I request copies of the following records relating to ${f.contractNumber ? `contract number ${f.contractNumber}` : 'the contract described below'}${f.solicitationNumber ? `, awarded under solicitation ${f.solicitationNumber}` : ''}${f.awardee ? `, awarded to ${f.awardee}` : ''}:

${wants || '- [INSERT: the records you want]'}
${f.extra ? `\nAdditional detail: ${f.extra}\n` : ''}
I understand that information protected under Exemption 4 (trade secrets and confidential commercial information) may be withheld. Please release all reasonably segregable portions, including unit and total prices, which are routinely released once a contract is awarded.

I am a small business requesting these records for commercial use, and I agree to pay fees up to $${num(f.feeLimit) || 50}. Please contact me before incurring fees above that amount. I prefer to receive the records electronically by email.

If you deny any part of this request, please cite the specific exemption and tell me how to appeal.

Thank you for your help.

Sincerely,

${memberName()}
${memberCompany()}
${[u.address].filter(Boolean).join('\n')}
${[u.phone, u.email].filter(Boolean).join(' · ')}`;
  }

  function foiaModal(item, bids, onSaved) {
    const f = Object.assign({ wants: ['award', 'abstract'], feeLimit: 50 }, item ? item.data : {}, item ? { agency: item.agency, subject: item.subject } : {});
    openModal(`
      <h2 class="text-lg font-semibold text-white">${item ? 'Edit FOIA request' : 'New FOIA request'}</h2>
      <p class="mt-1 text-sm text-mist-400">Ask for the winning price on a past contract so you know the price to beat next time.</p>
      <form id="foia-form" class="mt-5 space-y-4" novalidate>
        <div class="grid gap-4 sm:grid-cols-2">
          <div><label class="label" for="ff-agency">Agency</label><input id="ff-agency" name="agency" class="field" list="ff-agencies" maxlength="200" required value="${esc(f.agency)}" />
            <datalist id="ff-agencies">${FOIA_AGENCIES.map((a) => `<option value="${esc(a)}"></option>`).join('')}</datalist></div>
          <div><label class="label" for="ff-office">Office or contracting activity (optional)</label><input id="ff-office" name="office" class="field" maxlength="200" value="${esc(f.office)}" /></div>
          <div class="sm:col-span-2"><label class="label" for="ff-subject">What contract is this about?</label><input id="ff-subject" name="subject" class="field" maxlength="300" required placeholder="e.g. Grounds maintenance, VA Medical Center Tampa" value="${esc(f.subject)}" /></div>
          <div><label class="label" for="ff-contract">Contract or award number</label><input id="ff-contract" name="contractNumber" class="field" maxlength="80" value="${esc(f.contractNumber)}" /></div>
          <div><label class="label" for="ff-sol">Solicitation number</label><input id="ff-sol" name="solicitationNumber" class="field" maxlength="80" value="${esc(f.solicitationNumber)}" /></div>
          <div><label class="label" for="ff-awardee">Awardee (if known)</label><input id="ff-awardee" name="awardee" class="field" maxlength="200" value="${esc(f.awardee)}" /></div>
          <div><label class="label" for="ff-bid">Link to opportunity</label><select id="ff-bid" name="bidId" class="field">${bidOptions(bids, item && item.bidId)}</select></div>
        </div>
        <fieldset><legend class="label">Records to request</legend><div class="grid gap-2">${Object.entries(FOIA_WANTS).map(([k, l]) =>
          `<label class="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-mist-200"><input type="checkbox" name="wants" value="${k}" class="mt-0.5" ${f.wants.includes(k) ? 'checked' : ''} />${esc(l)}</label>`).join('')}</div></fieldset>
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="sm:col-span-2"><label class="label" for="ff-extra">Anything else (optional)</label><input id="ff-extra" name="extra" class="field" maxlength="500" value="${esc(f.extra)}" /></div>
          <div><label class="label" for="ff-fee">Fee limit ($)</label><input id="ff-fee" name="feeLimit" class="field" inputmode="decimal" value="${esc(f.feeLimit)}" /></div>
        </div>
        <p id="ff-error" class="hidden text-sm text-brand-redSoft" role="alert"></p>
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" data-close>Cancel</button><button type="submit" class="btn-primary">Write the letter</button></div>
      </form>`);
    const form = $('#foia-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = (n) => form.elements[n].value.trim();
      const data = { office: v('office'), contractNumber: v('contractNumber'), solicitationNumber: v('solicitationNumber'), awardee: v('awardee'),
        extra: v('extra'), feeLimit: v('feeLimit'), wants: $$('[name=wants]:checked', form).map((c) => c.value) };
      const body = { agency: v('agency'), subject: v('subject'), bidId: v('bidId') ? Number(v('bidId')) : null, data,
        letter: foiaLetter({ ...data, agency: v('agency'), subject: v('subject') }) };
      try {
        const saved = item ? await api('/foia/' + item.id, { method: 'PATCH', body }) : await api('/foia', { method: 'POST', body });
        $('[data-close]').click();
        onSaved(saved.item);
      } catch (err) { const el = $('#ff-error'); el.textContent = err.message; el.classList.remove('hidden'); }
    });
  }

  async function viewFoia(view) {
    const [{ items }, bids] = await Promise.all([api('/foia'), loadBids()]);
    let openId = null;
    // Rendered into a fresh element so its click handler goes away with the page.
    view.innerHTML = '<div></div>';
    const root = view.firstElementChild;
    const draw = () => {
      root.innerHTML = `
        ${pageHead('FOIA Automator', 'Request the winning price on past contracts. Agencies must answer within 20 business days.',
          `<a href="https://www.foia.gov/agency-search.html" target="_blank" rel="noopener noreferrer" class="btn-ghost">Find an agency's FOIA office</a>
           <button id="foia-new" class="btn-primary">${icon('plus', 'h-4 w-4')}New request</button>`)}
        ${items.length ? `<div class="grid gap-3">${items.map((r) => {
          const due = r.sentOn ? addBusinessDays(r.sentOn, 20) : null;
          const late = due && r.status === 'sent' && daysUntil(due) < 0;
          return `<article class="card p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0"><p class="flex flex-wrap items-center gap-2 font-semibold text-white">${esc(r.subject)} ${STATUS_PILL[r.status] || ''}</p>
                <p class="mt-1 text-sm text-mist-400">${esc(r.agency)}${r.sentOn ? ` · sent ${fmtDate(r.sentOn)}` : ''}${due && r.status === 'sent' ? ` · <span class="${late ? 'text-brand-redSoft' : ''}">answer due ${fmtDate(due)}${late ? ' (overdue, follow up)' : ''}</span>` : ''}</p></div>
              <div class="flex flex-wrap gap-2">
                <button class="btn-ghost !py-2" data-view="${r.id}">${openId === r.id ? 'Hide letter' : 'Letter'}</button>
                <button class="btn-ghost !py-2" data-edit="${r.id}">Edit</button>
                ${r.status === 'draft' ? `<button class="btn-primary !py-2" data-sent="${r.id}">Mark sent</button>` : r.status === 'sent' ? `<button class="btn-primary !py-2" data-got="${r.id}">Records received</button>` : ''}
                <button class="btn-ghost !py-2" data-del="${r.id}" aria-label="Delete">&times;</button>
              </div>
            </div>
            ${openId === r.id ? `<div class="mt-4"><pre class="whitespace-pre-wrap rounded-2xl border border-white/[0.06] bg-ink-900 p-5 font-sans text-sm leading-relaxed text-mist-200">${esc(r.letter)}</pre>
              <div class="mt-3 flex flex-wrap gap-2"><button class="btn-ghost" data-copy="${r.id}">Copy</button><button class="btn-ghost" data-word="${r.id}">Download Word</button>
              <button class="btn-ghost" data-mail="${r.id}">${icon('mail', 'h-4 w-4')}Open in email</button></div>
              <p class="mt-2 text-xs text-mist-500">Most agencies take requests by email or through their online portal. Find the address with the agency's FOIA office link above.</p></div>` : ''}
          </article>`;
        }).join('')}</div>`
          : emptyState('No FOIA requests yet', 'Pick a contract like the ones you bid on and request its winning price. Knowing the price to beat is the fastest way to win.', '<button id="foia-new2" class="btn-primary">Write your first request</button>')}`;
    };
    draw();
    const find = (id) => items.find((r) => r.id === String(id));
    const saved = (it) => { const i = items.findIndex((r) => r.id === it.id); if (i >= 0) items[i] = it; else items.unshift(it); openId = it.id; draw(); };
    root.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      const d = t.dataset;
      try {
        if (t.id === 'foia-new' || t.id === 'foia-new2') foiaModal(null, bids, saved);
        else if (d.view) { openId = openId === d.view ? null : d.view; draw(); }
        else if (d.edit) foiaModal(find(d.edit), bids, saved);
        else if (d.sent) saved((await api('/foia/' + d.sent, { method: 'PATCH', body: { status: 'sent', sentOn: today() } })).item);
        else if (d.got) saved((await api('/foia/' + d.got, { method: 'PATCH', body: { status: 'received' } })).item);
        else if (d.copy) copyText(find(d.copy).letter);
        else if (d.word) { const r = find(d.word); wordDoc('FOIA request ' + r.subject, `<pre style="font-family:Calibri,Arial,sans-serif;white-space:pre-wrap">${esc(r.letter)}</pre>`); }
        else if (d.mail) { const r = find(d.mail); mailto({ subject: `FOIA Request: ${r.subject}`, body: r.letter }); }
        else if (d.del && confirm('Delete this FOIA request?')) { await api('/foia/' + d.del, { method: 'DELETE' }); items.splice(items.findIndex((r) => r.id === String(d.del)), 1); draw(); }
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // ---- 60-pricing.js
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

  // ---- 70-teaming.js
  // ------------------------------------------------------------------ Auto-Teaming Legal Engine (Enterprise)

  const LEGAL_KIND = { nda: 'Mutual NDA', teaming: 'Teaming Agreement' };

  function legalDefaults(kind, sub, bid) {
    const u = state.me.user;
    return {
      primeName: u.businessName || '', primeAddress: u.address || '', primeSigner: u.fullName || '', primeTitle: 'Owner',
      subName: sub ? sub.company : '', subAddress: sub ? sub.location || '' : '', subSigner: sub ? sub.contactName || '' : '', subTitle: '',
      effective: today(), governingState: '', termYears: kind === 'nda' ? '2' : '',
      solicitation: bid ? [bid.title, bid.solicitationNumber].filter(Boolean).join(', ') : '', agency: bid ? bid.agency || '' : '',
      purpose: bid ? `preparing a proposal for ${bid.title}` : 'evaluating and pursuing federal contract opportunities together',
      subScope: sub && sub.trade ? sub.trade : '', subShare: '', exclusive: true, setAside: Boolean(bid && bid.setAside),
    };
  }

  const F = (v, ph) => (String(v || '').trim() ? esc(v) : `<span class="cap-ph">[INSERT: ${ph}]</span>`);

  function ndaHtml(t) {
    return `<h1>Mutual Non-Disclosure Agreement</h1>
      <p>This Mutual Non-Disclosure Agreement (the "Agreement") is made effective ${F(t.effective && fmtDate(t.effective), 'date')} between <b>${F(t.primeName, 'your company')}</b>, located at ${F(t.primeAddress, 'address')}, and <b>${F(t.subName, 'other company')}</b>, located at ${F(t.subAddress, 'address')} (each a "Party").</p>
      <h2>1. Purpose</h2><p>The Parties wish to share information for the purpose of ${F(t.purpose, 'purpose')} (the "Purpose").</p>
      <h2>2. Confidential Information</h2><p>"Confidential Information" means any non-public business, technical, pricing, cost, customer or proposal information disclosed by one Party to the other, in any form, that is marked confidential or that a reasonable person would understand to be confidential. It does not include information that is or becomes public through no fault of the receiving Party, was already known to the receiving Party, is independently developed, or is received lawfully from a third party without restriction.</p>
      <h2>3. Obligations</h2><p>The receiving Party will use Confidential Information only for the Purpose, protect it with at least reasonable care, and share it only with employees and advisors who need it for the Purpose and are bound by similar obligations. A Party may disclose information required by law or court order after giving prompt notice, where lawful.</p>
      <h2>4. Pricing and proposal data</h2><p>Each Party's pricing, labor rates and proposal content are Confidential Information and will not be used to compete against the disclosing Party on the opportunity described in the Purpose.</p>
      <h2>5. Non-solicitation</h2><p>During the term, neither Party will use Confidential Information to solicit the other Party's government customer on the opportunity described above, or its employees, without written consent.</p>
      <h2>6. Term and return</h2><p>This Agreement lasts ${F(t.termYears, 'number')} years from the effective date. Obligations survive for two years after it ends. On request, each Party will return or destroy the other's Confidential Information.</p>
      <h2>7. No obligation</h2><p>This Agreement does not create a partnership, joint venture or obligation to enter into any further agreement. All information is provided "as is".</p>
      <h2>8. Governing law</h2><p>This Agreement is governed by the laws of the State of ${F(t.governingState, 'state')}.</p>
      ${sigBlock(t)}`;
  }

  function teamingHtml(t) {
    return `<h1>Teaming Agreement</h1>
      <p>This Teaming Agreement (the "Agreement") is made effective ${F(t.effective && fmtDate(t.effective), 'date')} between <b>${F(t.primeName, 'your company')}</b>, located at ${F(t.primeAddress, 'address')} ("Prime"), and <b>${F(t.subName, 'subcontractor')}</b>, located at ${F(t.subAddress, 'address')} ("Subcontractor"), under FAR Subpart 9.6, Contractor Team Arrangements.</p>
      <h2>1. Opportunity</h2><p>The Parties will team to pursue ${F(t.solicitation, 'solicitation title and number')}${t.agency ? ` issued by ${esc(t.agency)}` : ''} (the "Opportunity"). Prime will submit the proposal as prime contractor.</p>
      <h2>2. Responsibilities</h2><p>Prime will lead the proposal, own the customer relationship and price the bid. Subcontractor will provide the technical, pricing and past performance information Prime reasonably requests, on time, for the following scope: ${F(t.subScope, 'subcontractor scope of work')}.</p>
      <h2>3. Workshare</h2><p>If Prime is awarded the contract, Prime will offer Subcontractor a subcontract for the scope above, estimated at ${F(t.subShare, 'percent')}% of the contract value, subject to the customer's approval and final negotiation.${t.setAside ? ' Both Parties acknowledge that this Opportunity is set aside and that Prime must comply with the limitations on subcontracting in FAR 52.219-14 (or the clause stated in the solicitation), so the workshare will be adjusted as needed to keep Prime compliant.' : ''}</p>
      <h2>4. Exclusivity</h2><p>${t.exclusive ? 'Neither Party will join another team, or submit its own proposal, for the Opportunity while this Agreement is in effect.' : 'This Agreement is not exclusive. Each Party may participate in other proposals for the Opportunity, but will not share the other Party\'s information with them.'}</p>
      <h2>5. Proprietary information</h2><p>Information exchanged under this Agreement is confidential, will be marked as proprietary where appropriate, and will be used only for the Opportunity. Each Party bears its own proposal costs.</p>
      <h2>6. Term</h2><p>This Agreement ends on the earliest of: execution of the subcontract; the customer's award to another offeror or cancellation of the Opportunity; Prime's decision not to bid, given in writing; one year from the effective date; or mutual written agreement.</p>
      <h2>7. Compliance</h2><p>Each Party will comply with applicable law, including the Procurement Integrity Act, the Anti-Kickback Act and organizational conflict of interest rules, and will notify the other promptly if it is suspended, debarred or loses its SAM.gov registration.</p>
      <h2>8. Independent contractors</h2><p>The Parties are independent contractors. Nothing here creates a partnership, joint venture or agency.</p>
      <h2>9. Governing law</h2><p>This Agreement is governed by the laws of the State of ${F(t.governingState, 'state')}.</p>
      ${sigBlock(t)}`;
  }

  const sigBlock = (t) => `<h2>Signatures</h2><table><tr>
      <td><b>${F(t.primeName, 'your company')}</b><br><br>Signature: ______________________<br>Name: ${F(t.primeSigner, 'name')}<br>Title: ${F(t.primeTitle, 'title')}<br>Date: ____________</td>
      <td><b>${F(t.subName, 'other company')}</b><br><br>Signature: ______________________<br>Name: ${F(t.subSigner, 'name')}<br>Title: ${F(t.subTitle, 'title')}<br>Date: ____________</td></tr></table>`;

  const LEGAL_NOTE = 'A starting draft, not legal advice. Have an attorney review it before you sign.';

  async function viewTeaming(view) {
    const [{ items }, bids, subs] = await Promise.all([api('/legal'), loadBids(), loadSubs()]);
    view.innerHTML = `
      ${pageHead('Auto-Teaming Legal Engine', 'Mutual NDAs and FAR 9.6 teaming agreements, filled in from your profile, your sub and the opportunity.',
        `<button id="lg-new" class="btn-primary">${icon('plus', 'h-4 w-4')}New agreement</button>`)}
      ${items.length ? `<div class="card overflow-x-auto p-5"><table class="tbl"><thead><tr><th>Agreement</th><th>Type</th><th>Updated</th></tr></thead><tbody>${items.map((x) => `
        <tr><td><a href="/app/teaming/${x.id}" data-link class="font-medium text-white hover:text-brand-blueSoft">${esc(x.title)}</a></td><td class="text-mist-300">${LEGAL_KIND[x.kind]}</td><td class="text-mist-400">${fmtDate(x.updatedAt)}</td></tr>`).join('')}</tbody></table></div>`
        : emptyState('No agreements yet', 'Sign an NDA before you share pricing with a sub, then a teaming agreement before you submit together.', '<button id="lg-new2" class="btn-primary">Draft your first agreement</button>')}
      <p class="mt-4 text-xs text-mist-500">${LEGAL_NOTE}</p>`;
    const open = () => {
      openModal(`
        <h2 class="text-lg font-semibold text-white">New agreement</h2>
        <form id="lg-form" class="mt-5 space-y-4">
          <div class="seg" role="radiogroup">${Object.entries(LEGAL_KIND).map(([k, l], i) => `<label class="cursor-pointer"><input type="radio" name="kind" value="${k}" class="sr-only" ${i ? '' : 'checked'} /><span>${l}</span></label>`).join('')}</div>
          <div><label class="label" for="lg-sub">Other company (from your subcontractors)</label>
            <select id="lg-sub" name="sub" class="field"><option value="">Type it in on the next page</option>${subs.map((s) => `<option value="${s.id}">${esc(s.company)}</option>`).join('')}</select></div>
          <div><label class="label" for="lg-bid">Opportunity</label><select id="lg-bid" name="bid" class="field">${bidOptions(bids, null)}</select></div>
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" data-close>Cancel</button><button class="btn-primary">Draft it</button></div>
        </form>`);
      $('#lg-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target.elements;
        const kind = $('[name=kind]:checked', e.target).value;
        const sub = subs.find((s) => String(s.id) === f.sub.value);
        const bid = bids.find((b) => String(b.id) === f.bid.value);
        try {
          const { item } = await api('/legal', { method: 'POST', body: {
            kind, bidId: bid ? bid.id : null, data: legalDefaults(kind, sub, bid),
            title: `${LEGAL_KIND[kind]}${sub ? ' with ' + sub.company : ''}`.slice(0, 200) } });
          $('[data-close]').click();
          navigate('/teaming/' + item.id);
        } catch (err) { toast(err.message, 'error'); }
      });
    };
    $$('#lg-new, #lg-new2', view).forEach((b) => b.addEventListener('click', open));
  }

  async function viewLegalDoc(view, id) {
    const { items } = await api('/legal');
    const doc = items.find((x) => x.id === String(id));
    if (!doc) { view.innerHTML = emptyState('Agreement not found', '', '<a href="/app/teaming" data-link class="btn-ghost">Back</a>'); return; }
    const t = Object.assign(legalDefaults(doc.kind), doc.data);
    const html = () => (doc.kind === 'nda' ? ndaHtml(t) : teamingHtml(t));
    const inp = (k, label, o = {}) => `<div class="${o.wide ? 'sm:col-span-2' : ''}"><label class="label" for="lg-${k}">${label}</label><input id="lg-${k}" data-k="${k}" class="field !py-2" ${o.type ? `type="${o.type}"` : ''} maxlength="300" value="${esc(t[k])}" /></div>`;
    view.innerHTML = `<div>
      <div class="no-print">${pageHead(esc(doc.title), LEGAL_NOTE,
        `<a href="/app/teaming" data-link class="btn-ghost">All agreements</a><button id="lg-word" class="btn-ghost">Download Word</button><button id="lg-print" class="btn-ghost">Print / PDF</button><button id="lg-save" class="btn-primary">Save</button>`)}</div>
      <div class="grid gap-6 xl:grid-cols-[380px,1fr]">
        <form id="lg-edit" class="no-print card space-y-4 p-6" novalidate>
          <h2 class="font-semibold text-white">Your company</h2>
          <div class="grid gap-3 sm:grid-cols-2">${inp('primeName', 'Company', { wide: true })}${inp('primeAddress', 'Address', { wide: true })}${inp('primeSigner', 'Signer')}${inp('primeTitle', 'Title')}</div>
          <h2 class="pt-2 font-semibold text-white">${doc.kind === 'nda' ? 'Other company' : 'Subcontractor'}</h2>
          <div class="grid gap-3 sm:grid-cols-2">${inp('subName', 'Company', { wide: true })}${inp('subAddress', 'Address', { wide: true })}${inp('subSigner', 'Signer')}${inp('subTitle', 'Title')}</div>
          <h2 class="pt-2 font-semibold text-white">Terms</h2>
          <div class="grid gap-3 sm:grid-cols-2">${inp('effective', 'Effective date', { type: 'date' })}${inp('governingState', 'Governing state')}
            ${doc.kind === 'nda' ? `${inp('termYears', 'Term (years)')}${inp('purpose', 'Purpose', { wide: true })}`
              : `${inp('solicitation', 'Solicitation', { wide: true })}${inp('agency', 'Agency', { wide: true })}${inp('subScope', 'Subcontractor scope', { wide: true })}${inp('subShare', 'Workshare %')}
                <label class="flex items-center gap-2 text-sm text-mist-200"><input type="checkbox" data-k="exclusive" ${t.exclusive ? 'checked' : ''} />Exclusive</label>
                <label class="flex items-center gap-2 text-sm text-mist-200 sm:col-span-2"><input type="checkbox" data-k="setAside" ${t.setAside ? 'checked' : ''} />Set-aside (adds the FAR 52.219-14 limit)</label>`}
          </div>
        </form>
        <article class="card print-area p-6 sm:p-10"><div id="lg-doc" class="doc"></div></article>
      </div></div>`;
    const draw = () => { $('#lg-doc').innerHTML = html(); };
    draw();
    $('#lg-edit').addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      t[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      draw();
    });
    $('#lg-print').addEventListener('click', () => window.print());
    $('#lg-word').addEventListener('click', () => wordDoc(doc.title, html().replace(/<span class="cap-ph">/g, '<span style="background:#FFE4E8">')));
    $('#lg-save').addEventListener('click', async () => {
      try { await api('/legal/' + doc.id, { method: 'PATCH', body: { data: t } }); toast('Saved.'); } catch (err) { toast(err.message, 'error'); }
    });
  }

  // ---- 80-jobs.js
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

  // ---- 90-postaward.js
  // ------------------------------------------------------------------ Post-Award Milestone Tracker and Simplified Invoicing Engine

  const STANDARD_MILESTONES = [
    ['Post-award kickoff with the contracting officer', 5],
    ['Send insurance certificates and any bonds', 10],
    ['Register in the payment system named in the contract (PIEE/WAWF or IPP)', 10],
    ['Subcontract signed and sub notified to proceed', 7],
    ['Mid-point quality check with the COR', 30],
    ['Final delivery or completion of work', 60],
    ['Final invoice and release of claims', 65],
  ];

  async function viewMilestones(view) {
    const [{ items }, bids, subs] = await Promise.all([api('/milestones'), loadBids(), loadSubs()]);
    const contracts = bids.filter((b) => ['won', 'awarded', 'active'].includes(b.stage) || items.some((m) => m.bidId === b.id));
    const pick = contracts.length ? contracts : bids;
    let showDone = false;
    view.innerHTML = '<div></div>';
    const root = view.firstElementChild;
    const subName = (sid) => (subs.find((s) => s.id === sid) || {}).company;
    const draw = () => {
      const groups = pick.map((b) => ({ b, list: items.filter((m) => m.bidId === b.id && (showDone || m.status === 'open')) })).filter((g) => g.list.length || items.every((m) => m.bidId !== g.b.id));
      const open = items.filter((m) => m.status === 'open');
      const late = open.filter((m) => m.dueOn && daysUntil(m.dueOn) < 0).length;
      root.innerHTML = `
        ${pageHead('Post-Award Milestone Tracker', 'Every deliverable, sub check-in and invoice date for the contracts you have won.',
          `<a href="/app/invoices" data-link class="btn-ghost">${icon('receipt', 'h-4 w-4')}Invoices</a><button id="ms-new" class="btn-primary" ${bids.length ? '' : 'disabled'}>${icon('plus', 'h-4 w-4')}Add milestone</button>`)}
        ${bids.length ? `
        <div class="mb-6 grid gap-3 sm:grid-cols-3">
          <div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">Open</p><p class="mt-1 text-2xl font-semibold text-white">${open.length}</p></div>
          <div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">Overdue</p><p class="mt-1 text-2xl font-semibold ${late ? 'text-brand-redSoft' : 'text-white'}">${late}</p></div>
          <div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">Still to bill</p><p class="mt-1 text-2xl font-semibold text-white">${money2(open.reduce((t, m) => t + (m.amount || 0), 0))}</p></div>
        </div>
        <label class="mb-4 flex items-center gap-2 text-sm text-mist-300"><input type="checkbox" id="ms-done" ${showDone ? 'checked' : ''} />Show completed</label>
        <div class="space-y-6">${groups.map(({ b, list }) => `
          <section class="card p-6">
            <div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-semibold text-white">${esc(b.title)}</h2>
              <button class="btn-ghost !py-2" data-std="${b.id}">Add standard milestones</button></div>
            ${list.length ? `<ul class="mt-4 divide-y divide-white/[0.06]">${list.map((m) => {
              const d = m.dueOn ? daysUntil(m.dueOn) : null;
              return `<li class="flex flex-wrap items-center gap-3 py-3">
                <button class="rounded-full border ${m.status === 'done' ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300' : 'border-white/20 text-transparent hover:border-white/50'} p-1" data-toggle="${m.id}" aria-label="${m.status === 'done' ? 'Mark open' : 'Mark done'}">${icon('check', 'h-3.5 w-3.5')}</button>
                <div class="min-w-0 flex-1"><p class="${m.status === 'done' ? 'text-mist-500 line-through' : 'text-white'}">${esc(m.title)}</p>
                  <p class="text-xs text-mist-500">${[m.dueOn && (m.status === 'done' ? `Done ${fmtDate(m.doneOn)}` : `<span class="${d < 0 ? 'text-brand-redSoft' : d <= 3 ? 'text-amber-200' : ''}">Due ${fmtDate(m.dueOn)} (${d < 0 ? `${-d} days late` : daysLabel(d)})</span>`),
                    m.subContactId && subName(m.subContactId) && `Sub: ${esc(subName(m.subContactId))}`, m.amount && money2(m.amount)].filter(Boolean).join(' · ')}</p></div>
                ${m.amount && m.status === 'done' ? `<a href="/app/invoices/new?bid=${b.id}&milestone=${m.id}" data-link class="btn-ghost !py-1.5 !text-xs">Invoice it</a>` : ''}
                <button class="btn-ghost !px-2.5 !py-1.5" data-del="${m.id}" aria-label="Delete">&times;</button></li>`;
            }).join('')}</ul>` : '<p class="mt-3 text-sm text-mist-500">No open milestones.</p>'}
          </section>`).join('')}</div>`
        : emptyState('Win one first', 'Milestones hang off the opportunities in your Bid CRM. Add the contract there and move it to Won.', '<a href="/app/crm" data-link class="btn-primary">Open Bid CRM</a>')}`;
    };
    draw();
    const msModal = () => {
      openModal(`<h2 class="text-lg font-semibold text-white">Add milestone</h2>
        <form id="ms-form" class="mt-5 grid gap-4 sm:grid-cols-2" novalidate>
          <div class="sm:col-span-2"><label class="label" for="ms-bid">Contract</label><select id="ms-bid" name="bidId" class="field">${bidOptions(pick, pick[0] && pick[0].id, 'Choose')}</select></div>
          <div class="sm:col-span-2"><label class="label" for="ms-title">Milestone</label><input id="ms-title" name="title" class="field" maxlength="200" placeholder="e.g. Deliver 40 patio umbrellas" /></div>
          <div><label class="label" for="ms-due">Due</label><input id="ms-due" name="dueOn" type="date" class="field" /></div>
          <div><label class="label" for="ms-amt">Amount to bill when done (optional)</label><input id="ms-amt" name="amount" class="field" inputmode="decimal" /></div>
          <div class="sm:col-span-2"><label class="label" for="ms-sub">Subcontractor responsible (optional)</label><select id="ms-sub" name="subContactId" class="field"><option value="">None</option>${subs.map((s) => `<option value="${s.id}">${esc(s.company)}</option>`).join('')}</select></div>
          <p id="ms-err" class="hidden text-sm text-brand-redSoft sm:col-span-2" role="alert"></p>
          <div class="flex justify-end gap-2 sm:col-span-2"><button type="button" class="btn-ghost" data-close>Cancel</button><button class="btn-primary">Add</button></div>
        </form>`);
      $('#ms-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target.elements;
        try {
          const { item } = await api('/milestones', { method: 'POST', body: { bidId: f.bidId.value ? Number(f.bidId.value) : null, title: f.title.value, dueOn: f.dueOn.value || null,
            amount: f.amount.value || null, subContactId: f.subContactId.value ? Number(f.subContactId.value) : null } });
          items.push(item);
          $('[data-close]').click();
          draw();
        } catch (err) { const el = $('#ms-err'); el.textContent = err.message; el.classList.remove('hidden'); }
      });
    };
    root.addEventListener('change', (e) => { if (e.target.id === 'ms-done') { showDone = e.target.checked; draw(); } });
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      try {
        if (b.id === 'ms-new') msModal();
        else if (d.std) {
          b.disabled = true;
          const start = today();
          const have = new Set(items.filter((m) => m.bidId === d.std).map((m) => m.title));
          for (const [title, days] of STANDARD_MILESTONES.filter(([t]) => !have.has(t))) {
            items.push((await api('/milestones', { method: 'POST', body: { bidId: Number(d.std), title, dueOn: addBusinessDays(start, Math.round(days * 5 / 7)) } })).item);
          }
          toast('Standard milestones added. Adjust the dates to your contract.');
          draw();
        } else if (d.toggle) {
          const m = items.find((x) => x.id === String(d.toggle));
          const done = m.status !== 'done';
          Object.assign(m, (await api('/milestones/' + m.id, { method: 'PATCH', body: { status: done ? 'done' : 'open', doneOn: done ? today() : null } })).item);
          draw();
        } else if (d.del && confirm('Delete this milestone?')) {
          await api('/milestones/' + d.del, { method: 'DELETE' });
          items.splice(items.findIndex((x) => x.id === String(d.del)), 1);
          draw();
        }
      } catch (err) { b.disabled = false; toast(err.message, 'error'); }
    });
  }

  const INV_PILL = {
    draft: '<span class="pill bg-white/[0.06] text-mist-300">Draft</span>',
    submitted: '<span class="pill bg-brand-blue/15 text-brand-blueSoft">Submitted</span>',
    paid: '<span class="pill bg-emerald-500/15 text-emerald-300">Paid</span>',
  };

  async function viewInvoices(view) {
    const [{ items }, bids] = await Promise.all([api('/invoices'), loadBids()]);
    const bidTitle = (id) => (bids.find((b) => b.id === id) || {}).title || '';
    const outstanding = items.filter((i) => i.status === 'submitted');
    view.innerHTML = `
      ${pageHead('Simplified Invoicing Engine', 'Public vouchers (SF-1034, with SF-1035 continuation) ready to upload to the payment system in your contract.',
        `<a href="/app/invoices/new" data-link class="btn-primary">${icon('plus', 'h-4 w-4')}New voucher</a>`)}
      <div class="mb-6 grid gap-3 sm:grid-cols-3">
        <div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">Waiting on payment</p><p class="mt-1 text-2xl font-semibold text-white">${money2(outstanding.reduce((t, i) => t + i.total, 0))}</p></div>
        <div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">Paid</p><p class="mt-1 text-2xl font-semibold text-emerald-300">${money2(items.filter((i) => i.status === 'paid').reduce((t, i) => t + i.total, 0))}</p></div>
        <div class="tile"><p class="text-xs uppercase tracking-wider text-mist-500">Drafts</p><p class="mt-1 text-2xl font-semibold text-white">${items.filter((i) => i.status === 'draft').length}</p></div>
      </div>
      ${items.length ? `<div class="card overflow-x-auto p-5"><table class="tbl"><thead><tr><th>Voucher</th><th>Contract</th><th class="text-right">Amount</th><th>Status</th><th>Payment due</th></tr></thead><tbody>${items.map((i) => {
        const sub = i.data && i.data.submittedOn;
        const due = sub ? new Date(Date.parse(sub + 'T12:00:00') + 30 * 86400000).toISOString().slice(0, 10) : null;
        return `<tr><td><a href="/app/invoices/${i.id}" data-link class="font-medium text-white hover:text-brand-blueSoft">${esc(i.number)}</a></td><td class="text-mist-300">${esc(bidTitle(i.bidId) || (i.data && i.data.contractNumber) || '')}</td>
          <td class="text-right text-white">${money2(i.total)}</td><td>${INV_PILL[i.status]}</td>
          <td class="${due && i.status === 'submitted' && daysUntil(due) < 0 ? 'text-brand-redSoft' : 'text-mist-400'}">${due && i.status === 'submitted' ? fmtDate(due) : ''}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="mt-3 text-xs text-mist-500">Under the Prompt Payment Act the government generally owes payment 30 days after it receives a proper invoice, with interest when it pays late.</p>`
        : emptyState('No vouchers yet', 'Finish a milestone, then invoice it here. The voucher fills in your company details and the contract for you.', '<a href="/app/invoices/new" data-link class="btn-primary">Create a voucher</a>')}`;
  }

  async function viewInvoice(view, id) {
    const params = new URLSearchParams(location.search);
    const [{ items }, bids, { items: ms }] = await Promise.all([api('/invoices'), loadBids(), api('/milestones')]);
    let inv = id === 'new' ? null : items.find((i) => i.id === String(id));
    if (id !== 'new' && !inv) { view.innerHTML = emptyState('Voucher not found', '', '<a href="/app/invoices" data-link class="btn-ghost">Back</a>'); return; }
    const u = state.me.user;
    const year = new Date().getFullYear();
    const bid = bids.find((b) => String(b.id) === String(inv ? inv.bidId : params.get('bid')));
    const milestone = ms.find((m) => String(m.id) === params.get('milestone'));
    const d = Object.assign({
      date: today(), contractNumber: bid ? bid.solicitationNumber || '' : '', orderNumber: '', agency: bid ? bid.agency || '' : '', payingOffice: '',
      periodFrom: '', periodTo: '', payeeName: u.businessName || '', payeeAddress: u.address || '', uei: u.uei || '', cage: u.cageCode || '',
      lines: milestone ? [{ date: milestone.doneOn || today(), description: milestone.title, quantity: '1', unit: 'Lot', unitPrice: String(milestone.amount || '') }]
        : [{ date: today(), description: '', quantity: '1', unit: 'Each', unitPrice: '' }],
    }, inv ? inv.data : {});
    let number = inv ? inv.number : `${year}-${String(items.filter((i) => i.number.startsWith(String(year))).length + 1).padStart(3, '0')}`;
    let bidId = bid ? bid.id : null;
    let status = inv ? inv.status : 'draft';
    const total = () => d.lines.reduce((t, l) => t + num(l.quantity) * num(l.unitPrice), 0);

    const inp = (k, label, o = {}) => `<div class="${o.cls || ''}"><label class="label" for="iv-${k}">${label}</label><input id="iv-${k}" data-f="${k}" class="field !py-2" ${o.type ? `type="${o.type}"` : ''} maxlength="300" value="${esc(d[k])}" /></div>`;
    const lineRow = (l, i) => `<tr data-i="${i}"><td><input type="date" class="field !w-40 !px-3 !py-2" data-l="date" value="${esc(l.date)}" /></td>
      <td><input class="field !min-w-[220px] !py-2" data-l="description" maxlength="300" value="${esc(l.description)}" /></td>
      <td><input class="field !w-20 !px-3 !py-2" data-l="quantity" inputmode="decimal" value="${esc(l.quantity)}" /></td>
      <td><input class="field !w-20 !px-3 !py-2" data-l="unit" maxlength="20" value="${esc(l.unit)}" /></td>
      <td><input class="field !w-28 !px-3 !py-2" data-l="unitPrice" inputmode="decimal" value="${esc(l.unitPrice)}" /></td>
      <td class="text-right text-white" data-amt>-</td><td><button type="button" class="btn-ghost !px-2.5 !py-2" data-rm="${i}" aria-label="Remove line">&times;</button></td></tr>`;

    // The printed public voucher. Lines past the eighth go on an SF-1035 continuation sheet.
    const voucher = () => {
      const lines = d.lines.filter((l) => l.description);
      const row = (l) => `<tr><td>${esc(l.date ? fmtDate(l.date) : '')}</td><td>${esc(l.description)}</td><td class="r">${esc(l.quantity)}</td><td>${esc(l.unit)}</td><td class="r">${money2(num(l.unitPrice))}</td><td class="r">${money2(num(l.quantity) * num(l.unitPrice))}</td></tr>`;
      const head = '<tr><th>Date of delivery or service</th><th>Articles or services</th><th>Quantity</th><th>Unit</th><th>Unit price</th><th>Amount</th></tr>';
      return `<div class="sf">
        <div class="sf-top"><div><p class="sf-form">Standard Form 1034</p><h1>Public Voucher for Purchases and Services Other Than Personal</h1></div><div class="sf-no">Voucher no.<br><b>${esc(number)}</b></div></div>
        <table class="sf-grid"><tr><td><span>U.S. department, bureau or establishment</span>${F(d.agency, 'agency')}</td><td><span>Date voucher prepared</span>${esc(fmtDate(d.date))}</td><td><span>Contract number and date</span>${F(d.contractNumber, 'contract number')}</td></tr>
          <tr><td><span>Paying office</span>${F(d.payingOffice, 'paying office from the contract')}</td><td><span>Requisition or order number</span>${esc(d.orderNumber) || '&nbsp;'}</td><td><span>Period of service</span>${d.periodFrom ? `${esc(fmtDate(d.periodFrom))} to ${esc(fmtDate(d.periodTo))}` : '&nbsp;'}</td></tr>
          <tr><td colspan="2"><span>Payee's name and address</span><b>${F(d.payeeName, 'company')}</b><br>${F(d.payeeAddress, 'address')}</td><td><span>UEI / CAGE</span>${F(d.uei, 'UEI')} / ${esc(d.cage) || '-'}</td></tr></table>
        <table class="sf-lines">${head}${lines.slice(0, 8).map(row).join('')}<tr class="sf-total"><td colspan="5">${lines.length > 8 ? 'Total (including SF-1035 continuation)' : 'Total'}</td><td class="r">${money2(total())}</td></tr></table>
        <p class="sf-cert">Pursuant to authority vested in me, I certify that this voucher is correct and proper for payment.</p>
        <table class="sf-grid"><tr><td><span>Payee signature</span>&nbsp;<br>&nbsp;</td><td><span>Name and title</span>${F(u.fullName, 'name')}</td><td><span>Date</span>&nbsp;</td></tr></table>
        ${lines.length > 8 ? `<div class="sf-break"></div><div class="sf-top"><div><p class="sf-form">Standard Form 1035</p><h1>Public Voucher for Purchases and Services Other Than Personal, Continuation Sheet</h1></div><div class="sf-no">Voucher no.<br><b>${esc(number)}</b></div></div>
          <table class="sf-lines">${head}${lines.slice(8).map(row).join('')}</table>` : ''}
      </div>`;
    };

    view.innerHTML = `<div>
      <div class="no-print">${pageHead(`Voucher ${esc(number)}`, 'Fill it in, print or save as PDF, then upload it to the payment system your contract names (usually PIEE/WAWF or IPP).',
        `<a href="/app/invoices" data-link class="btn-ghost">All vouchers</a><button id="iv-print" class="btn-ghost">Print / PDF</button><button id="iv-save" class="btn-primary">Save</button>`)}
      <div class="grid gap-6">
        <section class="card p-6"><div class="grid gap-4 sm:grid-cols-3">
          <div><label class="label" for="iv-number">Voucher number</label><input id="iv-number" class="field !py-2" maxlength="40" value="${esc(number)}" /></div>
          <div><label class="label" for="iv-bid">Contract in your CRM</label><select id="iv-bid" class="field !py-2">${bidOptions(bids, bidId)}</select></div>
          <div><label class="label" for="iv-status">Status</label><select id="iv-status" class="field !py-2">${Object.keys(INV_PILL).map((s) => `<option value="${s}" ${s === status ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></div>
          ${inp('date', 'Date prepared', { type: 'date' })}${inp('contractNumber', 'Contract number')}${inp('orderNumber', 'Order or requisition number')}
          ${inp('agency', 'Agency')}${inp('payingOffice', 'Paying office')}<div class="grid grid-cols-2 gap-2">${inp('periodFrom', 'Service from', { type: 'date' })}${inp('periodTo', 'to', { type: 'date' })}</div>
          ${inp('payeeName', 'Payee')}${inp('payeeAddress', 'Payee address', { cls: 'sm:col-span-2' })}${inp('uei', 'UEI')}${inp('cage', 'CAGE')}
        </div></section>
        <section class="card p-6"><h2 class="font-semibold text-white">Articles or services</h2>
          <div class="mt-3 overflow-x-auto"><table class="tbl min-w-[760px]"><thead><tr><th>Date</th><th>Description</th><th>Qty</th><th>Unit</th><th>Unit price</th><th class="text-right">Amount</th><th></th></tr></thead><tbody id="iv-lines"></tbody></table></div>
          <div class="mt-3 flex flex-wrap items-center justify-between gap-3"><button type="button" id="iv-add" class="btn-ghost">${icon('plus', 'h-4 w-4')}Add line</button><p class="text-lg font-semibold text-white">Total <span id="iv-total" class="accent-text">-</span></p></div>
        </section>
      </div></div>
      <article class="print-area mt-6 hidden print:block"><div id="iv-voucher"></div></article></div>`;
    const page = view.firstElementChild;
    const drawLines = () => { $('#iv-lines').innerHTML = d.lines.map(lineRow).join(''); recalc(); };
    const recalc = () => {
      $$('#iv-lines tr').forEach((tr, i) => { const l = d.lines[i]; $('[data-amt]', tr).textContent = l.unitPrice !== '' ? money2(num(l.quantity) * num(l.unitPrice)) : '-'; });
      $('#iv-total').textContent = money2(total());
    };
    drawLines();
    page.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.f) d[t.dataset.f] = t.value;
      else if (t.dataset.l) d.lines[Number(t.closest('tr').dataset.i)][t.dataset.l] = t.value;
      else if (t.id === 'iv-number') number = t.value;
      recalc();
    });
    $('#iv-bid').addEventListener('change', (e) => {
      bidId = e.target.value || null;
      const b = bids.find((x) => x.id === String(bidId));
      if (b && !d.agency) { d.agency = b.agency || ''; $('#iv-agency').value = d.agency; }
    });
    $('#iv-status').addEventListener('change', (e) => { status = e.target.value; });
    $('#iv-add').addEventListener('click', () => { d.lines.push({ date: today(), description: '', quantity: '1', unit: 'Each', unitPrice: '' }); drawLines(); });
    $('#iv-lines').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { d.lines.splice(Number(b.dataset.rm), 1); drawLines(); } });
    $('#iv-print').addEventListener('click', () => { $('#iv-voucher').innerHTML = voucher(); window.print(); });
    $('#iv-save').addEventListener('click', async (e) => {
      if (status === 'submitted' && !d.submittedOn) d.submittedOn = today();
      if (status === 'draft') delete d.submittedOn;
      const body = { number: number.trim(), bidId, status, data: d, total: Math.round(total() * 100) / 100 };
      e.target.disabled = true;
      try {
        if (inv) inv = (await api('/invoices/' + inv.id, { method: 'PATCH', body })).item;
        else { inv = (await api('/invoices', { method: 'POST', body })).item; history.replaceState(null, '', '/app/invoices/' + inv.id); }
        toast('Voucher saved.');
      } catch (err) { toast(err.message, 'error'); }
      e.target.disabled = false;
    });
  }

  // ---- 95-company.js
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


  render();
})();
