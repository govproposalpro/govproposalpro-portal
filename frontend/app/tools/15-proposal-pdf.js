  // ------------------------------------------------------------------ Proposal PDF in the house format
  //
  // Lays a proposal out the way winning small-business proposals look: a two-column cover page
  // (submitted to, offeror, business size, title, solicitation number, response date, photos),
  // a table of contents with real page numbers, the company logo banner on every page, numbered
  // "Part N:" sections that each start a new page, blue-ruled price tables and "Page N" footers.
  // Pages are laid out here at US Letter size so the preview, the PDF and the page numbers agree.

  //
  // Members pick one of three styles per proposal (proposals.style):
  //  - house: the format above, from the VA patio umbrella win. The default.
  //  - executive: a modern, full-color layout in the Shipley tradition: a bold cover with a
  //    "proposal at a glance" panel, a theme-statement callout opening each part, running
  //    headers (solicitation number and offeror) and shaded price tables. Accent color is the member's pick.
  //  - plain: the common Section L baseline (Times New Roman 12 pt, 1-inch margins, black on white)
  //    for solicitations with strict format rules or page limits.
  // Any style can carry the FAR 52.215-1(e) restrictive legend: the full notice on the cover and
  // the short notice at the foot of every sheet it covers.

  const BOOK_CERTS = { '8a': '8(a)', wosb: 'WOSB', sdvosb: 'SDVOSB', vosb: 'VOSB', hubzone: 'HUBZone', sdb: 'SDB' };

  const PROPOSAL_STYLES = {
    house: { name: 'House', tag: 'Default', blurb: 'Two-column cover, your logo on every page, blue-ruled tables. The format of our VA patio umbrella win.' },
    executive: { name: 'Executive', tag: 'New', blurb: 'Bold color cover, theme statements that open each part, running headers and shaded price tables.' },
    plain: { name: 'Section L Plain', tag: 'Strict', blurb: 'Times New Roman 12 pt, 1-inch margins, black and white. For solicitations with tight format rules or page limits.' },
  };
  const BOOK_ACCENTS = { navy: '#1B2F5E', crimson: '#9B1B30', teal: '#0F5E63', graphite: '#2B2F36' };
  const styleKey = (k) => (PROPOSAL_STYLES[k] ? k : 'house');
  const bookOpts = (o) => ({ accent: BOOK_ACCENTS[o && o.accent] ? o.accent : 'navy', legend: Boolean(o && o.legend) });

  // FAR 52.215-1(e): the title-page notice, and the notice on each restricted sheet.
  const LEGEND_TITLE = (sheets) => `This proposal includes data that shall not be disclosed outside the Government and shall not be duplicated, used, or disclosed, in whole or in part, for any purpose other than to evaluate this proposal. If, however, a contract is awarded to this offeror as a result of, or in connection with, the submission of this data, the Government shall have the right to duplicate, use, or disclose the data to the extent provided in the resulting contract. This restriction does not limit the Government's right to use information contained in this data if it is obtained from another source without restriction. The data subject to this restriction are contained in sheets ${sheets}.`;
  const LEGEND_SHEET = 'Use or disclosure of data contained on this sheet is subject to the restriction on the title page of this proposal.';

  /** Mini page drawings for the style picker (plain shapes, never a real proposal). */
  const styleThumb = (k) => `<span class="sty-thumb sty-${k}" aria-hidden="true"><i></i><b></b><b></b><b></b><em></em></span>`;

  /** Three style cards as radio buttons named `style`. */
  const stylePicker = (selected) => `<div class="grid gap-3 sm:grid-cols-3">${Object.entries(PROPOSAL_STYLES).map(([k, st]) => `
    <label class="sty-card"><input type="radio" name="style" value="${k}" class="sr-only" ${styleKey(selected) === k ? 'checked' : ''} />
      <span class="sty-inner">${styleThumb(k)}<span class="mt-3 flex items-center gap-2"><span class="font-semibold text-white">${st.name}</span><span class="pill ${k === 'executive' ? 'bg-gradient-to-r from-brand-blue/40 to-brand-red/40 text-white' : 'bg-white/[0.08] text-mist-300'}">${st.tag}</span></span>
      <span class="mt-1 block text-xs leading-relaxed text-mist-400">${st.blurb}</span></span></label>`).join('')}</div>`;

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
      agency: has(sum.agency) ? sum.agency : '',
      setAside: has(sum.set_aside) ? sum.set_aside : '',
      ids: [u.uei && `UEI ${u.uei}`, u.cageCode && `CAGE ${u.cageCode}`].filter(Boolean).join(' · '),
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
    const sol = esc(ctx.solNumber.replace(/^\[INSERT[^\]]*\]$/, ''));
    const head = ctx.style === 'executive'
      ? `<header class="bp-head bpx-head">${ctx.logo ? `<img class="bpx-logo" alt="" src="${esc(ctx.logo)}" />` : `<span class="bpx-name">${esc(ctx.company)}</span>`}<span class="bpx-run">${sol ? `Solicitation ${sol}` : esc(ctx.title)}</span></header>`
      : ctx.style === 'plain'
        ? `<header class="bp-head bpl-head"><span>${esc(ctx.company)}</span><span>${sol ? `Solicitation No. ${sol}` : ''}</span></header>`
        : `<header class="bp-head">${ctx.logo ? `<img class="bp-logo" alt="" src="${esc(ctx.logo)}" />` : `<span class="bp-logo-box">${esc(ctx.company)}</span>`}</header>`;
    page.innerHTML = `${head}<div class="bp-body"></div><footer class="bp-foot">${ctx.legend ? `<span class="bp-legend">${LEGEND_SHEET}</span>` : ''}<span class="bp-num"></span></footer>`;
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

  const legendBlock = (ctx) => (ctx.legend ? `<div class="bp-legend-box"><b>Restriction on disclosure and use of data</b><p>${LEGEND_TITLE('<span class="bp-sheets"></span>')}</p></div>` : '');

  function coverPage(ctx, photos) {
    if (ctx.style === 'executive') return coverExecutive(ctx, photos);
    if (ctx.style === 'plain') return coverPlain(ctx);
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
      </div>${legendBlock(ctx)}`;
    return page;
  }

  function coverExecutive(ctx, photos) {
    const page = document.createElement('section');
    page.className = 'bp bp-cover bpx-cover';
    const fact = (label, value) => (value ? `<div><dt>${label}</dt><dd>${value}</dd></div>` : '');
    page.innerHTML = `
      <div class="bpx-band">
        <div class="bpx-top"><span class="bpx-chip">${ctx.logo ? `<img alt="" src="${esc(ctx.logo)}" />` : esc(ctx.company)}</span><span class="bpx-kicker">Proposal</span></div>
        <p class="bpx-eyebrow">In response to Solicitation ${markdownInline(ctx.solNumber)}</p>
        <h1>${esc(ctx.title)}</h1>
        ${ctx.agency ? `<p class="bpx-for">Prepared for ${esc(ctx.agency)}</p>` : ''}
        <p class="bpx-by">Submitted by ${esc(ctx.company)} · ${esc(ctx.date)}</p>
      </div>
      ${photos.length ? `<div class="bpx-photos bpx-n${photos.length}">${photos.map((src) => `<img alt="" src="${esc(src)}" />`).join('')}</div>` : ''}
      <div class="bpx-glance">
        <h3>At a glance</h3>
        <dl>
          ${fact('Solicitation', markdownInline(ctx.solNumber))}
          ${fact('Response due', markdownInline(ctx.responseDue))}
          ${fact('Business size', esc(ctx.size))}
          ${fact('Set-aside', esc(ctx.setAside))}
          ${fact('Registrations', esc(ctx.ids))}
        </dl>
      </div>
      <div class="bpx-parties">
        <div><h3>Submitted to</h3><p>${ctx.submittedTo.length ? ctx.submittedTo.map(esc).join('<br>') : '<span class="ph">[INSERT: contracting officer, agency and address]</span>'}</p></div>
        <div><h3>Offeror</h3><p>${[ctx.company, ...ctx.offeror.filter((x) => !/^(UEI|Cage):/.test(x)), ctx.email, ctx.website].filter(Boolean).map(esc).join('<br>')}</p></div>
      </div>
      ${legendBlock(ctx)}
      <div class="bpx-rule"></div>`;
    return page;
  }

  function coverPlain(ctx) {
    const page = document.createElement('section');
    page.className = 'bp bp-cover bpl-cover';
    page.innerHTML = `
      <div class="bpl-title">
        ${ctx.logo ? `<img alt="" src="${esc(ctx.logo)}" />` : ''}
        <h1>${esc(ctx.title)}</h1>
        <p>Submitted in response to Solicitation No. ${markdownInline(ctx.solNumber)}</p>
        <p>Response date: ${markdownInline(ctx.responseDue)}</p>
      </div>
      <div class="bpl-parties">
        <div><h3>Submitted to</h3><p>${ctx.submittedTo.length ? ctx.submittedTo.map(esc).join('<br>') : '<span class="ph">[INSERT: contracting officer, agency and address]</span>'}</p></div>
        <div><h3>Submitted by</h3><p>${[ctx.company, ...ctx.offeror, ctx.email, ctx.website].filter(Boolean).map(esc).join('<br>')}</p>
          <p class="bpl-size"><b>Business size and type:</b> ${esc(ctx.size)}</p></div>
      </div>
      ${legendBlock(ctx)}`;
    return page;
  }

  /** How a part is titled in each style: "Part 2: Technical Proposal", or a numbered section. */
  const partTitle = (ctx, n, html) => (ctx.style === 'executive'
    ? `<span class="bpx-no">${String(n + 1).padStart(2, '0')}</span><span>${html}</span>`
    : ctx.style === 'plain' ? `${n + 1}. ${html}` : `Part ${n + 1}: ${html}`);
  const tocTitle = (ctx, n, html) => (ctx.style === 'house' ? `Part ${n + 1}: ${html}` : `${n + 1}. ${html}`);

  const markdownInline = (s) => esc(s).replace(/\[(INSERT|TBD|CONFIRM)[^\]]*\]/g, (m) => `<span class="ph">${m}</span>`);

  /** Lays out the whole book into `book`. */
  function layoutBook(book, ctx, md, photos) {
    book.innerHTML = '';
    book.className = `book bk-${ctx.style} acc-${ctx.accent}`;
    const parts = proposalParts(md);
    book.appendChild(coverPage(ctx, photos));

    // Table of contents first with blank page numbers, to know how many pages it takes.
    const toc = [];
    parts.forEach((part, n) => {
      toc.push({ cls: 'bp-toc1', label: tocTitle(ctx, n, part.html), part: n });
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
      h.textContent = ctx.style === 'executive' ? 'Contents' : 'Table of Contents';
      return [h, ...toc.map((t) => { const d = document.createElement('div'); d.innerHTML = tocLine(t.cls, t.label, t.page); return d.firstElementChild; })];
    };
    const tocPages = flowBlocks(book, ctx, tocBlocks());
    const startAt = 2 + tocPages.length; // cover is page 1

    let pageNo = startAt - 1;
    parts.forEach((part, n) => {
      const head = document.createElement('h2');
      head.className = 'bp-part';
      head.innerHTML = partTitle(ctx, n, part.html);
      const meta = document.createElement('div');
      meta.className = 'bp-meta';
      meta.innerHTML = `<p><b>Solicitation Number:</b> ${markdownInline(ctx.solNumber)}</p><p><b>Offeror:</b> ${esc(ctx.company)}</p><p><b>Date of Submission:</b> ${esc(ctx.date)}</p>`;
      // Executive: the opening paragraph of each part (after any subheading) becomes its theme statement, set in a callout.
      if (ctx.style === 'executive') {
        const lead = part.blocks.find((b) => !/^H[3-6]$/.test(b.tagName));
        if (lead && lead.tagName === 'P') lead.classList.add('bpx-theme');
      }
      // The running header already names the solicitation and offeror outside the house style.
      const blocks = n === 0 || ctx.style !== 'house' ? [head, ...part.blocks] : [head, meta, ...part.blocks];
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
    const all = [...book.querySelectorAll('.bp')];
    all.forEach((pg, i) => {
      const num = pg.querySelector('.bp-num');
      if (num) num.textContent = ctx.style === 'house' ? `Page ${i + 1}` : `Page ${i + 1} of ${all.length}`;
    });
    const sheets = book.querySelector('.bp-sheets');
    if (sheets) sheets.textContent = all.length > 1 ? `2 through ${all.length}` : '1';
    return all.length;
  }

  /** Full-screen preview of the formatted proposal: style, accent and legend controls, cover photos, Save as PDF. */
  async function openProposalBook(p, md) {
    const ctx = await proposalContext(p);
    const opts = bookOpts(p.pdfOptions);
    Object.assign(ctx, { style: styleKey(p.style), accent: opts.accent, legend: opts.legend });
    const photos = [];
    const wrap = document.createElement('div');
    wrap.id = 'book-wrap';
    wrap.className = 'book-wrap';
    wrap.innerHTML = `
      <div class="book-bar no-print">
        <div class="min-w-0"><p class="truncate text-sm font-semibold text-white">${esc(ctx.title)}</p><p class="text-xs text-mist-400" id="book-count"></p></div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="seg" role="radiogroup" aria-label="Proposal style">${Object.entries(PROPOSAL_STYLES).map(([k, st]) => `<button type="button" data-style="${k}" role="radio">${st.name}</button>`).join('')}</div>
          <div id="book-accents" class="flex items-center gap-1.5" aria-label="Accent color">${Object.entries(BOOK_ACCENTS).map(([k, c]) => `<button type="button" class="book-swatch book-sw-${k}" data-accent="${k}" title="${k[0].toUpperCase() + k.slice(1)}" aria-label="${k} accent"></button>`).join('')}</div>
          <label class="chip !py-1.5 !text-xs" title="Adds the FAR 52.215-1(e) restriction on disclosure and use of data to the cover and every page"><input id="book-legend" type="checkbox" class="accent-brand-blue" /> Data-rights legend</label>
        </div>
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
    const controls = () => {
      $$('[data-style]', wrap).forEach((b) => { const on = b.dataset.style === ctx.style; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
      $$('[data-accent]', wrap).forEach((b) => b.classList.toggle('on', b.dataset.accent === ctx.accent));
      $('#book-accents').classList.toggle('hidden', ctx.style !== 'executive');
      $('#book-legend').checked = ctx.legend;
    };
    const draw = () => {
      controls();
      $('#book-count').textContent = `${layoutBook($('#book'), ctx, md, photos)} pages · US Letter · ${PROPOSAL_STYLES[ctx.style].name} style`;
    };
    draw();
    // Style choices are saved on the proposal (and become the member's default) a moment after the last change.
    let saveTimer;
    const save = () => {
      p.style = ctx.style;
      p.pdfOptions = { accent: ctx.accent, legend: ctx.legend };
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        api('/proposals/' + p.id, { method: 'PATCH', body: { style: ctx.style, pdfOptions: p.pdfOptions } })
          .then(() => { if (state.me) state.me.user.proposalStyle = ctx.style; })
          .catch((err) => toast(err.message, 'error'));
      }, 600);
    };
    wrap.addEventListener('click', (e) => {
      const st = e.target.closest('[data-style]');
      const ac = e.target.closest('[data-accent]');
      if (st) ctx.style = st.dataset.style;
      else if (ac) ctx.accent = ac.dataset.accent;
      else return;
      draw();
      save();
    });
    $('#book-legend').addEventListener('change', (e) => { ctx.legend = e.target.checked; draw(); save(); });
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

  /** The same layout as a Word document, in the proposal's style: cover, contents, one part per page. */
  function proposalWord(ctx, md) {
    const style = styleKey(ctx.style);
    const acc = BOOK_ACCENTS[ctx.accent] || BOOK_ACCENTS.navy;
    const parts = proposalParts(md);
    const br = '<br clear="all" style="page-break-before:always">';
    const legend = ctx.legend ? `<p class="legend"><b>Restriction on disclosure and use of data.</b> ${LEGEND_TITLE('2 through the last sheet of this proposal')}</p>` : '';
    const sheetNote = ctx.legend ? `<p class="sheet">${LEGEND_SHEET}</p>` : '';
    const to = ctx.submittedTo.map(esc).join('<br>') || '[INSERT: contracting officer, agency and address]';
    const by = [ctx.company, ...ctx.offeror, ctx.email, ctx.website].filter(Boolean).map(esc).join('<br>');
    const covers = {
      house: `<table class="cover"><tr><td width="50%">${ctx.logo ? `<img src="${esc(ctx.logo)}" width="220">` : `<p class="logo">${esc(ctx.company)}</p>`}
        <h3>SUBMITTED TO:</h3><p>${to}</p><h3>OFFEROR:</h3><p>${by}</p>
        <h4>Business Size and Type</h4><p>${esc(ctx.size)}</p></td>
      <td width="50%" align="center"><h1>${esc(ctx.title)}</h1><p><b>Solicitation Number</b>: ${esc(ctx.solNumber)}</p><p><b>Response Date</b>: ${esc(ctx.responseDue)}</p></td></tr></table>`,
      executive: `<table class="band"><tr><td bgcolor="${acc}">${ctx.logo ? `<img src="${esc(ctx.logo)}" width="160"><br>` : ''}<p class="kick"><font color="#FFFFFF">PROPOSAL · SOLICITATION ${esc(ctx.solNumber)}</font></p>
        <h1>${esc(ctx.title)}</h1>${ctx.agency ? `<p class="for"><font color="#FFFFFF">Prepared for ${esc(ctx.agency)}</font></p>` : ''}<p class="for"><font color="#FFFFFF">Submitted by ${esc(ctx.company)} · ${esc(ctx.date)}</font></p></td></tr></table>
        <table class="glance"><tr><th bgcolor="#EEF1F6">Solicitation</th><td>${esc(ctx.solNumber)}</td></tr><tr><th bgcolor="#EEF1F6">Response due</th><td>${esc(ctx.responseDue)}</td></tr>
        <tr><th bgcolor="#EEF1F6">Business size</th><td>${esc(ctx.size)}</td></tr>${ctx.ids ? `<tr><th bgcolor="#EEF1F6">Registrations</th><td>${esc(ctx.ids)}</td></tr>` : ''}</table>
        <table class="parties"><tr><td width="50%"><h3>SUBMITTED TO</h3><p>${to}</p></td><td width="50%"><h3>OFFEROR</h3><p>${by}</p></td></tr></table>`,
      plain: `${ctx.logo ? `<p align="center"><img src="${esc(ctx.logo)}" width="180"></p>` : ''}<h1 align="center">${esc(ctx.title)}</h1>
        <p align="center">Submitted in response to Solicitation No. ${esc(ctx.solNumber)}</p><p align="center">Response date: ${esc(ctx.responseDue)}</p>
        <h3>Submitted to</h3><p>${to}</p><h3>Submitted by</h3><p>${by}</p><p><b>Business size and type:</b> ${esc(ctx.size)}</p>`,
    };
    const titleOf = (n, html) => (style === 'house' ? `Part ${n + 1}: ${html}` : `${n + 1}. ${html}`);
    const toc = `<h2 class="toc">${style === 'executive' ? 'Contents' : 'Table of Contents'}</h2>${parts.map((pt, n) => `<p class="t1">${titleOf(n, pt.html)}</p>`).join('')}`;
    const body = parts.map((pt, n) => {
      const lead = pt.blocks.findIndex((b) => !/^H[3-6]$/.test(b.tagName));
      const blocks = pt.blocks.map((b, i) => (style === 'executive' && i === lead && b.tagName === 'P' ? `<table class="themebox"><tr><td bgcolor="#EEF1F6"><p class="theme">${b.innerHTML}</p></td></tr></table>` : b.outerHTML)).join('');
      const meta = style === 'house' && n ? `<p><b>Solicitation Number:</b> ${esc(ctx.solNumber)}<br><b>Offeror:</b> ${esc(ctx.company)}<br><b>Date of Submission:</b> ${esc(ctx.date)}</p>` : '';
      // Word and LibreOffice honor bgcolor on header cells more reliably than CSS backgrounds.
      const cells = style === 'executive' ? blocks.replace(/<th>/g, `<th bgcolor="${acc}">`) : blocks;
      return `<h2>${titleOf(n, pt.html)}</h2>${meta}${cells}${sheetNote}`;
    }).join(br);
    const css = {
      house: `@page{size:8.5in 11in;margin:0.8in}body{font-family:'Times New Roman',Times,serif;font-size:11pt;line-height:1.3}h1{font-size:16pt;text-transform:uppercase}
        h2{font-size:14pt;color:#1F4E79;text-decoration:underline;margin-top:6pt}h3{font-size:12pt;text-decoration:underline}h4{font-size:12pt}
        table{border-collapse:collapse;width:100%}td,th{border:1.5pt solid #1F4E8C;padding:4pt;vertical-align:top}th{text-align:center}
        table.cover td{border:0;border-right:1.5pt solid #1F4E8C}.logo{background:#1F3A68;color:#fff;font-size:16pt;padding:14pt}.toc{color:#000}.t1{font-weight:bold;font-size:12pt}`,
      executive: `@page{size:8.5in 11in;margin:0.8in}body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;line-height:1.4;color:#1d1d1f}
        h1{font-size:24pt;color:#fff;margin:6pt 0}h2{font-size:17pt;color:${acc};border-bottom:2pt solid ${acc};padding-bottom:3pt}h3{font-size:12pt;color:${acc}}
        table{border-collapse:collapse;width:100%}td,th{border:0.75pt solid #C9CED6;padding:5pt;vertical-align:top}th{background:${acc};color:#fff;text-align:left}
        table.band td{background:${acc};color:#fff;border:0;padding:22pt}.kick{font-size:9pt;letter-spacing:1pt;color:#fff}.for{color:#fff}
        table.glance th{width:30%;background:#EEF1F6;color:${acc};border:0.75pt solid #C9CED6}table.parties td{border:0}.themebox td{border:0;border-left:4pt solid ${acc};background:#EEF1F6;padding:8pt}.theme{margin:0;font-size:11.5pt;font-weight:bold;color:${acc}}
        .toc{color:${acc}}.t1{font-weight:bold;font-size:12pt}`,
      plain: `@page{size:8.5in 11in;margin:1in}body{font-family:'Times New Roman',Times,serif;font-size:12pt;line-height:1.15;color:#000}h1{font-size:16pt}h2{font-size:14pt}h3{font-size:12pt}
        table{border-collapse:collapse;width:100%}td,th{border:1pt solid #000;padding:4pt;vertical-align:top}th{text-align:left}.t1{font-size:12pt}`,
    }[style];
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(ctx.title)}</title>
      <style>${css}.ph{background:#FFE4E8;color:#9B0020}.legend{border:1pt solid #000;padding:6pt;font-size:9pt}.sheet{font-size:8pt;font-style:italic;color:#444}</style></head>
      <body>${covers[style]}${legend}${br}${toc}${br}${body}</body></html>`;
    const slug = ctx.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'proposal';
    download(slug + '.doc', new Blob(['\ufeff', html], { type: 'application/msword' }));
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
