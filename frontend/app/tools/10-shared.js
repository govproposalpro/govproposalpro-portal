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
