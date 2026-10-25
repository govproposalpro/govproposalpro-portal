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
