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
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    pen: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    archive: '<rect x="3" y="4" width="18" height="4" rx="1.5"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
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
      `<a href="/app${href === '/' ? '' : href}" data-link data-path="${href}" class="nav-link"><span class="nav-ico">${icon(ic, 'h-[17px] w-[17px]')}</span><span class="flex-1 truncate">${esc(label)}</span>${extra}</a>`;
    const item = (x) => (x.unlocked && x.status === 'live'
      ? link(ROUTE_OF[x.key], ICON_OF[x.key], x.name)
      : link('/feature/' + x.key, x.unlocked ? ICON_OF[x.key] : 'lock', x.name,
        x.unlocked ? '<span class="pill bg-white/[0.08] text-mist-400">Soon</span>' : '<span class="pill bg-gradient-to-r from-brand-blue/30 to-brand-red/30 text-white">Ent</span>'));
    return `
      ${link('/', 'home', 'Command Center')}
      ${NAV_GROUPS.map(([title, keys]) => {
        const items = keys.map((k) => byKey.get(k)).filter(Boolean);
        return items.length ? `<p class="mt-5 px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-mist-500">${title}</p>${items.map(item).join('')}` : '';
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
        <aside class="no-print sticky top-0 hidden h-screen w-[17.5rem] shrink-0 p-3 lg:block">
         <div class="card flex h-full flex-col !rounded-[30px] px-3 pb-3 pt-5">
          <a href="/app" data-link class="mb-1 flex items-center gap-2.5 px-2">${brandLockup()}</a>
          <div class="mb-4 px-2"><span class="edition-badge mt-2">${esc(me.tier.label)}</span></div>
          <nav class="flex-1 space-y-0.5 overflow-y-auto pl-1.5 pr-1">${navItems()}</nav>
          <div class="mt-3 rounded-[22px] border border-white/[0.07] bg-white/[0.04] p-3">
            <p class="truncate text-sm font-medium text-mist-100">${esc(me.user.businessName || me.user.fullName || me.user.email)}</p>
            <p class="truncate text-xs text-mist-500">${esc(me.user.email)}</p>
            <div class="mt-2 flex gap-2">
              <a href="/app/profile" data-link class="btn-ghost flex-1 !px-2 !py-1.5 !text-xs">${icon('user', 'h-4 w-4')}Profile</a>
              <button id="logout" class="btn-ghost flex-1 !px-2 !py-1.5 !text-xs">${icon('out', 'h-4 w-4')}Sign out</button>
            </div>
          </div>
         </div>
        </aside>
        <div class="flex min-w-0 flex-1 flex-col">
          <header class="no-print sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.07] bg-[#04050A]/80 px-4 py-3 backdrop-blur-2xl lg:hidden">
            <a href="/app" data-link class="flex items-center gap-2">${brandLockup('h-7')}<span class="edition-badge !px-2 !py-0.5 !text-[9px]">${ent ? 'Enterprise' : 'Core'}</span></a>
            <button id="menu" class="btn-ghost !p-2" aria-label="Menu">${icon('menu')}</button>
          </header>
          <div id="mobile-nav" class="no-print fixed inset-0 top-14 z-20 hidden overflow-y-auto bg-black/95 p-4 backdrop-blur-2xl lg:hidden">
            <nav class="space-y-0.5">${navItems()}
              <a href="/app/profile" data-link class="nav-link">${icon('user')}<span>Profile</span></a>
              <button id="logout-m" class="nav-link w-full">${icon('out')}<span>Sign out</span></button>
            </nav>
          </div>
          <main id="view" class="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8 sm:py-9"></main>
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
        <div class="mt-6 flex flex-wrap gap-2">${quick.map(([path, key, label]) => `<a href="/app/${path}" data-link class="btn-ghost !bg-white/[0.06] !pl-1.5"><span class="ico-bubble ico-grad !h-7 !w-7 !rounded-full">${icon(ICON_OF[key] || 'spark', 'h-3.5 w-3.5')}</span>${label}</a>`).join('')}</div>
        ${ent ? '' : '<p class="mt-5 text-xs text-mist-500">Enterprise adds the GovCon Autopilot (it finds the bids, gets vendor quotes, prices and writes the proposals for you), the Predictive Bid Matchmaker, Section M grading, teaming agreements and 50 proposals a month.</p>'}
      </section>
      ${pageHead('Today', 'Your pipeline, deadlines and proposals at a glance.',
        '<a href="/app/decryptor" data-link class="btn-ghost">' + icon('decrypt', 'h-4 w-4') + 'Decrypt an RFP</a><a href="/app/proposals/new" data-link class="btn-primary">' + icon('proposal', 'h-4 w-4') + 'New proposal</a>')}
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="stat stat-blue">
          <div class="flex items-center justify-between"><p class="text-sm text-mist-400">Proposals this month</p><span class="ico-bubble ico-blue">${icon('proposal', 'h-4 w-4')}</span></div>
          <p class="mt-2 text-3xl font-bold text-white">${usage.used}<span class="text-lg font-medium text-mist-500"> / ${usage.limit}</span></p>
          <div class="meter mt-3"><span id="meter"></span></div>
          <p class="mt-2 text-xs text-mist-500">Resets ${fmtDate(usage.resetsAt)}</p>
        </div>
        <div class="stat stat-violet"><div class="flex items-center justify-between"><p class="text-sm text-mist-400">Active opportunities</p><span class="ico-bubble ico-violet">${icon('crm', 'h-4 w-4')}</span></div><p class="mt-2 text-3xl font-bold text-white">${active.length}</p><p class="mt-2 text-xs text-mist-500">${won} won so far</p></div>
        <div class="stat stat-green"><div class="flex items-center justify-between"><p class="text-sm text-mist-400">Pipeline value</p><span class="ico-bubble ico-green">${icon('dollar', 'h-4 w-4')}</span></div><p class="mt-2 text-3xl font-bold text-white">${fmtMoney(pipeline)}</p><p class="mt-2 text-xs text-mist-500">Across open bids</p></div>
        <div class="stat stat-red"><div class="flex items-center justify-between"><p class="text-sm text-mist-400">Due in 21 days</p><span class="ico-bubble ico-red">${icon('cal', 'h-4 w-4')}</span></div><p class="mt-2 text-3xl font-bold ${due.length ? 'text-brand-redSoft' : 'text-white'}">${due.length}</p><p class="mt-2 text-xs text-mist-500">Not yet submitted</p></div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-5">
        <section class="card p-6 lg:col-span-3">
          <div class="mb-4 flex items-center justify-between"><h2 class="font-semibold text-white">Pipeline</h2><a href="/app/crm" data-link class="text-sm text-brand-blueSoft hover:text-white">Open Bid CRM</a></div>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            ${stages.map((s) => `<a href="/app/crm" data-link class="tile transition duration-200 hover:-translate-y-0.5 hover:border-brand-blueSoft/30">
              <p class="flex items-center gap-1.5 text-xs text-mist-400"><span class="h-1.5 w-1.5 rounded-full ${STAGE_DOT[s]}"></span>${esc(STAGE_LABEL[s])}</p><p class="mt-1 text-xl font-bold text-white">${bids.filter((b) => b.stage === s).length}</p></a>`).join('')}
          </div>
          <div class="mb-2 mt-6 flex items-center justify-between"><h3 class="text-sm font-semibold text-mist-300">Upcoming deadlines</h3><a href="/app/alerts" data-link class="text-xs text-brand-blueSoft hover:text-white">All alerts</a></div>
          ${alerts.length ? `<ul class="divide-y divide-white/[0.06]">${alerts.slice(0, 6).map(alertRow).join('')}</ul>`
            : '<p class="text-sm text-mist-500">No deadlines in the next three weeks.</p>'}
        </section>
        <section class="card p-6 lg:col-span-2">
          <div class="mb-4 flex items-center justify-between"><h2 class="font-semibold text-white">Recent proposals</h2><a href="/app/proposals" data-link class="text-sm text-brand-blueSoft hover:text-white">View all</a></div>
          ${proposals.length ? `<ul class="space-y-2">${proposals.slice(0, 6).map((p) => proposalRow(p)).join('')}</ul>`
            : '<p class="text-sm text-mist-500">Your first proposal is one click away. Decrypt an RFP, then let the engine draft it.</p>'}
        </section>
      </div>`;
    requestAnimationFrame(() => { const m = $('#meter'); if (m) m.style.width = pct + '%'; });
  }

  const statusPill = (s) => s === 'ready' ? '<span class="pill bg-emerald-500/15 text-emerald-300">Ready</span>'
    : s === 'failed' ? '<span class="pill bg-brand-red/15 text-brand-redSoft">Failed</span>'
      : '<span class="pill bg-brand-blue/20 text-brand-blueSoft"><span class="spinner !h-3 !w-3"></span>Working</span>';

  const STYLE_LABEL = { house: 'House style', executive: 'Executive', plain: 'Section L Plain' };
  const proposalRow = (p, actions = false) => `<li data-id="${p.id}" data-title="${esc((p.title || '').toLowerCase())}" class="row-link min-w-0 !p-0">
    <a href="/app/proposals/${p.id}" data-link class="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 pl-3 pr-2 sm:px-4">
      <span class="flex min-w-0 items-center gap-3"><span class="ico-bubble ${p.status === 'failed' ? 'ico-red' : 'ico-blue'}">${icon('proposal', 'h-4 w-4')}</span>
        <span class="min-w-0"><span class="block truncate text-sm font-medium text-white">${esc(p.title)}</span><span class="text-xs text-mist-500">${fmtDate(p.createdAt)}${p.style ? ` · ${STYLE_LABEL[p.style] || 'House style'}` : ''}</span></span></span>
      <span class="${actions && p.status === 'ready' ? 'hidden sm:block' : ''}">${statusPill(p.status)}</span></a>${actions && p.status !== 'working' ? `<span class="flex shrink-0 items-center gap-1 pr-2 sm:pr-3">
      ${p.status === 'ready' ? `<button type="button" data-pp="rename" class="btn-ghost !p-2" title="Rename" aria-label="Rename ${esc(p.title)}">${icon('pen', 'h-4 w-4')}</button>` : ''}
      <button type="button" data-pp="archive" class="btn-ghost !p-2" title="Archive" aria-label="Archive ${esc(p.title)}">${icon('archive', 'h-4 w-4')}</button></span>` : ''}</li>`;

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
    const pct = Math.min(100, Math.round((usage.used / Math.max(1, usage.limit)) * 100));
    view.innerHTML = `
      ${pageHead('AI Proposal Engine', `${left} of ${usage.limit} proposals left this month. Resets ${fmtDate(usage.resetsAt)}.`,
        `<a href="/app/proposals/new" data-link class="btn-primary">${icon('plus', 'h-4 w-4')}New proposal</a>`)}
      ${proposals.length ? `
        <div class="mb-5 flex flex-wrap items-center gap-3">
          <div class="relative min-w-[220px] flex-1"><span class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mist-500">${icon('search', 'h-4 w-4')}</span>
            <input id="pp-q" type="search" class="field !pl-11" placeholder="Search your proposals" aria-label="Search your proposals" /></div>
          <div class="card flex items-center gap-3 !rounded-full px-4 py-2.5"><span class="text-xs text-mist-400">This month</span><div class="meter !w-28"><span id="pp-meter"></span></div><span class="text-xs font-semibold text-white">${usage.used}/${usage.limit}</span></div>
        </div>
        <ul id="pp-list" class="grid gap-2.5">${proposals.map((p) => proposalRow(p, true)).join('')}</ul>
        <p id="pp-none" class="hidden py-10 text-center text-sm text-mist-500">No proposals match that search.</p>`
        : emptyState('No proposals yet', 'Decrypt a solicitation or add an opportunity to your Bid CRM, then generate a compliant first draft in minutes.', '<a href="/app/proposals/new" data-link class="btn-primary">Write my first proposal</a>')}`;
    if (proposals.some((p) => p.status === 'working')) every(6000, () => render());
    requestAnimationFrame(() => { const m = $('#pp-meter'); if (m) m.style.width = pct + '%'; });
    const q = $('#pp-q');
    if (!q) return;
    q.addEventListener('input', () => {
      const term = q.value.trim().toLowerCase();
      let shown = 0;
      $$('#pp-list > li').forEach((li) => { const hit = !term || li.dataset.title.includes(term); li.classList.toggle('hidden', !hit); shown += hit; });
      $('#pp-none').classList.toggle('hidden', shown > 0);
    });
    $('#pp-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-pp]');
      if (!btn) return;
      e.preventDefault();
      const li = btn.closest('li');
      const p = proposals.find((x) => String(x.id) === li.dataset.id);
      if (btn.dataset.pp === 'rename') renameProposal(p, () => render());
      else archiveProposal(p, () => render());
    });
  }

  /** Small modal to rename a proposal. */
  function renameProposal(p, done) {
    const m = openModal(`<h2 class="text-lg font-semibold text-white">Rename proposal</h2>
      <form id="rn-form" class="mt-5" novalidate><label class="label" for="rn-title">Name</label><input id="rn-title" class="field" maxlength="200" value="${esc(p.title)}" />
        <div class="mt-6 flex justify-end gap-2"><button type="button" class="btn-ghost" data-close>Cancel</button><button class="btn-primary">Save</button></div></form>`);
    $('#rn-title', m.el).select();
    $('#rn-form', m.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/proposals/' + p.id, { method: 'PATCH', body: { title: $('#rn-title', m.el).value } });
        m.close();
        toast('Renamed.');
        done();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  /** Archive after a confirm. Archived proposals still count toward the month they were written. */
  function archiveProposal(p, done) {
    const m = openModal(`<h2 class="text-lg font-semibold text-white">Archive this proposal?</h2>
      <p class="mt-2 text-sm text-mist-400">"${esc(p.title)}" leaves your list. It still counts toward the month it was written in. Download a copy first if you may need it.</p>
      <div class="mt-6 flex justify-end gap-2"><button type="button" class="btn-ghost" data-close>Keep it</button><button id="ar-go" class="btn-danger">Archive</button></div>`);
    $('#ar-go', m.el).addEventListener('click', async () => {
      try { await api('/proposals/' + p.id, { method: 'DELETE' }); m.close(); toast('Archived.'); done(); } catch (err) { toast(err.message, 'error'); }
    });
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
          ${step(5, 'Pick a PDF style', 'How the finished proposal looks when you save it as a PDF or Word file. You can switch styles any time from the preview.')}
          ${stylePicker(state.me.user.proposalStyle)}
          <label class="mt-4 flex items-start gap-3 text-sm text-mist-300"><input type="checkbox" name="legend" class="mt-1 accent-brand-blue" />
            <span>Add the data-rights legend <span class="text-mist-500">(FAR 52.215-1(e)): a notice on the cover and every page that your pricing and methods are for evaluation only. Common on services and technical proposals.</span></span></label>
        </section>

        <section class="card p-6 sm:p-8">
          ${step(6, 'Anything else the writer should know', '')}
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
          style: (form.querySelector('input[name=style]:checked') || {}).value || 'house',
          pdfOptions: { legend: form.elements.legend.checked },
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
    const left = (p.contentMd.match(/\[(INSERT|CONFIRM|TBD)[^\]]*\]/g) || []).length;
    docViewer(view, {
      title: p.title,
      sub: left ? `${left} placeholder${left === 1 ? '' : 's'} to fill in before you submit. They are highlighted in red.` : 'No placeholders left. Read it through once more, then save the PDF.',
      extra: `<button id="pv-rename" class="btn-ghost">Rename</button><button id="pv-archive" class="btn-ghost">Archive</button>`,
      md: p.contentMd,
      save: (md) => api('/proposals/' + p.id, { method: 'PATCH', body: { contentMd: md } }),
      book: (md) => openProposalBook(p, md),
      word: async (md) => proposalWord(Object.assign(await proposalContext(p), { style: styleKey(p.style) }, bookOpts(p.pdfOptions)), md),
    });
    $('#pv-rename').addEventListener('click', () => renameProposal(p, () => render()));
    $('#pv-archive').addEventListener('click', () => archiveProposal(p, () => navigate('/proposals')));
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
  function docViewer(view, { title, sub, md, save, book, word, extra = '' }) {
    let content = md;
    const slug = (title || 'document').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'document';
    view.innerHTML = `
      <div class="no-print">${pageHead(esc(title), esc(sub),
        `${extra}<button id="edit" class="btn-ghost">Edit</button><button id="copy" class="btn-ghost">Copy</button>
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

  /*__TOOLS__*/

  render();
})();
