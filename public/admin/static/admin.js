/* GovProposalPro Admin: for the team and VAs. Plain JS, same-origin only, no inline handlers. */
(() => {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const state = { me: null, shellReady: false };

  class ApiError extends Error {
    constructor(message, status, data) { super(message); this.status = status; this.data = data; }
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api/admin' + path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty */ }
    if (res.status === 401 && !path.startsWith('/auth/')) {
      state.me = null;
      state.shellReady = false;
      navigate(data.mfaRequired ? '/login?step=verify' : '/login');
      throw new ApiError(data.error || 'Please sign in.', 401, data);
    }
    if (!res.ok) throw new ApiError(data.error || 'Something went wrong. Please try again.', res.status, data);
    return data;
  }

  let toastTimer;
  function toast(msg, kind = 'info') {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('text-brand-redSoft', kind === 'error');
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 4200);
  }

  const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never');
  const pill = (text, tone) => {
    const t = { blue: 'bg-brand-blue/15 text-brand-blueSoft', red: 'bg-brand-red/15 text-brand-redSoft', green: 'bg-emerald-500/15 text-emerald-300', gray: 'bg-white/[0.06] text-mist-300', grad: 'bg-gradient-to-r from-brand-blue to-brand-red text-white' }[tone];
    return `<span class="pill ${t}">${esc(text)}</span>`;
  };
  const tierPill = (t) => (t === 'enterprise' ? pill('Enterprise', 'grad') : pill('Core', 'blue'));

  // ------------------------------------------------------------------ routing

  const routePath = () => location.pathname.replace(/^\/admin/, '').replace(/\/$/, '') || '/';
  function navigate(path) {
    history.pushState(null, '', '/admin' + (path === '/' ? '' : path));
    render();
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-link]');
    if (!a || e.metaKey || e.ctrlKey || e.button !== 0) return;
    e.preventDefault();
    navigate(a.getAttribute('href').replace(/^\/admin/, '') || '/');
  });
  window.addEventListener('popstate', render);

  // ------------------------------------------------------------------ shared UI

  const authCard = (title, sub, inner) => `
    <main class="flex min-h-screen items-center justify-center px-4 py-12">
      <div class="w-full max-w-md">
        <img src="/assets/gpp-logo.png" alt="GovProposalPro" width="900" height="543" class="mx-auto mb-3 h-auto w-48" />
        <p class="mb-8 text-center text-xs font-semibold uppercase tracking-[0.3em] text-brand-redSoft">Admin</p>
        <div class="card p-7 sm:p-9">
          <h1 class="text-xl font-bold text-white">${title}</h1>
          ${sub ? `<p class="mt-1 text-sm text-mist-400">${sub}</p>` : ''}
          ${inner}
        </div>
      </div>
    </main>`;
  const errBox = '<p data-error class="mt-4 hidden rounded-2xl border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm text-brand-redSoft" role="alert"></p>';
  const showErr = (root, msg) => { const e = $('[data-error]', root); e.textContent = msg; e.classList.remove('hidden'); };
  const hideErr = (root) => { const e = $('[data-error]', root); if (e) e.classList.add('hidden'); };

  async function busy(btn, fn) {
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = label; }
  }

  function openModal(html) {
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center';
    wrap.innerHTML = `<div class="card my-8 w-full max-w-lg p-6 sm:p-8" role="dialog" aria-modal="true">${html}</div>`;
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    $$('[data-close]', wrap).forEach((b) => b.addEventListener('click', close));
    const first = $('input, select, textarea', wrap);
    if (first) first.focus();
    return { el: wrap, close };
  }

  // Shows a one-time link with a copy button (reset, invite and setup links).
  function linkModal(title, info) {
    const m = openModal(`
      <h2 class="text-lg font-bold text-white">${esc(title)}</h2>
      <p class="mt-2 text-sm text-mist-300">${info.emailed ? 'We emailed this link. You can also copy it and send it yourself.' : 'Email is not set up, so copy this link and send it to them directly.'} It works once and expires in ${esc(info.expires)}.</p>
      <div class="mt-4 flex gap-2"><input class="field font-mono !text-xs" readonly value="${esc(info.url)}" /><button class="btn-primary shrink-0" data-copy>Copy</button></div>
      <p class="mt-3 text-xs text-mist-500">Treat this like a password: only send it to the person it is for.</p>
      <div class="mt-6 flex justify-end"><button class="btn-ghost" data-close>Done</button></div>`);
    $('[data-copy]', m.el).addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(info.url); toast('Link copied.'); } catch { $('input', m.el).select(); }
    });
  }

  // ------------------------------------------------------------------ sign-in, MFA, setup

  function renderLogin() {
    const step = new URLSearchParams(location.search).get('step');
    if (step === 'enroll') return renderEnroll();
    if (step === 'verify') return renderVerify();
    $('#root').innerHTML = authCard('Admin sign in', 'Team and VA access to GovProposalPro.', `
      <form id="f" class="mt-6 space-y-4" novalidate>
        <div><label class="label" for="email">Email</label><input id="email" type="email" autocomplete="username" class="field" required /></div>
        <div><label class="label" for="password">Password</label><input id="password" type="password" autocomplete="current-password" class="field" required /></div>
        ${errBox}
        <button class="btn-primary w-full !py-3.5" type="submit">Continue</button>
      </form>
      <p class="mt-5 text-center text-xs text-mist-500">Forgot your password or lost your phone? Ask an owner for a new setup link.</p>`);
    const f = $('#f');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideErr(f);
      await busy($('button', f), async () => {
        try {
          const r = await api('/auth/login', { method: 'POST', body: { email: $('#email').value, password: $('#password').value } });
          navigate(`/login?step=${r.next}`);
        } catch (err) { showErr(f, err.message); }
      });
    });
  }

  async function renderEnroll() {
    $('#root').innerHTML = authCard('Set up two-step sign-in', 'Required for every admin account.', '<div id="enroll" class="mt-6 flex justify-center"><span class="spinner"></span></div>');
    let data;
    try {
      data = await api('/auth/mfa/enroll/start', { method: 'POST' });
    } catch (err) {
      if (err.status === 401) return navigate('/login');
      $('#enroll').innerHTML = `<p class="text-sm text-brand-redSoft">${esc(err.message)}</p>`;
      return;
    }
    $('#enroll').outerHTML = `
      <form id="f" class="mt-6" novalidate>
        <ol class="space-y-3 text-sm text-mist-300">
          <li>1. Open an authenticator app on your phone (Google Authenticator, Authy, 1Password or Microsoft Authenticator).</li>
          <li>2. Scan this QR code, or enter the key by hand.</li>
        </ol>
        <div class="my-5 flex justify-center"><img src="${esc(data.qr)}" alt="Authenticator QR code" width="220" height="220" class="rounded-2xl bg-white p-2" /></div>
        <p class="break-all rounded-2xl bg-ink-900/70 p-3 text-center font-mono text-xs tracking-widest text-mist-100">${esc(data.secret.replace(/(.{4})/g, '$1 ').trim())}</p>
        <label class="label mt-5" for="code">3. Enter the 6-digit code it shows</label>
        <input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" class="field text-center font-mono !text-xl tracking-[0.5em]" />
        ${errBox}
        <button class="btn-primary mt-5 w-full !py-3.5" type="submit">Turn on two-step sign-in</button>
      </form>`;
    const f = $('#f');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideErr(f);
      await busy($('button', f), async () => {
        try {
          await api('/auth/mfa/enroll', { method: 'POST', body: { code: $('#code').value.trim() } });
          state.me = null;
          navigate('/');
        } catch (err) { showErr(f, err.message); }
      });
    });
  }

  function renderVerify() {
    $('#root').innerHTML = authCard('Enter your code', 'Open your authenticator app and enter the 6-digit code for GovProposalPro Admin.', `
      <form id="f" class="mt-6" novalidate>
        <input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" class="field text-center font-mono !text-xl tracking-[0.5em]" />
        ${errBox}
        <button class="btn-primary mt-5 w-full !py-3.5" type="submit">Verify</button>
      </form>
      <p class="mt-5 text-center text-xs text-mist-500">Lost your phone? Ask an owner for a new setup link.</p>`);
    const f = $('#f');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideErr(f);
      await busy($('button', f), async () => {
        try {
          await api('/auth/mfa/verify', { method: 'POST', body: { code: $('#code').value.trim() } });
          state.me = null;
          navigate('/');
        } catch (err) {
          if (err.status === 401) return navigate('/login');
          showErr(f, err.message);
        }
      });
    });
  }

  async function renderSetup() {
    const token = location.hash.slice(1);
    $('#root').innerHTML = authCard('Set up your admin login', '', '<div id="setup" class="mt-6 flex justify-center"><span class="spinner"></span></div>');
    let who;
    try {
      who = await api('/auth/setup/check', { method: 'POST', body: { token } });
    } catch (err) {
      $('#setup').innerHTML = `<p class="text-sm text-brand-redSoft">${esc(err.message)}</p>`;
      return;
    }
    $('#setup').outerHTML = `
      <form id="f" class="mt-4 space-y-4" novalidate>
        <p class="text-sm text-mist-300">Creating the password for <strong class="text-white">${esc(who.email)}</strong>. Next you'll set up two-step sign-in with an authenticator app.</p>
        <div><label class="label" for="pw">New password</label><input id="pw" type="password" autocomplete="new-password" class="field" /></div>
        <div><label class="label" for="pw2">Confirm password</label><input id="pw2" type="password" autocomplete="new-password" class="field" /></div>
        <p class="text-xs text-mist-500">At least 12 characters, with an uppercase letter, a lowercase letter and a number.</p>
        ${errBox}
        <button class="btn-primary w-full !py-3.5" type="submit">Save password</button>
      </form>`;
    const f = $('#f');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideErr(f);
      await busy($('button', f), async () => {
        try {
          await api('/auth/setup', { method: 'POST', body: { token, password: $('#pw').value, confirmPassword: $('#pw2').value } });
          history.replaceState(null, '', '/admin/login');
          toast('Password saved. Sign in to finish setup.');
          render();
        } catch (err) { showErr(f, err.message); }
      });
    });
  }

  // ------------------------------------------------------------------ shell

  function renderShell() {
    const owner = state.me.admin.role === 'owner';
    const link = (href, label) => `<a href="/admin${href === '/' ? '' : href}" data-link data-path="${href}" class="nav-link">${label}</a>`;
    $('#root').innerHTML = `
      <div class="flex min-h-screen flex-col lg:flex-row">
        <aside class="border-b border-white/[0.06] bg-ink-950/60 p-4 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div class="mb-5 flex items-center justify-between px-2 lg:block">
            <span class="flex items-center gap-2"><img src="/assets/gpp-logo-mark.png" alt="" width="480" height="499" class="h-7 w-auto" /><span class="text-[16px] font-semibold tracking-tight text-white">GovProposal<span class="text-mist-400">Pro</span></span></span>
            <span class="pill bg-brand-red/15 text-brand-redSoft lg:mt-3">Admin</span>
          </div>
          <nav class="flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
            ${link('/', 'Overview')}${link('/members', 'Members')}${link('/access', 'Access')}${link('/wins', 'Contract wins')}${link('/leads', 'Leads')}
            ${owner ? link('/team', 'Team') + link('/audit', 'Audit log') : ''}${link('/account', 'My account')}
          </nav>
          <div class="mt-5 hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 lg:block">
            <p class="truncate text-sm text-white">${esc(state.me.admin.fullName || state.me.admin.email)}</p>
            <p class="truncate text-xs text-mist-500">${esc(state.me.admin.email)} · ${owner ? 'Owner' : 'VA'}</p>
            <button id="logout" class="btn-ghost mt-3 w-full !py-1.5 !text-xs">Sign out</button>
          </div>
        </aside>
        <main id="view" class="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-10"></main>
      </div>`;
    $('#logout').addEventListener('click', async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      state.me = null;
      state.shellReady = false;
      navigate('/login');
    });
    state.shellReady = true;
  }

  const head = (title, sub, actions = '') => `
    <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div><h1 class="text-2xl font-bold tracking-tight text-white sm:text-3xl">${title}</h1>${sub ? `<p class="mt-1.5 text-mist-400">${sub}</p>` : ''}</div>
      <div class="flex flex-wrap gap-2">${actions}</div>
    </div>`;

  async function render() {
    const path = routePath();
    if (path === '/setup') return renderSetup();
    if (path === '/login') return renderLogin();
    if (!state.me) {
      try {
        state.me = await api('/me');
      } catch {
        return;
      }
      if (!state.me.mfa.passed) return navigate(`/login?step=${state.me.mfa.enrolled ? 'verify' : 'enroll'}`);
    }
    if (!state.shellReady) renderShell();
    $$('.nav-link[data-path]').forEach((a) => {
      const p = a.dataset.path;
      a.classList.toggle('active', p === '/' ? path === '/' : path.startsWith(p));
    });
    const view = $('#view');
    view.innerHTML = '<div class="flex justify-center py-20"><span class="spinner"></span></div>';
    let m;
    try {
      if (path === '/') await viewOverview(view);
      else if (path === '/members') await viewMembers(view);
      else if ((m = path.match(/^\/members\/(\d+)$/))) await viewMember(view, m[1]);
      else if (path === '/access') await viewAccess(view);
      else if (path === '/wins') await viewWins(view);
      else if (path === '/leads') await viewLeads(view);
      else if (path === '/team') await viewTeam(view);
      else if (path === '/audit') await viewAudit(view);
      else if (path === '/account') viewAccount(view);
      else view.innerHTML = '<p class="text-mist-400">Page not found.</p>';
    } catch (err) {
      if (err.status !== 401) view.innerHTML = `<div class="card p-8 text-center"><p class="text-white">Could not load this page</p><p class="mt-2 text-sm text-mist-400">${esc(err.message)}</p></div>`;
    }
  }

  // ------------------------------------------------------------------ overview

  async function viewOverview(view) {
    const { stats: s } = await api('/stats');
    const tile = (label, value, sub = '') => `<div class="card p-5"><p class="text-sm text-mist-400">${label}</p><p class="mt-2 text-3xl font-bold text-white">${value}</p>${sub ? `<p class="mt-1 text-xs text-mist-500">${sub}</p>` : ''}</div>`;
    view.innerHTML = `
      ${head(`Hi ${esc((state.me.admin.fullName || '').split(' ')[0] || 'there')}`, 'Members, logins and access at a glance.', '<button id="grant" class="btn-primary">Generate access</button>')}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        ${tile('Members', s.members, `${s.onboarded} finished onboarding`)}
        ${tile('Active this week', s.active7)}
        ${tile('Paid access', s.access_active, `${s.access_unclaimed} haven't created a login yet`)}
        ${tile('Proposals this month', s.proposals_month)}
      </div>
      ${s.locked ? `<a href="/admin/members" data-link class="card mt-4 block border-brand-red/30 p-4 text-sm text-brand-redSoft">${s.locked} member${s.locked === 1 ? ' is' : 's are'} locked out after too many wrong passwords. Find them in Members and unlock or send a reset link.</a>` : ''}
      <div class="card mt-6 p-6">
        <h2 class="font-semibold text-white">Common tasks</h2>
        <ul class="mt-3 space-y-2 text-sm text-mist-300">
          <li><strong class="text-white">Member forgot their password:</strong> Members → find them → Send reset link.</li>
          <li><strong class="text-white">Member locked out:</strong> Members → find them → Unlock.</li>
          <li><strong class="text-white">Buyer paid but can't sign up:</strong> Access → Generate access with their email and tier. They get an invite link.</li>
          <li><strong class="text-white">Upgrade to Enterprise:</strong> Members → find them → change Tier → Save.</li>
          <li><strong class="text-white">Refund or chargeback:</strong> Access → Revoke. Their sessions end immediately.</li>
        </ul>
      </div>`;
    $('#grant').addEventListener('click', grantModal);
  }

  function grantModal() {
    const m = openModal(`
      <form id="g" novalidate>
        <h2 class="text-lg font-bold text-white">Generate access</h2>
        <p class="mt-1 text-sm text-mist-400">Lets this email into GovProposalPro. If they have no login yet, we create one and send them a link to set their password.</p>
        <div class="mt-5 space-y-4">
          <div><label class="label" for="g-email">Email</label><input id="g-email" type="email" class="field" /></div>
          <div><label class="label" for="g-name">Full name (optional)</label><input id="g-name" class="field" maxlength="120" /></div>
          <div><label class="label" for="g-tier">Tier</label><select id="g-tier" class="field"><option value="core">Core Edition</option><option value="enterprise">Enterprise Edition</option></select></div>
        </div>
        ${errBox}
        <div class="mt-6 flex justify-end gap-2"><button type="button" class="btn-ghost" data-close>Cancel</button><button type="submit" class="btn-primary">Generate access</button></div>
      </form>`);
    const f = $('#g', m.el);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideErr(f);
      await busy($('button[type=submit]', f), async () => {
        try {
          const r = await api('/access', { method: 'POST', body: { email: $('#g-email', f).value, fullName: $('#g-name', f).value, tier: $('#g-tier', f).value } });
          m.close();
          if (r.invite) linkModal('Access granted: invite link', r.invite);
          else toast('Access granted. They already have a login, so they can sign in now.');
          if (routePath() === '/access' || routePath() === '/') render();
        } catch (err) { showErr(f, err.message); }
      });
    });
  }

  // ------------------------------------------------------------------ members

  async function viewMembers(view) {
    const q = new URLSearchParams(location.search).get('q') || '';
    const { members } = await api('/members' + (q ? `?q=${encodeURIComponent(q)}` : ''));
    view.innerHTML = `
      ${head('Members', 'Everyone with a GovProposalPro login.', '<button id="grant" class="btn-primary">Generate access</button>')}
      <form id="search" class="mb-4 flex gap-2"><input id="q" class="field" placeholder="Search by email, name, business or phone" value="${esc(q)}" /><button class="btn-ghost">Search</button></form>
      <div class="card overflow-x-auto">
        <table class="w-full min-w-[720px] text-left text-sm">
          <thead class="text-xs uppercase tracking-wider text-mist-500"><tr><th class="px-5 py-3">Member</th><th class="px-3 py-3">Tier</th><th class="px-3 py-3">Status</th><th class="px-3 py-3">Last sign-in</th></tr></thead>
          <tbody class="divide-y divide-white/[0.05]">
            ${members.map((u) => `<tr class="cursor-pointer hover:bg-white/[0.03]" data-id="${u.id}">
              <td class="px-5 py-3"><a href="/admin/members/${u.id}" data-link class="font-medium text-white hover:text-brand-blueSoft">${esc(u.fullName || u.email)}</a><p class="text-xs text-mist-500">${esc(u.email)}${u.businessName ? ' · ' + esc(u.businessName) : ''}</p></td>
              <td class="px-3 py-3">${tierPill(u.tier)}</td>
              <td class="px-3 py-3 space-x-1">${u.status === 'disabled' ? pill('Disabled', 'red') : u.status === 'invited' ? pill('Invited', 'gray') : pill('Active', 'green')}${u.access === 'revoked' ? pill('Revoked', 'red') : ''}${u.locked ? pill('Locked', 'red') : ''}</td>
              <td class="px-3 py-3 text-mist-400">${fmtDate(u.lastLoginAt)}</td></tr>`).join('') || '<tr><td colspan="4" class="px-5 py-8 text-center text-mist-500">No members found.</td></tr>'}
          </tbody>
        </table>
      </div>`;
    $('#grant').addEventListener('click', grantModal);
    $('#search').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#q').value.trim();
      navigate('/members' + (v ? `?q=${encodeURIComponent(v)}` : ''));
    });
    $$('tr[data-id]', view).forEach((tr) => tr.addEventListener('click', () => navigate('/members/' + tr.dataset.id)));
  }

  async function viewMember(view, id) {
    const { member: u, counts, usage } = await api('/members/' + id);
    const f = (name, label, value, attrs = '') => `<div><label class="label" for="m-${name}">${label}</label><input id="m-${name}" name="${name}" class="field" value="${esc(value ?? '')}" ${attrs} /></div>`;
    view.innerHTML = `
      ${head(esc(u.fullName || u.email), esc(u.email), `<a href="/admin/members" data-link class="btn-ghost">Back</a>`)}
      <div class="grid gap-6 lg:grid-cols-3">
        <section class="card p-6 lg:col-span-2">
          <form id="mf" novalidate>
            <div class="grid gap-4 sm:grid-cols-2">
              ${f('fullName', 'Full name', u.fullName)}${f('phone', 'Phone', u.phone)}
              ${f('businessName', 'Business name', u.businessName)}${f('website', 'Website', u.website)}
              ${f('uei', 'UEI', u.uei, 'maxlength="12"')}${f('cageCode', 'CAGE code', u.cageCode, 'maxlength="5"')}
              <div class="sm:col-span-2">${f('naics', 'NAICS codes', u.naics)}</div>
              <div class="sm:col-span-2"><label class="label" for="m-capabilities">Capabilities</label><textarea id="m-capabilities" name="capabilities" rows="4" class="field">${esc(u.capabilities || '')}</textarea></div>
              <div><label class="label" for="m-tier">Tier</label><select id="m-tier" name="tier" class="field"><option value="core" ${u.tier !== 'enterprise' ? 'selected' : ''}>Core Edition</option><option value="enterprise" ${u.tier === 'enterprise' ? 'selected' : ''}>Enterprise Edition</option></select></div>
              <div><label class="label" for="m-status">Account</label><select id="m-status" name="status" class="field"><option value="active" ${u.status !== 'disabled' ? 'selected' : ''}>Active</option><option value="disabled" ${u.status === 'disabled' ? 'selected' : ''}>Disabled (cannot sign in)</option></select></div>
            </div>
            ${errBox}
            <div class="mt-6 flex justify-end"><button class="btn-primary" type="submit">Save changes</button></div>
          </form>
        </section>
        <div class="space-y-6">
          <section class="card p-6">
            <h2 class="font-semibold text-white">Login help</h2>
            <div class="mt-3 flex flex-wrap gap-1.5">${tierPill(u.tier)}${u.status === 'invited' ? pill('Invite not accepted', 'gray') : ''}${u.access === 'revoked' ? pill('Access revoked', 'red') : u.access === 'none' ? pill('No purchase on file', 'red') : pill('Paid access', 'green')}${u.locked ? pill('Locked out', 'red') : ''}</div>
            <p class="mt-3 text-xs text-mist-500">Last sign-in ${esc(fmtDate(u.lastLoginAt))} · ${u.failedLogins} failed attempt${u.failedLogins === 1 ? '' : 's'} · ${counts.sessions} active session${counts.sessions === 1 ? '' : 's'}</p>
            <div class="mt-4 grid gap-2">
              <button id="reset" class="btn-primary">${u.status === 'invited' ? 'Resend invite link' : 'Send password reset link'}</button>
              <button id="unlock" class="btn-ghost" ${u.locked ? '' : 'disabled'}>Unlock account</button>
              <button id="signout" class="btn-ghost">Sign out of all devices</button>
            </div>
            <p class="mt-3 text-xs text-mist-500">For security, you never see or set a member's password. They choose it from the link.</p>
          </section>
          <section class="card p-6 text-sm">
            <h2 class="font-semibold text-white">Activity</h2>
            <dl class="mt-3 grid grid-cols-2 gap-2 text-mist-300">
              <dt>Proposals this month</dt><dd class="text-right text-white">${usage.used} / ${usage.limit}</dd>
              <dt>Total proposals</dt><dd class="text-right text-white">${counts.proposals}</dd>
              <dt>Opportunities</dt><dd class="text-right text-white">${counts.bids}</dd>
              <dt>Documents</dt><dd class="text-right text-white">${counts.documents}</dd>
              <dt>Onboarding</dt><dd class="text-right text-white">${u.onboarded ? 'Done' : 'Not finished'}</dd>
              <dt>Joined</dt><dd class="text-right text-white">${esc(fmtDate(u.createdAt))}</dd>
            </dl>
          </section>
        </div>
      </div>`;

    const form = $('#mf');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideErr(form);
      const body = Object.fromEntries(new FormData(form));
      await busy($('button[type=submit]', form), async () => {
        try {
          await api('/members/' + id, { method: 'PATCH', body });
          toast('Saved.');
          render();
        } catch (err) { showErr(form, err.message); }
      });
    });
    $('#reset').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      try { linkModal(u.status === 'invited' ? 'Invite link' : 'Password reset link', await api(`/members/${id}/reset-link`, { method: 'POST' })); } catch (err) { toast(err.message, 'error'); }
    }));
    $('#unlock').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      try { await api(`/members/${id}/unlock`, { method: 'POST' }); toast('Unlocked. They can try again now.'); render(); } catch (err) { toast(err.message, 'error'); }
    }));
    $('#signout').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      try { const r = await api(`/members/${id}/sign-out`, { method: 'POST' }); toast(`Signed out of ${r.sessions} session${r.sessions === 1 ? '' : 's'}.`); render(); } catch (err) { toast(err.message, 'error'); }
    }));
  }

  // ------------------------------------------------------------------ access

  async function viewAccess(view) {
    const q = new URLSearchParams(location.search).get('q') || '';
    const { access } = await api('/access' + (q ? `?q=${encodeURIComponent(q)}` : ''));
    view.innerHTML = `
      ${head('Access', 'Emails allowed to use GovProposalPro. Whop purchases land here automatically.', '<button id="grant" class="btn-primary">Generate access</button>')}
      <form id="search" class="mb-4 flex gap-2"><input id="q" class="field" placeholder="Search by email" value="${esc(q)}" /><button class="btn-ghost">Search</button></form>
      <div class="card overflow-x-auto">
        <table class="w-full min-w-[760px] text-left text-sm">
          <thead class="text-xs uppercase tracking-wider text-mist-500"><tr><th class="px-5 py-3">Email</th><th class="px-3 py-3">Tier</th><th class="px-3 py-3">Source</th><th class="px-3 py-3">Login</th><th class="px-3 py-3"></th></tr></thead>
          <tbody class="divide-y divide-white/[0.05]">
            ${access.map((a) => `<tr data-id="${a.id}">
              <td class="px-5 py-3"><p class="text-white">${esc(a.email)}</p><p class="text-xs text-mist-500">Added ${esc(fmtDate(a.createdAt))}</p></td>
              <td class="px-3 py-3"><select class="field !w-36 !py-1.5 !text-xs" data-tier><option value="core" ${a.tier !== 'enterprise' ? 'selected' : ''}>Core</option><option value="enterprise" ${a.tier === 'enterprise' ? 'selected' : ''}>Enterprise</option></select></td>
              <td class="px-3 py-3 text-mist-400">${esc(a.source)}</td>
              <td class="px-3 py-3">${a.memberId ? `<a href="/admin/members/${a.memberId}" data-link class="text-brand-blueSoft hover:text-white">${a.memberStatus === 'invited' ? 'Invited' : 'Has login'}</a>` : pill('Not yet', 'gray')}</td>
              <td class="px-3 py-3 text-right">${a.revokedAt ? `<button class="btn-ghost !py-1.5 !text-xs" data-restore>Restore</button>` : `<button class="btn-danger !py-1.5 !text-xs" data-revoke>Revoke</button>`}</td></tr>`).join('') || '<tr><td colspan="5" class="px-5 py-8 text-center text-mist-500">Nothing here yet.</td></tr>'}
          </tbody>
        </table>
      </div>`;
    $('#grant').addEventListener('click', grantModal);
    $('#search').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#q').value.trim();
      navigate('/access' + (v ? `?q=${encodeURIComponent(v)}` : ''));
    });
    $$('tr[data-id]', view).forEach((tr) => {
      const id = tr.dataset.id;
      $('[data-tier]', tr).addEventListener('change', async (e) => {
        try { await api('/access/' + id, { method: 'PATCH', body: { tier: e.target.value } }); toast('Tier updated.'); } catch (err) { toast(err.message, 'error'); }
      });
      const rev = $('[data-revoke]', tr);
      if (rev) rev.addEventListener('click', async () => {
        if (!confirm('Revoke access? They are signed out right away and cannot sign back in until restored.')) return;
        try { await api('/access/' + id, { method: 'PATCH', body: { revoked: true } }); toast('Access revoked.'); render(); } catch (err) { toast(err.message, 'error'); }
      });
      const res = $('[data-restore]', tr);
      if (res) res.addEventListener('click', async () => {
        try { await api('/access/' + id, { method: 'PATCH', body: { revoked: false } }); toast('Access restored.'); render(); } catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  // ------------------------------------------------------------------ contract wins (site popups)

  // Opt-ins from the demo video page, newest first. They also go to GoHighLevel when it is connected.
  async function viewLeads(view) {
    const params = new URLSearchParams(location.search);
    const q = params.get('q') || '';
    const page = Math.max(0, Number.parseInt(params.get('page'), 10) || 0);
    const data = await api(`/leads?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
    const go = (p) => navigate(`/leads?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
    const source = (l) => [l.utmSource, l.utmMedium].filter(Boolean).join(' / ') || 'Direct';
    view.innerHTML = `
      ${head('Leads', `${data.total} people have opted in on the demo page: ${data.today} today, ${data.week} in the last 7 days. Share govproposalpro.com/watch with UTM tags on each ad to see which one sent them.`,
        '<a href="/api/admin/leads.csv" class="btn-ghost" download>Download CSV</a>')}
      <form id="l-search" class="mb-4 flex gap-2"><input id="l-q" class="field" placeholder="Search name, email, phone, source or campaign" value="${esc(q)}" /><button class="btn-ghost">Search</button></form>
      <div class="card overflow-x-auto">
        <table class="w-full min-w-[860px] text-left text-sm">
          <thead class="text-xs uppercase tracking-wider text-mist-500"><tr><th class="px-5 py-3">Name</th><th class="px-3 py-3">Email</th><th class="px-3 py-3">Phone</th><th class="px-3 py-3">Source</th><th class="px-3 py-3">Campaign</th><th class="px-3 py-3">GoHighLevel</th><th class="px-3 py-3">Opted in</th></tr></thead>
          <tbody class="divide-y divide-white/[0.05]">
            ${data.leads.map((l) => `<tr>
              <td class="px-5 py-3 text-white">${esc(l.firstName)}${l.visits > 1 ? ` <span class="text-xs text-mist-500">×${l.visits}</span>` : ''}</td>
              <td class="px-3 py-3"><a class="text-brand-blueSoft hover:text-white" href="mailto:${esc(l.email)}">${esc(l.email)}</a></td>
              <td class="px-3 py-3"><a class="text-mist-300 hover:text-white" href="tel:${esc(l.phone)}">${esc(l.phone)}</a></td>
              <td class="px-3 py-3 text-mist-300">${esc(source(l))}</td>
              <td class="px-3 py-3 text-mist-300">${esc(l.utmCampaign || '')}${l.utmContent ? `<span class="block text-xs text-mist-500">${esc(l.utmContent)}</span>` : ''}</td>
              <td class="px-3 py-3">${l.inGhl ? pill('Synced', 'green') : pill('Not yet', 'gray')}</td>
              <td class="px-3 py-3 text-mist-400">${fmtDate(l.createdAt)}</td></tr>`).join('') || '<tr><td colspan="7" class="px-5 py-8 text-center text-mist-500">No leads yet. They appear here as soon as someone opts in on govproposalpro.com/watch.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="mt-4 flex justify-between">${page ? '<button id="l-prev" class="btn-ghost">Previous</button>' : '<span></span>'}${data.more ? '<button id="l-next" class="btn-ghost">Next</button>' : ''}</div>`;
    $('#l-search').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#l-q').value.trim(); navigate('/leads' + (v ? `?q=${encodeURIComponent(v)}` : '')); });
    if ($('#l-prev')) $('#l-prev').addEventListener('click', () => go(page - 1));
    if ($('#l-next')) $('#l-next').addEventListener('click', () => go(page + 1));
  }

  async function viewWins(view) {
    const params = new URLSearchParams(location.search);
    const q = params.get('q') || '';
    const page = Math.max(0, Number.parseInt(params.get('page'), 10) || 0);
    const data = await api(`/wins?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
    const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
    const go = (p) => navigate(`/wins?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
    view.innerHTML = `
      ${head('Contract wins', `${data.published} of ${data.total} wins show in the popups on the main site. Each visitor sees a fresh random set.`,
        '<button id="w-hide" class="btn-ghost">Hide all</button><button id="w-pub" class="btn-ghost">Publish all</button><button id="w-import" class="btn-ghost">Import list</button><button id="w-add" class="btn-primary">Add a win</button>')}
      <form id="w-search" class="mb-4 flex gap-2"><input id="w-q" class="field" placeholder="Search name or agency" value="${esc(q)}" /><button class="btn-ghost">Search</button></form>
      <div class="card overflow-x-auto">
        <table class="w-full min-w-[720px] text-left text-sm">
          <thead class="text-xs uppercase tracking-wider text-mist-500"><tr><th class="px-5 py-3">Member</th><th class="px-3 py-3 text-right">Amount</th><th class="px-3 py-3">Agency</th><th class="px-3 py-3">On site</th><th class="px-3 py-3"></th></tr></thead>
          <tbody class="divide-y divide-white/[0.05]">
            ${data.wins.map((w) => `<tr data-id="${w.id}">
              <td class="px-5 py-3 text-white">${esc(w.name)}</td><td class="px-3 py-3 text-right text-white">${money(w.amount)}</td><td class="px-3 py-3 text-mist-300">${esc(w.agency)}</td>
              <td class="px-3 py-3"><label class="inline-flex items-center gap-2 text-xs text-mist-300"><input type="checkbox" data-pub ${w.published ? 'checked' : ''} />${w.published ? 'Showing' : 'Hidden'}</label></td>
              <td class="px-3 py-3 text-right"><button class="btn-ghost !py-1.5 !text-xs" data-edit>Edit</button> <button class="btn-danger !py-1.5 !text-xs" data-del>Delete</button></td></tr>`).join('') || '<tr><td colspan="5" class="px-5 py-8 text-center text-mist-500">No wins yet.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="mt-4 flex justify-between">${page ? '<button id="w-prev" class="btn-ghost">Previous</button>' : '<span></span>'}${data.more ? '<button id="w-next" class="btn-ghost">Next</button>' : ''}</div>`;
    $('#w-search').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#w-q').value.trim(); navigate('/wins' + (v ? `?q=${encodeURIComponent(v)}` : '')); });
    if ($('#w-prev')) $('#w-prev').addEventListener('click', () => go(page - 1));
    if ($('#w-next')) $('#w-next').addEventListener('click', () => go(page + 1));
    const bulk = (published) => async () => {
      if (!confirm(published ? 'Show every win in the site popups?' : 'Hide every win from the site popups?')) return;
      try { const { changed } = await api('/wins/bulk', { method: 'POST', body: { published } }); toast(`${changed} updated.`); render(); } catch (err) { toast(err.message, 'error'); }
    };
    $('#w-pub').addEventListener('click', bulk(true));
    $('#w-hide').addEventListener('click', bulk(false));
    const winModal = (w) => {
      const m = openModal(`<h2 class="text-lg font-semibold text-white">${w ? 'Edit win' : 'Add a win'}</h2>
        <form class="mt-5 space-y-4" novalidate>
          <div><label class="label" for="wn">Member name as shown</label><input id="wn" name="name" class="field" maxlength="80" placeholder="Emily C." value="${esc(w ? w.name : '')}" /></div>
          <div><label class="label" for="wa">Amount ($)</label><input id="wa" name="amount" class="field" inputmode="decimal" value="${w ? Math.round(w.amount) : ''}" /></div>
          <div><label class="label" for="wg">Agency</label><input id="wg" name="agency" class="field" maxlength="160" placeholder="Department of Veterans Affairs" value="${esc(w ? w.agency : '')}" /></div>
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" data-close>Cancel</button><button class="btn-primary">Save</button></div>
        </form>`);
      $('form', m.el).addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target.elements;
        const body = { name: f.name.value, amount: f.amount.value, agency: f.agency.value };
        try {
          if (w) await api('/wins/' + w.id, { method: 'PATCH', body });
          else await api('/wins', { method: 'POST', body });
          m.close(); toast('Saved.'); render();
        } catch (err) { toast(err.message, 'error'); }
      });
    };
    $('#w-add').addEventListener('click', () => winModal(null));
    $('#w-import').addEventListener('click', () => {
      const m = openModal(`<h2 class="text-lg font-semibold text-white">Import wins</h2>
        <p class="mt-1 text-sm text-mist-400">Paste one per line, like: Emily C. just won a contract worth over $30,000 from the Department of Defense. CSV (name, amount, agency) works too.</p>
        <form class="mt-5 space-y-4"><textarea name="text" rows="10" class="field font-mono !text-xs"></textarea>
          <label class="flex items-center gap-2 text-sm text-mist-300"><input type="checkbox" name="published" checked />Show on the site right away</label>
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" data-close>Cancel</button><button class="btn-primary">Import</button></div></form>`);
      $('form', m.el).addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const { added } = await api('/wins', { method: 'POST', body: { import: e.target.elements.text.value, published: e.target.elements.published.checked } });
          m.close(); toast(`${added} wins added.`); render();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
    $$('tr[data-id]', view).forEach((tr) => {
      const w = data.wins.find((x) => String(x.id) === tr.dataset.id);
      $('[data-pub]', tr).addEventListener('change', async (e) => {
        try { await api('/wins/' + w.id, { method: 'PATCH', body: { published: e.target.checked } }); e.target.parentElement.lastChild.textContent = e.target.checked ? 'Showing' : 'Hidden'; } catch (err) { e.target.checked = !e.target.checked; toast(err.message, 'error'); }
      });
      $('[data-edit]', tr).addEventListener('click', () => winModal(w));
      $('[data-del]', tr).addEventListener('click', async () => {
        if (!confirm('Delete this win?')) return;
        try { await api('/wins/' + w.id, { method: 'DELETE' }); tr.remove(); } catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  // ------------------------------------------------------------------ team (owners)

  async function viewTeam(view) {
    const { admins } = await api('/admins');
    view.innerHTML = `
      ${head('Team', 'Admin logins for owners and VAs. Each person has their own login with two-step sign-in.', '<button id="add" class="btn-primary">Add team member</button>')}
      <div class="card overflow-x-auto">
        <table class="w-full min-w-[760px] text-left text-sm">
          <thead class="text-xs uppercase tracking-wider text-mist-500"><tr><th class="px-5 py-3">Person</th><th class="px-3 py-3">Role</th><th class="px-3 py-3">Login</th><th class="px-3 py-3">Last sign-in</th><th class="px-3 py-3"></th></tr></thead>
          <tbody class="divide-y divide-white/[0.05]">
            ${admins.map((a) => `<tr data-id="${a.id}">
              <td class="px-5 py-3"><p class="text-white">${esc(a.fullName || '')}</p><p class="text-xs text-mist-500">${esc(a.email)}</p></td>
              <td class="px-3 py-3">${a.role === 'owner' ? pill('Owner', 'grad') : pill('VA', 'blue')}</td>
              <td class="px-3 py-3 space-x-1">${a.disabledAt ? pill('Disabled', 'red') : !a.passwordSet ? pill('Needs setup', 'gray') : !a.mfaEnabled ? pill('No 2-step yet', 'gray') : pill('Ready', 'green')}${a.locked ? pill('Locked', 'red') : ''}</td>
              <td class="px-3 py-3 text-mist-400">${esc(fmtDate(a.lastLoginAt))}</td>
              <td class="px-3 py-3 text-right whitespace-nowrap">
                <button class="btn-ghost !py-1.5 !text-xs" data-link-btn>${a.passwordSet ? 'Reset login' : 'Setup link'}</button>
                <button class="btn-ghost !py-1.5 !text-xs" data-edit>Edit</button>
                ${a.id === state.me.admin.id ? '' : a.disabledAt ? '<button class="btn-ghost !py-1.5 !text-xs" data-enable>Enable</button>' : '<button class="btn-danger !py-1.5 !text-xs" data-disable>Disable</button>'}
              </td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="mt-4 text-sm text-mist-500">"Setup link" and "Reset login" give the person a one-time link to choose a password and connect a new authenticator app. Use it for new VAs, forgotten passwords and lost phones.</p>`;
    $('#add').addEventListener('click', () => adminModal(null));
    $$('tr[data-id]', view).forEach((tr) => {
      const a = admins.find((x) => String(x.id) === tr.dataset.id);
      $('[data-link-btn]', tr).addEventListener('click', async (e) => busy(e.currentTarget, async () => {
        try { linkModal(`Setup link for ${a.email}`, await api(`/admins/${a.id}/setup-link`, { method: 'POST' })); } catch (err) { toast(err.message, 'error'); }
      }));
      $('[data-edit]', tr).addEventListener('click', () => adminModal(a));
      const dis = $('[data-disable]', tr);
      if (dis) dis.addEventListener('click', async () => {
        if (!confirm(`Disable ${a.email}? They are signed out immediately.`)) return;
        try { await api('/admins/' + a.id, { method: 'PATCH', body: { disabled: true } }); render(); } catch (err) { toast(err.message, 'error'); }
      });
      const en = $('[data-enable]', tr);
      if (en) en.addEventListener('click', async () => {
        try { await api('/admins/' + a.id, { method: 'PATCH', body: { disabled: false, unlock: true } }); render(); } catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  function adminModal(a) {
    const m = openModal(`
      <form id="am" novalidate>
        <h2 class="text-lg font-bold text-white">${a ? 'Edit team member' : 'Add team member'}</h2>
        <div class="mt-5 space-y-4">
          <div><label class="label" for="a-name">Name</label><input id="a-name" class="field" maxlength="120" value="${esc(a ? a.fullName : '')}" /></div>
          <div><label class="label" for="a-email">Email</label><input id="a-email" type="email" class="field" value="${esc(a ? a.email : '')}" /></div>
          <div><label class="label" for="a-role">Role</label><select id="a-role" class="field"><option value="va" ${!a || a.role === 'va' ? 'selected' : ''}>VA: members and access</option><option value="owner" ${a && a.role === 'owner' ? 'selected' : ''}>Owner: everything, including team and audit log</option></select></div>
          ${a && a.locked ? '<label class="flex items-center gap-2 text-sm text-mist-300"><input id="a-unlock" type="checkbox" checked /> Unlock this login</label>' : ''}
        </div>
        ${errBox}
        <div class="mt-6 flex justify-end gap-2"><button type="button" class="btn-ghost" data-close>Cancel</button><button type="submit" class="btn-primary">${a ? 'Save' : 'Add and get setup link'}</button></div>
      </form>`);
    const f = $('#am', m.el);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideErr(f);
      const body = { fullName: $('#a-name', f).value, email: $('#a-email', f).value, role: $('#a-role', f).value };
      await busy($('button[type=submit]', f), async () => {
        try {
          if (a) {
            if ($('#a-unlock', f) && $('#a-unlock', f).checked) body.unlock = true;
            await api('/admins/' + a.id, { method: 'PATCH', body });
            m.close();
            toast('Saved.');
          } else {
            const r = await api('/admins', { method: 'POST', body });
            m.close();
            linkModal(`Setup link for ${body.email}`, r.setup);
          }
          render();
        } catch (err) { showErr(f, err.message); }
      });
    });
  }

  async function viewAudit(view) {
    const { entries } = await api('/audit');
    view.innerHTML = `
      ${head('Audit log', 'Every admin action, newest first.')}
      <div class="card overflow-x-auto">
        <table class="w-full min-w-[720px] text-left text-sm">
          <thead class="text-xs uppercase tracking-wider text-mist-500"><tr><th class="px-5 py-3">When</th><th class="px-3 py-3">Who</th><th class="px-3 py-3">Action</th><th class="px-3 py-3">On</th></tr></thead>
          <tbody class="divide-y divide-white/[0.05]">
            ${entries.map((e) => `<tr><td class="px-5 py-2.5 text-mist-400 whitespace-nowrap">${esc(fmtDate(e.createdAt))}</td><td class="px-3 py-2.5 text-mist-100">${esc(e.adminEmail || '')}</td>
              <td class="px-3 py-2.5"><code class="text-xs text-brand-blueSoft">${esc(e.action)}</code></td><td class="px-3 py-2.5 text-mist-300">${esc(e.target || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="px-5 py-8 text-center text-mist-500">Nothing yet.</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  function viewAccount(view) {
    view.innerHTML = `
      ${head('My account', esc(state.me.admin.email))}
      <form id="pf" class="card max-w-lg p-6" novalidate>
        <h2 class="font-semibold text-white">Change password</h2>
        <div class="mt-4 space-y-4">
          <div><label class="label" for="cur">Current password</label><input id="cur" type="password" autocomplete="current-password" class="field" /></div>
          <div><label class="label" for="new">New password</label><input id="new" type="password" autocomplete="new-password" class="field" /></div>
          <div><label class="label" for="new2">Confirm new password</label><input id="new2" type="password" autocomplete="new-password" class="field" /></div>
        </div>
        ${errBox}
        <div class="mt-6 flex justify-end"><button class="btn-primary" type="submit">Update password</button></div>
      </form>`;
    const f = $('#pf');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideErr(f);
      await busy($('button', f), async () => {
        try {
          await api('/me/password', { method: 'POST', body: { currentPassword: $('#cur').value, password: $('#new').value, confirmPassword: $('#new2').value } });
          f.reset();
          toast('Password updated.');
        } catch (err) { showErr(f, err.message); }
      });
    });
  }

  render();
})();
