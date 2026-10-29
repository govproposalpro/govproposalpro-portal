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
    const [sum, logo, files] = await Promise.all([
      p.rfpSummaryId ? api('/decryptor/' + p.rfpSummaryId).then((r) => r.summary.summary || {}).catch(() => ({})) : {},
      api('/me/logo').then((r) => r.logo).catch(() => null),
      api(`/proposals/${p.id}/files`).then((r) => r.files).catch(() => []),
    ]);
    const byRole = (role) => files.filter((f) => f.role === role).sort((a, b) => a.position - b.position || a.id - b.id);
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
      covers: byRole('cover').map((f) => fileUrl(f.id)),
      attachments: byRole('appendix'),
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

  /**
   * Loads what each attachment needs for layout (PDF pages drawn by pdf.js, Word text, photo sizes)
   * into ctx.atts. Cached, so changing style or accent doesn't redo it.
   */
  async function prepareAttachments(ctx) {
    ctx.atts = await Promise.all(ctx.attachments.map(async (f, i) => {
      const a = { letter: String.fromCharCode(65 + i), title: f.caption || f.name.replace(/\.[a-z0-9]+$/i, ''), file: f };
      try {
        if (f.mediaType === 'application/pdf') Object.assign(a, { kind: 'pdf' }, await pdfPages(f.id));
        else if (f.mediaType === PF_DOCX) Object.assign(a, { kind: 'doc', html: await docxHtml(f.id) });
        else Object.assign(a, { kind: 'image', src: fileUrl(f.id) });
      } catch {
        Object.assign(a, { kind: 'missing' });
      }
      return a;
    }));
    return ctx.atts;
  }

  /** Lays out the whole book into `book`. Returns the page count. */
  async function layoutBook(book, ctx, md, photos) {
    const parts = proposalParts(md);
    const atts = ctx.atts || [];
    // Images must know their size before pages are measured.
    const imgs = [...parts.flatMap((pt) => pt.blocks.flatMap((b) => [...b.querySelectorAll('img'), ...(b.tagName === 'IMG' ? [b] : [])]))];
    const attImgs = atts.filter((a) => a.kind === 'image').map((a) => { const i = new Image(); i.src = a.src; return i; });
    await Promise.all([...imgs, ...attImgs].map((i) => i.decode().catch(() => {})));
    book.innerHTML = '';
    book.className = `book bk-${ctx.style} acc-${ctx.accent}`;
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
    if (atts.length) {
      toc.push({ cls: 'bp-toc1', label: 'Attachments', att: -1 });
      atts.forEach((a, i) => toc.push({ cls: 'bp-toc2', label: `Attachment ${a.letter}: ${esc(a.title)}`, att: i }));
    }
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

    // Attachments, each starting a new page: a photo on its own page, a Word file's text, or each PDF page.
    atts.forEach((a, i) => {
      const head = document.createElement('h2');
      head.className = 'bp-part bp-att-head';
      head.innerHTML = ctx.style === 'executive' ? `<span class="bpx-no">${a.letter}</span><span>${esc(a.title)}</span>` : `Attachment ${a.letter}: ${esc(a.title)}`;
      let pages;
      if (a.kind === 'pdf' && a.pages.length) {
        pages = a.pages.map((pg, k) => {
          const page = bookPage(ctx, 'bp-attpdf');
          const body = page.querySelector('.bp-body');
          body.innerHTML = `<p class="bp-att-label">Attachment ${a.letter}: ${esc(a.title)} · page ${k + 1} of ${a.more || a.pages.length}</p><img alt="" src="${pg.src}" />`;
          book.appendChild(page);
          return page;
        });
        if (a.more) {
          const note = document.createElement('p');
          note.className = 'bp-att-label';
          note.textContent = `Pages 41 to ${a.more} are not shown. Submit the full file alongside this proposal.`;
          pages[pages.length - 1].querySelector('.bp-body').appendChild(note);
        }
      } else {
        const holder = document.createElement('div');
        if (a.kind === 'doc') holder.innerHTML = a.html;
        else if (a.kind === 'image') holder.innerHTML = `<figure class="bp-att-fig"><img alt="" src="${esc(a.src)}" /></figure>`;
        else holder.innerHTML = `<p class="ph">[This attachment could not be shown. Submit ${esc(a.file.name)} alongside this proposal.]</p>`;
        pages = flowBlocks(book, ctx, [head, ...holder.children]);
      }
      toc.find((t) => t.att === i).page = pageNo + 1;
      if (i === 0) toc.find((t) => t.att === -1).page = pageNo + 1;
      pageNo += pages.length;
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
          <label class="btn-ghost cursor-pointer" title="Up to 3, saved with this proposal">${icon('upload', 'h-4 w-4')}Cover photos<input id="book-photos" type="file" accept="image/png,image/jpeg,image/webp" multiple class="sr-only" /></label>
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
    // Each draw lays out off screen and swaps in when done, so quick clicks never mix two layouts.
    let drawing = 0;
    const draw = async () => {
      controls();
      const mine = ++drawing;
      const next = document.createElement('div');
      next.className = 'book book-next';
      $('#book').after(next);
      try {
        const n = await layoutBook(next, ctx, md, ctx.covers);
        if (mine !== drawing) { next.remove(); return; }
        $('#book').remove();
        next.id = 'book';
        next.classList.remove('book-next');
        $('#book-count').textContent = `${n} pages · US Letter · ${PROPOSAL_STYLES[ctx.style].name} style`;
      } catch (err) { next.remove(); toast(err.message, 'error'); }
    };
    $('#book').insertAdjacentHTML('afterbegin', '<p class="book-tip">Laying out your pages...</p>');
    if (ctx.attachments.length) $('#book-count').textContent = 'Preparing attachments...';
    await prepareAttachments(ctx);
    await draw();
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
    const close = () => {
      wrap.remove();
      document.body.classList.remove('book-open');
      document.removeEventListener('keydown', onKey);
      // Cover photos added here show up in the proposal's side panel.
      if (/^\/proposals\/\d+$/.test(routePath())) render();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    $('#book-close').addEventListener('click', close);
    $('#book-print').addEventListener('click', () => window.print());
    $('#book-word').addEventListener('click', () => proposalWord(ctx, md).catch((err) => toast(err.message, 'error')));
    $('#book-photos').addEventListener('change', async (e) => {
      for (const f of [...e.target.files]) {
        if (ctx.covers.length >= 3) { toast('The cover holds up to 3 photos. Remove one on the proposal page.', 'error'); break; }
        try { ctx.covers.push(fileUrl((await uploadProposalFile(p.id, f, 'cover')).id)); } catch (err) { toast(err.message, 'error'); }
      }
      e.target.value = '';
      draw();
    });
  }

  // ---- Word: a real .docx (docx and docx/html, loaded on first use) that Word, Google Docs and Pages edit

  let docxLib = null;
  function loadDocx() {
    const script = (src) => new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('The Word maker could not load. Check your connection and try again.')); document.head.appendChild(el); });
    if (!docxLib) {
      docxLib = ['index', 'math', 'html'].reduce((chain, f) => chain.then(() => script(`/app/static/vendor/docx-${f}.js`)), Promise.resolve())
        .then(() => ({ D: window.docx, H: window.docxHtml }))
        .catch((err) => { docxLib = null; throw err; });
    }
    return docxLib;
  }

  /** The proposal as an editable Word file in its style: cover, contents, one part per page, then attachments. */
  async function proposalWord(ctx, md) {
    toast('Building your Word file...');
    const [{ D, H }] = await Promise.all([loadDocx(), ctx.atts ? null : prepareAttachments(ctx)]);
    const style = styleKey(ctx.style);
    const acc = BOOK_ACCENTS[ctx.accent] || BOOK_ACCENTS.navy;
    const parts = proposalParts(md);
    const e = esc;
    const brk = 'style="page-break-before:always"';
    const to = ctx.submittedTo.map(e).join('<br>') || '[INSERT: contracting officer, agency and address]';
    const by = [ctx.company, ...ctx.offeror, ctx.email, ctx.website].filter(Boolean).map(e).join('<br>');
    const logo = (w) => (ctx.logo ? `<img src="${e(ctx.logo)}" width="${w}" alt="${e(ctx.company)} logo">` : '');
    const photos = ctx.covers.map((src) => `<img src="${e(src)}" width="300" alt="">`).join(' ');
    const covers = {
      house: `<table style="width:100%;border-collapse:collapse"><tr>
          <td style="width:50%;vertical-align:top;border-right:1.5pt solid #4A6FA5;padding-right:10pt">${logo(220) || `<p style="background:#1F3A68;color:#ffffff;font-size:16pt;padding:14pt">${e(ctx.company)}</p>`}
            <p><b><u>SUBMITTED TO:</u></b><br>${to}</p><p><b><u>OFFEROR:</u></b><br>${by}</p><p><b>Business Size and Type</b><br>${e(ctx.size)}</p></td>
          <td style="width:50%;vertical-align:top;text-align:center;padding-left:10pt"><p style="font-size:15pt;font-weight:bold;text-transform:uppercase">${e(ctx.title)}</p>
            <p><b>Solicitation Number</b>: ${e(ctx.solNumber)}</p><p><b>Response Date</b>: ${e(ctx.responseDue)}</p><p>${photos}</p></td></tr></table>`,
      executive: `<table style="width:100%;border-collapse:collapse"><tr><td style="background:${acc};padding:24pt;color:#ffffff">${ctx.logo ? `<p>${logo(160)}</p>` : `<p style="color:#ffffff;font-weight:bold">${e(ctx.company)}</p>`}
          <p style="color:#ffffff;font-size:9pt;letter-spacing:1pt">PROPOSAL · SOLICITATION ${e(ctx.solNumber)}</p>
          <p style="color:#ffffff;font-size:26pt;font-weight:bold">${e(ctx.title)}</p>
          ${ctx.agency ? `<p style="color:#ffffff">Prepared for ${e(ctx.agency)}</p>` : ''}<p style="color:#ffffff;font-size:9pt">Submitted by ${e(ctx.company)} · ${e(ctx.date)}</p></td></tr></table>
        ${photos ? `<p>${photos}</p>` : ''}
        <table style="width:100%;border-collapse:collapse;margin-top:12pt">
          <tr><td style="background:#EEF1F6;color:${acc};font-weight:bold;width:30%;padding:5pt">Solicitation</td><td style="padding:5pt">${e(ctx.solNumber)}</td></tr>
          <tr><td style="background:#EEF1F6;color:${acc};font-weight:bold;padding:5pt">Response due</td><td style="padding:5pt">${e(ctx.responseDue)}</td></tr>
          <tr><td style="background:#EEF1F6;color:${acc};font-weight:bold;padding:5pt">Business size</td><td style="padding:5pt">${e(ctx.size)}</td></tr>
          ${ctx.ids ? `<tr><td style="background:#EEF1F6;color:${acc};font-weight:bold;padding:5pt">Registrations</td><td style="padding:5pt">${e(ctx.ids)}</td></tr>` : ''}</table>
        <table style="width:100%;border-collapse:collapse;margin-top:12pt"><tr>
          <td style="width:50%;vertical-align:top"><p style="color:${acc};font-weight:bold;font-size:9pt">SUBMITTED TO</p><p>${to}</p></td>
          <td style="width:50%;vertical-align:top"><p style="color:${acc};font-weight:bold;font-size:9pt">OFFEROR</p><p>${by}</p></td></tr></table>`,
      plain: `${ctx.logo ? `<p style="text-align:center">${logo(180)}</p>` : ''}<p style="text-align:center;font-size:16pt;font-weight:bold;margin-top:60pt">${e(ctx.title)}</p>
        <p style="text-align:center">Submitted in response to Solicitation No. ${e(ctx.solNumber)}</p><p style="text-align:center">Response date: ${e(ctx.responseDue)}</p>${photos ? `<p style="text-align:center">${photos}</p>` : ''}
        <p style="margin-top:40pt"><b>Submitted to</b><br>${to}</p><p><b>Submitted by</b><br>${by}</p><p><b>Business size and type:</b> ${e(ctx.size)}</p>`,
    };
    const legend = ctx.legend ? `<p style="border:1pt solid #000000;padding:6pt;font-size:8pt"><b>RESTRICTION ON DISCLOSURE AND USE OF DATA.</b> ${LEGEND_TITLE('2 through the last sheet of this proposal')}</p>` : '';
    const titleOf = (n, html) => (style === 'house' ? `Part ${n + 1}: ${html}` : `${n + 1}. ${html}`);
    const atts = ctx.atts || [];
    const toc = `<p style="page-break-before:always;font-size:16pt;font-weight:bold">${style === 'executive' ? 'Contents' : 'Table of Contents'}</p>
      ${parts.map((pt, n) => `<p style="font-weight:bold">${titleOf(n, pt.html)}</p>`).join('')}
      ${atts.length ? `<p style="font-weight:bold">Attachments</p>${atts.map((a) => `<p style="margin-left:14pt">Attachment ${a.letter}: ${e(a.title)}</p>`).join('')}` : ''}`;
    const theme = `background:#EEF1F6;border-left:4pt solid ${acc};padding:8pt;color:${acc};font-weight:bold;font-size:11.5pt`;
    const body = parts.map((pt, n) => {
      const lead = pt.blocks.findIndex((b) => !/^H[3-6]$/.test(b.tagName));
      const blocks = pt.blocks.map((b, i) => {
        if (style === 'executive' && i === lead && b.tagName === 'P') return `<p style="${theme}">${b.innerHTML}</p>`;
        // Captions go in the image's alt text too, so a re-imported Word file keeps them.
        if (b.tagName === 'FIGURE') { const img = b.querySelector('img'); const cap = b.querySelector('figcaption'); return `<p style="text-align:center"><img src="${e(img.getAttribute('src'))}" alt="${e(cap ? cap.textContent : '')}"></p>${cap ? `<p style="text-align:center;font-style:italic;font-size:9pt">${cap.innerHTML}</p>` : ''}`; }
        return b.outerHTML;
      }).join('');
      const meta = style === 'house' && n ? `<p><b>Solicitation Number:</b> ${e(ctx.solNumber)}<br><b>Offeror:</b> ${e(ctx.company)}<br><b>Date of Submission:</b> ${e(ctx.date)}</p>` : '';
      return `<h2 ${brk}>${titleOf(n, pt.html)}</h2>${meta}${blocks}`;
    }).join('');
    const attHtml = atts.map((a, i) => {
      const head = `<h2 ${brk}>${i === 0 ? 'Attachments<br>' : ''}Attachment ${a.letter}: ${e(a.title)}</h2>`;
      if (a.kind === 'pdf') return head + a.pages.map((pg, k) => `${k ? `<p ${brk}></p>` : ''}<p style="text-align:center"><img src="${pg.src}" alt="${e(a.title)} page ${k + 1}"></p>`).join('');
      if (a.kind === 'doc') return head + a.html;
      if (a.kind === 'image') return `${head}<p style="text-align:center"><img src="${e(a.src)}" alt="${e(a.title)}"></p>`;
      return `${head}<p>[Submit ${e(a.file.name)} alongside this proposal.]</p>`;
    }).join('');
    const css = {
      house: `body{font-family:'Times New Roman';font-size:11pt}h2{font-size:14pt;color:#1F4E79;text-decoration:underline}h3{font-size:12pt;text-decoration:underline}h4{font-size:12pt}
        table{border-collapse:collapse;width:100%}td,th{border:1.5pt solid #1F4E8C;padding:4pt;vertical-align:top}th{text-align:center;font-weight:bold}`,
      executive: `body{font-family:Arial;font-size:10.5pt;color:#1d1d1f}h2{font-size:17pt;color:${acc}}h3{font-size:12pt;color:${acc}}
        table{border-collapse:collapse;width:100%}td,th{border:0.75pt solid #C9CED6;padding:5pt;vertical-align:top}th{background:${acc};color:#ffffff;text-align:left;font-weight:bold}`,
      plain: `body{font-family:'Times New Roman';font-size:12pt;color:#000000}h2{font-size:14pt}h3{font-size:12pt}h4{font-size:12pt;font-style:italic}
        table{border-collapse:collapse;width:100%}td,th{border:1pt solid #000000;padding:4pt;vertical-align:top}th{text-align:left;background:#F2F2F2;font-weight:bold}`,
    }[style] + '.ph{background:#FFE4E8;color:#9B0020}';
    // Every image the HTML points at, fetched once (figures and cover photos are proposal files).
    const html = covers[style] + legend + toc + body + attHtml;
    const srcs = [...new Set([...html.matchAll(/src="(\/api\/proposal-files\/\d+)"/g)].map((m) => m[1]))];
    const images = Object.fromEntries(await Promise.all(srcs.map(async (src) => [src, new Uint8Array(await (await fetch(src, { credentials: 'same-origin' })).arrayBuffer())])));
    const margin = style === 'plain' ? 1440 : 1152; // twips: 1 inch, 0.8 inch
    const children = H.htmlToContent(html, { stylesheet: css, images: (src) => images[src], maxImageWidth: style === 'plain' ? 624 : 662 });
    const font = style === 'executive' ? 'Arial' : 'Times New Roman';
    const small = (text) => new D.Paragraph({ children: [new D.TextRun({ text, size: 15, italics: true, color: '555555' })] });
    const pageNo = new D.Paragraph({ alignment: D.AlignmentType.RIGHT, children: [new D.TextRun({ children: ['Page ', D.PageNumber.CURRENT, ...(style === 'house' ? [] : [' of ', D.PageNumber.TOTAL_PAGES])], size: style === 'house' ? 24 : 18 })] });
    const head = style === 'house'
      ? (ctx.logo ? H.htmlToContent(logo(200), {}) : [new D.Paragraph({ children: [new D.TextRun({ text: ctx.company, bold: true, color: '1F3A68', size: 26 })] })])
      : [new D.Paragraph({ children: [new D.TextRun({ text: `${ctx.company}    ·    Solicitation ${ctx.solNumber}`, size: 16, color: style === 'executive' ? acc.slice(1) : '333333' })] })];
    const doc = new D.Document({
      creator: ctx.company,
      title: ctx.title,
      styles: {
        default: {
          document: { run: { font, size: style === 'plain' ? 24 : style === 'executive' ? 21 : 22 } },
          heading2: { run: { font, size: style === 'executive' ? 34 : 28, bold: true, color: style === 'plain' ? '000000' : style === 'executive' ? acc.slice(1) : '1F4E79', underline: style === 'house' ? {} : undefined }, paragraph: { spacing: { after: 160 } } },
          heading3: { run: { font, size: 24, bold: true, color: style === 'executive' ? acc.slice(1) : '000000' }, paragraph: { spacing: { before: 200, after: 80 } } },
        },
      },
      sections: [{
        properties: { titlePage: true, page: { margin: { top: margin, bottom: margin, left: margin, right: margin } } },
        headers: { default: new D.Header({ children: head }), first: new D.Header({ children: [] }) },
        footers: {
          default: new D.Footer({ children: [...(ctx.legend ? [small(LEGEND_SHEET)] : []), pageNo] }),
          first: new D.Footer({ children: [] }),
        },
        children,
      }],
    });
    const slug = ctx.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'proposal';
    download(slug + '.docx', await D.Packer.toBlob(doc));
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
