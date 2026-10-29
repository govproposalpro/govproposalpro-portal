  // ------------------------------------------------------------------ Proposal workspace: edit, images, attachments
  //
  // Everything here works on the finished proposal without calling the AI, so members can rewrite,
  // add photos and attach documents as often as they like at no generation cost:
  //  - a visual editor (bold, headings, lists, images) with a Markdown view for power users;
  //  - images: up to 3 cover photos, and images placed anywhere in the text as ![caption](file:ID);
  //  - attachments (PDF, Word, photos) laid out as appendix pages after the last part;
  //  - Word round trip: download a real .docx, edit it in Word or Google Docs, upload it back.

  const PF_IMAGES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const PF_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const fileUrl = (id) => `/api/proposal-files/${id}`;
  const PF_ROLE = { cover: 'Cover photo', figure: 'In the text', appendix: 'Attachment' };

  /** Shrinks a photo in the browser (longest side 1800 px) so uploads and PDFs stay small. Word can't show WebP, so it becomes JPEG. */
  async function shrinkImage(blob) {
    // createImageBitmap reads the file directly, so the app's image policy needs no blob: URLs.
    let img;
    try { img = await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { throw new Error('That image could not be read.'); }
    try {
      const scale = Math.min(1, 1800 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      const g = c.getContext('2d');
      const png = blob.type === 'image/png' && c.width * c.height <= 1200 * 1200;
      if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
      g.drawImage(img, 0, 0, c.width, c.height);
      const mediaType = png ? 'image/png' : 'image/jpeg';
      const data = c.toDataURL(mediaType, 0.86).split(',')[1];
      return { data, mediaType, width: c.width, height: c.height };
    } finally { img.close(); }
  }

  /** Uploads one photo or document to a proposal. */
  async function uploadProposalFile(pid, file, role, caption = '') {
    const isImg = PF_IMAGES.includes(file.type);
    const isDoc = file.type === 'application/pdf' || /\.pdf$/i.test(file.name) || file.type === PF_DOCX || /\.docx$/i.test(file.name);
    if (!isImg && !isDoc) throw new Error(`${file.name}: add a photo (JPG, PNG, WebP), a PDF or a Word (.docx) file.`);
    if (!isImg && role !== 'appendix') throw new Error(`${file.name}: documents go in Attachments.`);
    if (!isImg && file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is over 10 MB.`);
    const body = { role, caption, name: file.name.slice(0, 160) };
    if (isImg) Object.assign(body, await shrinkImage(file));
    else Object.assign(body, { mediaType: /\.docx$/i.test(file.name) ? PF_DOCX : 'application/pdf', data: await readBase64(file) });
    return (await api(`/proposals/${pid}/files`, { method: 'POST', body })).file;
  }

  // ---- pdf.js, only when a PDF is attached

  let pdfjsLib = null;
  async function loadPdfjs() {
    if (!pdfjsLib) {
      pdfjsLib = await import('/app/static/vendor/pdf.min.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/app/static/vendor/pdf.worker.min.js';
    }
    return pdfjsLib;
  }

  const attCache = new Map();
  /** Each page of an attached PDF as a JPEG data URL (150 dpi, up to 40 pages). */
  async function pdfPages(id) {
    const key = 'pdf' + id;
    if (!attCache.has(key)) {
      attCache.set(key, (async () => {
        const lib = await loadPdfjs();
        const data = await (await fetch(fileUrl(id), { credentials: 'same-origin' })).arrayBuffer();
        const pdf = await lib.getDocument({ data, isEvalSupported: false, disableFontFace: true }).promise;
        const out = [];
        for (let n = 1; n <= Math.min(pdf.numPages, 40); n++) {
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: 1275 / base.width });
          const c = document.createElement('canvas');
          c.width = Math.round(vp.width);
          c.height = Math.round(vp.height);
          const g = c.getContext('2d');
          g.fillStyle = '#fff';
          g.fillRect(0, 0, c.width, c.height);
          await page.render({ canvasContext: g, viewport: vp }).promise;
          out.push({ src: c.toDataURL('image/jpeg', 0.85), width: c.width, height: c.height });
        }
        return { pages: out, more: pdf.numPages > 40 ? pdf.numPages : 0 };
      })().catch((err) => { attCache.delete(key); throw err; }));
    }
    return attCache.get(key);
  }

  /** A Word attachment's text as safe HTML. */
  async function docxHtml(id) {
    const key = 'docx' + id;
    if (!attCache.has(key)) attCache.set(key, api(`/proposal-files/${id}/html`).then((r) => cleanHtml(r.html)).catch((err) => { attCache.delete(key); throw err; }));
    return attCache.get(key);
  }

  // ---- HTML in from Word: keep only plain document structure

  const KEEP = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'BR', 'IMG', 'FIGURE', 'FIGCAPTION', 'SUP', 'SUB']);
  /** Rebuilds HTML from an outside source with only document tags; images only as data: URLs. */
  function cleanHtml(html) {
    const src = new DOMParser().parseFromString(String(html || ''), 'text/html').body;
    const copy = (from, to) => {
      for (const n of from.childNodes) {
        if (n.nodeType === 3) { to.appendChild(document.createTextNode(n.nodeValue)); continue; }
        if (n.nodeType !== 1) continue;
        if (!KEEP.has(n.tagName)) { if (!['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT'].includes(n.tagName)) copy(n, to); continue; }
        const el = document.createElement(n.tagName);
        if (n.tagName === 'IMG') {
          const s = n.getAttribute('src') || '';
          if (!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(s)) continue;
          el.setAttribute('src', s);
          el.setAttribute('alt', (n.getAttribute('alt') || '').slice(0, 300));
        }
        if (n.tagName === 'TD' || n.tagName === 'TH') {
          ['colspan', 'rowspan'].forEach((a) => { const v = Number.parseInt(n.getAttribute(a), 10); if (v > 1 && v < 50) el.setAttribute(a, String(v)); });
        }
        copy(n, el);
        to.appendChild(el);
      }
    };
    const out = document.createElement('div');
    copy(src, out);
    return out.innerHTML;
  }

  // ---- HTML back to the proposal's Markdown (visual editor and Word import)

  function htmlToMarkdown(root) {
    const sp = (s) => s.replace(/\s+/g, ' ');
    const inlineMd = (node) => {
      let s = '';
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { s += sp(n.nodeValue); continue; }
        if (n.nodeType !== 1) continue;
        const t = n.tagName;
        if (t === 'BR') { s += '\n'; continue; }
        if (t === 'IMG' || t === 'FIGURE') continue;
        const inner = inlineMd(n);
        if (!inner.trim()) { s += inner; continue; }
        const wrap = (mark) => { const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/); return `${m[1]}${mark}${m[2]}${mark}${m[3]}`; };
        if (t === 'STRONG' || t === 'B') s += wrap('**');
        else if (t === 'EM' || t === 'I') s += wrap('*');
        else if (t === 'CODE') s += wrap('`');
        else s += inner;
      }
      return s;
    };
    const lineOf = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean).join('\n');
    const out = [];
    const block = (n) => {
      if (n.nodeType === 3) { const t = n.nodeValue.trim(); if (t) out.push(sp(t)); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      const fig = n.matches('figure[data-file]') ? n : null;
      if (fig) {
        const cap = fig.querySelector('figcaption');
        out.push(`![${(cap ? cap.textContent : '').replace(/[\]\n]/g, ' ').trim()}](file:${fig.dataset.file})`);
        return;
      }
      if (/^H[1-6]$/.test(t)) { const txt = lineOf(inlineMd(n)).replace(/\n/g, ' '); if (txt) out.push(`${'#'.repeat(Math.min(Number(t[1]), 4))} ${txt}`); return; }
      if (t === 'HR') { out.push('---'); return; }
      if (t === 'UL' || t === 'OL') {
        let k = 0;
        const items = [];
        const walk = (list) => [...list.children].forEach((li) => {
          if (li.tagName !== 'LI') return;
          const own = li.cloneNode(true);
          own.querySelectorAll('ul, ol').forEach((x) => x.remove());
          const txt = lineOf(inlineMd(own)).replace(/\n/g, ' ');
          if (txt) items.push(`${t === 'OL' ? `${++k}.` : '-'} ${txt}`);
          li.querySelectorAll(':scope > ul, :scope > ol').forEach(walk);
        });
        walk(n);
        if (items.length) out.push(items.join('\n'));
        return;
      }
      if (t === 'TABLE') {
        const rows = [...n.querySelectorAll('tr')].map((tr) => [...tr.cells].map((c) => lineOf(inlineMd(c)).replace(/\n/g, ' ').replace(/\|/g, '/')));
        if (!rows.length) return;
        const w = Math.max(...rows.map((r) => r.length));
        const fill = (r) => `| ${[...r, ...Array(w - r.length).fill('')].join(' | ')} |`;
        out.push([fill(rows[0]), `|${' --- |'.repeat(w)}`, ...rows.slice(1).map(fill)].join('\n'));
        return;
      }
      if (t === 'P' || t === 'DIV' || t === 'SECTION' || t === 'ARTICLE' || t === 'BLOCKQUOTE' || t === 'LI') {
        // A block that holds other blocks is walked; a paragraph becomes one Markdown paragraph.
        if ([...n.children].some((c) => /^(P|DIV|H[1-6]|UL|OL|TABLE|FIGURE)$/.test(c.tagName))) { [...n.childNodes].forEach(block); return; }
        const txt = lineOf(inlineMd(n));
        if (txt) out.push(txt);
        return;
      }
      const txt = lineOf(inlineMd(n));
      if (txt) out.push(txt);
    };
    [...root.childNodes].forEach(block);
    return out.join('\n\n') + '\n';
  }

  // ---- the workspace

  async function proposalWorkspace(view, p) {
    let content = p.contentMd;
    let files = [];
    const loadFiles = async () => { files = (await api(`/proposals/${p.id}/files`)).files; };
    await loadFiles().catch(() => {});
    const left = () => (content.match(/\[(INSERT|CONFIRM|TBD)[^\]]*\]/g) || []).length;
    const sub = () => (left() ? `${left()} placeholder${left() === 1 ? '' : 's'} to fill in before you submit. They are highlighted in red.` : 'No placeholders left. Read it through once more, then save the PDF.');

    view.innerHTML = `
      <div class="no-print">${pageHead(esc(p.title), `<span id="pw-sub">${esc(sub())}</span>`,
        `<button id="pv-rename" class="btn-ghost">Rename</button><button id="pv-archive" class="btn-ghost">Archive</button>
         <button id="word" class="btn-ghost">${icon('doc', 'h-4 w-4')}Word</button><button id="print" class="btn-primary">${icon('proposal', 'h-4 w-4')}Proposal PDF</button>`)}</div>
      <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr),340px]">
        <article class="card min-w-0 overflow-hidden">
          <div id="pw-bar" class="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-3 sm:px-6">
            <div class="flex flex-wrap items-center gap-2">
              <button id="pw-edit" class="btn-primary !py-2">${icon('pen', 'h-4 w-4')}Edit text</button>
              <button id="copy" class="btn-ghost !py-2">Copy</button>
              <label class="btn-ghost cursor-pointer !py-2" title="Downloaded the Word file and edited it? Upload it here to update this proposal.">${icon('upload', 'h-4 w-4')}Upload edited Word<input id="pw-import" type="file" accept=".docx,${PF_DOCX}" class="sr-only" /></label>
            </div>
            <span class="text-xs text-mist-500">Editing is free. It never uses a proposal.</span>
          </div>
          <div id="pw-tools" class="ed-tools hidden">
            <button type="button" data-cmd="bold" title="Bold"><b>B</b></button>
            <button type="button" data-cmd="italic" title="Italic"><i>I</i></button>
            <span class="ed-sep"></span>
            <button type="button" data-block="h2" title="Part heading">Part</button>
            <button type="button" data-block="h3" title="Section heading">Section</button>
            <button type="button" data-block="p" title="Plain text">Text</button>
            <span class="ed-sep"></span>
            <button type="button" data-cmd="insertUnorderedList" title="Bullet list">• List</button>
            <button type="button" data-cmd="insertOrderedList" title="Numbered list">1. List</button>
            <span class="ed-sep"></span>
            <button type="button" id="pw-img" title="Add an image where your cursor is">${icon('upload', 'h-4 w-4')}Image</button>
            <button type="button" data-cmd="undo" title="Undo">Undo</button>
            <span class="flex-1"></span>
            <button type="button" id="pw-mode" class="!text-mist-400" title="Edit the raw Markdown">Markdown</button>
          </div>
          <div class="p-6 sm:p-10">
            <div id="doc" class="doc">${markdown(content)}</div>
            <textarea id="md" rows="30" class="field hidden font-mono !text-[13px] leading-relaxed"></textarea>
            <div id="pw-save" class="no-print mt-6 hidden flex-wrap items-center justify-end gap-2 border-t border-white/[0.07] pt-4">
              <span class="mr-auto text-xs text-mist-500">Changes stay in your browser until you save.</span>
              <button id="cancel-edit" class="btn-ghost">Cancel</button><button id="save" class="btn-primary">Save changes</button></div>
          </div>
        </article>
        <aside id="pw-media" class="no-print space-y-4"></aside>
      </div>`;
    $('#pv-rename').addEventListener('click', () => renameProposal(p, () => render()));
    $('#pv-archive').addEventListener('click', () => archiveProposal(p, () => navigate('/proposals')));
    $('#print').addEventListener('click', () => openProposalBook(p, content).catch((err) => toast(err.message, 'error')));
    $('#word').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try { await proposalWord(Object.assign(await proposalContext(p), { style: styleKey(p.style) }, bookOpts(p.pdfOptions)), content); } catch (err) { toast(err.message, 'error'); }
      btn.disabled = false;
    });
    $('#copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(content); toast('Copied to clipboard.'); } catch { toast('Copy failed. Select the text instead.', 'error'); }
    });

    // ---- editing
    const doc = $('#doc');
    const md = $('#md');
    let mode = null; // null (reading), 'visual' or 'markdown'
    const lockFigures = () => $$('figure', doc).forEach((f) => f.setAttribute('contenteditable', 'false'));
    const setMode = (next) => {
      mode = next;
      const editing = Boolean(mode);
      doc.contentEditable = mode === 'visual' ? 'true' : 'false';
      doc.classList.toggle('doc-editing', mode === 'visual');
      doc.classList.toggle('hidden', mode === 'markdown');
      md.classList.toggle('hidden', mode !== 'markdown');
      $('#pw-tools').classList.toggle('hidden', !editing);
      $('#pw-bar').classList.toggle('hidden', editing);
      $('#pw-save').classList.toggle('hidden', !editing);
      $('#pw-save').classList.toggle('flex', editing);
      $$('#pw-tools [data-cmd], #pw-tools [data-block], #pw-img').forEach((b) => { b.disabled = mode === 'markdown'; });
      $('#pw-mode').textContent = mode === 'markdown' ? 'Visual editor' : 'Markdown';
      if (mode === 'visual') { lockFigures(); doc.focus(); }
    };
    const currentMd = () => (mode === 'markdown' ? md.value : htmlToMarkdown(doc));
    $('#pw-edit').addEventListener('click', () => setMode('visual'));
    $('#pw-mode').addEventListener('click', () => {
      if (mode === 'visual') { md.value = htmlToMarkdown(doc); setMode('markdown'); } else { doc.innerHTML = markdown(md.value); setMode('visual'); }
    });
    $('#cancel-edit').addEventListener('click', () => { doc.innerHTML = markdown(content); setMode(null); });
    $('#save').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const next = currentMd();
      btn.disabled = true;
      try {
        await api('/proposals/' + p.id, { method: 'PATCH', body: { contentMd: next } });
        content = next;
        p.contentMd = next;
        doc.innerHTML = markdown(content);
        $('#pw-sub').textContent = sub();
        setMode(null);
        toast('Saved.');
      } catch (err) { toast(err.message, 'error'); }
      btn.disabled = false;
    });
    // Toolbar buttons keep the cursor where it was in the text.
    let range = null;
    const keepRange = () => { const s = getSelection(); if (s.rangeCount && doc.contains(s.anchorNode)) range = s.getRangeAt(0).cloneRange(); };
    doc.addEventListener('keyup', keepRange);
    doc.addEventListener('mouseup', keepRange);
    $('#pw-tools').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    $('#pw-tools').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cmd], [data-block]');
      if (!b || mode !== 'visual') return;
      doc.focus();
      if (b.dataset.cmd) document.execCommand(b.dataset.cmd);
      else document.execCommand('formatBlock', false, `<${b.dataset.block}>`);
      keepRange();
    });
    // Pasted text comes in plain, so outside formatting never leaks in.
    doc.addEventListener('paste', (e) => {
      if (mode !== 'visual') return;
      e.preventDefault();
      document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
    });
    const insertFigure = (f) => {
      const figHtml = `<figure class="pfig" data-file="${f.id}" contenteditable="false"><img src="${fileUrl(f.id)}" alt="${esc(f.caption || '')}" />${f.caption ? `<figcaption>${esc(f.caption)}</figcaption>` : ''}</figure>`;
      const holder = document.createElement('div');
      holder.innerHTML = figHtml;
      const fig = holder.firstElementChild;
      let at = range && doc.contains(range.startContainer) ? range.startContainer : null;
      while (at && at.parentNode !== doc) at = at.parentNode;
      if (at) at.after(fig); else doc.appendChild(fig);
      const p2 = document.createElement('p');
      p2.innerHTML = '<br>';
      if (!fig.nextElementSibling) fig.after(p2);
      toast('Image added. Save changes to keep it.');
    };
    $('#pw-img').addEventListener('click', () => pickImage(p, () => files, async (f) => { await loadFiles(); drawMedia(); insertFigure(f); }));

    // ---- Word round trip
    $('#pw-import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!/\.docx$/i.test(file.name)) { toast('Choose a Word (.docx) file. In Word: File > Save As > Word Document.', 'error'); return; }
      toast('Reading your Word file...');
      try {
        const { html } = await api(`/proposals/${p.id}/import-word`, { method: 'POST', body: { name: file.name, data: await readBase64(file) } });
        const next = await wordToMarkdown(p, html, content, files);
        await loadFiles();
        drawMedia();
        doc.innerHTML = markdown(next);
        setMode('visual');
        toast('Imported. Check it over, then press Save changes.');
      } catch (err) { toast(err.message, 'error'); }
    });

    // ---- images and attachments panel
    const media = $('#pw-media');
    const drawMedia = () => mediaPanel(media, p, files, {
      reload: async () => { await loadFiles(); drawMedia(); },
      editing: () => mode === 'visual',
      onInsert: (f) => { if (mode !== 'visual') setMode('visual'); insertFigure(f); },
    });
    drawMedia();
  }

  /** Small modal: choose an image already on the proposal, or upload a new one, for the text. */
  function pickImage(p, getFiles, done) {
    const imgs = getFiles().filter((f) => f.mediaType.startsWith('image/'));
    const m = openModal(`<h2 class="text-lg font-semibold text-white">Add an image</h2>
      <p class="mt-1 text-sm text-mist-400">It goes in right after the paragraph your cursor is in. Product photos, site photos, org charts and diagrams all work.</p>
      ${imgs.length ? `<div class="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4">${imgs.map((f) => `<button type="button" class="pf-thumb" data-pick="${f.id}" title="${esc(f.caption || f.name)}"><img alt="" src="${fileUrl(f.id)}" /></button>`).join('')}</div>` : ''}
      <label class="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-mist-300/20 bg-white/[0.02] px-6 py-6 text-center transition hover:border-brand-blueSoft/50">
        <span class="font-semibold text-white">Upload a new image</span><span class="mt-1 text-xs text-mist-400">JPG, PNG or WebP. It is resized for print.</span>
        <input id="pk-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only" /></label>
      <div class="mt-4"><label class="label" for="pk-cap">Caption (optional)</label><input id="pk-cap" class="field" maxlength="300" placeholder="e.g. Figure 1. Offered 9 ft umbrella with wind vent" /></div>
      <div class="mt-6 flex justify-end"><button type="button" class="btn-ghost" data-close>Cancel</button></div>`);
    const finish = async (f) => {
      const cap = $('#pk-cap', m.el).value.trim();
      if (cap && cap !== f.caption) f = (await api(`/proposal-files/${f.id}`, { method: 'PATCH', body: { caption: cap } })).file;
      m.close();
      await done(f);
    };
    $$('[data-pick]', m.el).forEach((b) => b.addEventListener('click', () => finish(imgs.find((f) => String(f.id) === b.dataset.pick)).catch((err) => toast(err.message, 'error'))));
    $('#pk-file', m.el).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try { await finish(await uploadProposalFile(p.id, file, 'figure', $('#pk-cap', m.el).value.trim())); } catch (err) { toast(err.message, 'error'); }
    });
  }

  /** The side panel: cover photos, images for the text, and attachments. */
  function mediaPanel(el, p, files, h) {
    const of = (role) => files.filter((f) => f.role === role).sort((a, b) => a.position - b.position || a.id - b.id);
    const covers = of('cover');
    const figs = of('figure');
    const atts = of('appendix');
    const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
    const kind = (f) => (f.mediaType === 'application/pdf' ? 'PDF' : f.mediaType === PF_DOCX ? 'Word' : 'Photo');
    const thumb = (f) => `<div class="pf-tile"><img alt="" src="${fileUrl(f.id)}" />
      <div class="pf-tile-bar">${f.role === 'figure' ? `<button type="button" data-ins="${f.id}" title="Put this image in the text">Insert</button><button type="button" data-cover="${f.id}" title="Use on the cover">Cover</button>` : `<button type="button" data-fig="${f.id}" title="Move to images for the text">Unpin</button>`}<button type="button" data-del="${f.id}" aria-label="Remove">&times;</button></div></div>`;
    const drop = (role, label, accept) => `<label class="pf-drop" data-role="${role}">${icon('upload', 'h-4 w-4')}<span>${label}</span><input type="file" multiple accept="${accept}" class="sr-only" data-up="${role}" /></label>`;
    el.innerHTML = `
      <section class="card p-5">
        <div class="flex items-center justify-between"><h2 class="font-semibold text-white">Cover photos</h2><span class="text-xs text-mist-500">${covers.length}/3</span></div>
        <p class="mt-1 text-xs text-mist-400">Shown on the proposal cover in every style.</p>
        ${covers.length ? `<div class="mt-3 grid grid-cols-3 gap-2">${covers.map(thumb).join('')}</div>` : ''}
        ${covers.length < 3 ? `<div class="mt-3">${drop('cover', 'Add cover photos', 'image/jpeg,image/png,image/webp')}</div>` : ''}
      </section>
      <section class="card p-5">
        <h2 class="font-semibold text-white">Images in the text</h2>
        <p class="mt-1 text-xs text-mist-400">Product shots, site photos, org charts. Press Insert to place one where your cursor is.</p>
        ${figs.length ? `<div class="mt-3 grid grid-cols-3 gap-2">${figs.map(thumb).join('')}</div>` : ''}
        <div class="mt-3">${drop('figure', 'Add images', 'image/jpeg,image/png,image/webp,image/gif')}</div>
      </section>
      <section class="card p-5">
        <h2 class="font-semibold text-white">Attachments</h2>
        <p class="mt-1 text-xs text-mist-400">Spec sheets, quotes, certificates, letters, resumes. They become lettered attachment pages at the end of the PDF.</p>
        ${atts.length ? `<ul class="mt-3 space-y-2">${atts.map((f, i) => `<li class="pf-att">
            <span class="pf-att-letter">${String.fromCharCode(65 + i)}</span>
            <span class="min-w-0 flex-1"><input class="pf-att-name" data-cap="${f.id}" value="${esc(f.caption || f.name.replace(/\.[a-z0-9]+$/i, ''))}" maxlength="300" aria-label="Attachment title" />
              <span class="block text-[11px] text-mist-500">${kind(f)} · ${size(f.bytes)}</span></span>
            <span class="flex shrink-0 items-center">
              <button type="button" class="pf-mini" data-up-pos="${f.id}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">&uarr;</button>
              <button type="button" class="pf-mini" data-down-pos="${f.id}" ${i === atts.length - 1 ? 'disabled' : ''} aria-label="Move down">&darr;</button>
              <button type="button" class="pf-mini" data-del="${f.id}" aria-label="Remove">&times;</button></span></li>`).join('')}</ul>` : ''}
        <div class="mt-3">${drop('appendix', 'Add PDF, Word or photos', `application/pdf,.pdf,.docx,${PF_DOCX},image/jpeg,image/png,image/webp`)}</div>
      </section>
      <p class="px-1 text-[11px] leading-relaxed text-mist-500">Up to 24 files and 30 MB per proposal. Photos are resized for print. None of this is sent to the AI.</p>`;

    const busy = (on) => { el.classList.toggle('pointer-events-none', on); el.classList.toggle('opacity-60', on); };
    const run = async (fn) => { busy(true); try { await fn(); await h.reload(); } catch (err) { toast(err.message, 'error'); } finally { busy(false); } };
    const upload = (role, list) => run(async () => {
      for (const f of [...list]) {
        try { await uploadProposalFile(p.id, f, role); } catch (err) { toast(err.message, 'error'); }
      }
    });
    $$('[data-up]', el).forEach((inp) => inp.addEventListener('change', (e) => upload(inp.dataset.up, e.target.files)));
    $$('.pf-drop', el).forEach((d) => {
      d.addEventListener('dragover', (e) => { e.preventDefault(); d.classList.add('on'); });
      d.addEventListener('dragleave', () => d.classList.remove('on'));
      d.addEventListener('drop', (e) => { e.preventDefault(); d.classList.remove('on'); upload(d.dataset.role, e.dataTransfer.files); });
    });
    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const id = Number(b.dataset.del || b.dataset.ins || b.dataset.cover || b.dataset.fig || b.dataset.upPos || b.dataset.downPos);
      const f = files.find((x) => x.id === id);
      if (!f) return;
      if (b.dataset.ins) { h.onInsert(f); return; }
      if (b.dataset.del) {
        if (f.role === 'figure' && (p.contentMd || '').includes(`(file:${f.id})`)) toast('That image is used in the text. It will show as missing until you remove it there too.', 'error');
        run(() => api(`/proposal-files/${f.id}`, { method: 'DELETE' }));
      } else if (b.dataset.cover) run(() => api(`/proposal-files/${f.id}`, { method: 'PATCH', body: { role: 'cover' } }));
      else if (b.dataset.fig) run(() => api(`/proposal-files/${f.id}`, { method: 'PATCH', body: { role: 'figure' } }));
      else {
        const i = atts.indexOf(f);
        const j = b.dataset.upPos ? i - 1 : i + 1;
        if (j < 0 || j >= atts.length) return;
        const order = [...atts];
        [order[i], order[j]] = [order[j], order[i]];
        run(() => Promise.all(order.map((x, k) => (x.position === k ? null : api(`/proposal-files/${x.id}`, { method: 'PATCH', body: { position: k } })))));
      }
    };
    $$('[data-cap]', el).forEach((inp) => inp.addEventListener('change', () => {
      api(`/proposal-files/${inp.dataset.cap}`, { method: 'PATCH', body: { caption: inp.value } })
        .then(({ file }) => { Object.assign(files.find((x) => x.id === file.id), file); toast('Attachment renamed.'); })
        .catch((err) => toast(err.message, 'error'));
    }));
  }

  /**
   * Turns a proposal the member edited in Word back into its Markdown: drops the cover, contents
   * and attachment pages our download adds, and saves the document's images to the proposal.
   */
  async function wordToMarkdown(p, html, oldMd, files) {
    const box = document.createElement('div');
    box.innerHTML = cleanHtml(html);
    // The body starts at the first part heading; everything before it is our cover and contents.
    const heads = [...box.querySelectorAll('h1, h2')];
    const first = heads.find((x) => /^\s*(part\s*1\b|0?1[.\s])/i.test(x.textContent)) || heads[0];
    if (first) {
      let n = box.firstChild;
      while (n && n !== first && !n.contains(first)) { const next = n.nextSibling; n.remove(); n = next; }
    }
    // Our attachment pages come back from the files themselves, not from the Word text.
    // (Our heading reads "Attachments" then "Attachment A: ..." on the next line, so no word break between them.)
    const att = [...box.querySelectorAll('h1, h2')].find((x) => /^\s*Attachments?(?![a-z])/.test(x.textContent));
    if (att) { let n = att; while (n) { const next = n.nextSibling; n.remove(); n = next; } }
    [...box.querySelectorAll('h1')].forEach((h) => { const h2 = document.createElement('h2'); h2.innerHTML = h.innerHTML; h.replaceWith(h2); });
    // Our download numbers each part ("Part 1: " or "1. "); the layout adds that back itself.
    [...box.querySelectorAll('h2')].forEach((h) => {
      const t = h.firstChild && h.firstChild.nodeType === 3 ? h.firstChild : null;
      if (t) t.textContent = t.textContent.replace(/^\s*(Part\s+\d+:\s*|\d+\.\s+)/i, '');
    });
    // Word bolds header cells; the proposal's tables mark the header row on their own.
    [...box.querySelectorAll('table tr:first-child > *')].forEach((c) => {
      const only = c.children.length === 1 && c.textContent.trim() === c.children[0].textContent.trim() ? c.children[0] : null;
      const strong = only && (only.matches('strong, b') ? only : only.matches('p') && only.children.length === 1 && only.textContent.trim() === only.children[0].textContent.trim() && only.children[0].matches('strong, b') ? only.children[0] : null);
      if (strong) strong.replaceWith(...strong.childNodes);
    });
    // Lines our download adds under each heading and at the foot of each page.
    [...box.querySelectorAll('p')].forEach((x) => {
      const t = x.textContent.trim();
      if (/^Solicitation Number:/i.test(t) || t === LEGEND_SHEET) x.remove();
    });
    // Images: reuse one already on the proposal when it is the same picture, otherwise upload it.
    const sha = async (buf) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const known = new Map();
    for (const f of files.filter((x) => x.mediaType.startsWith('image/'))) {
      try { known.set(await sha(await (await fetch(fileUrl(f.id), { credentials: 'same-origin' })).arrayBuffer()), f); } catch { /* skip */ }
    }
    for (const img of [...box.querySelectorAll('img')]) {
      // Decoded by hand: the app's connect policy does not allow fetching data: URLs.
      const [, type, b64] = /^data:([^;,]+);base64,(.*)$/.exec(img.getAttribute('src') || '') || [];
      if (!b64) { img.remove(); continue; }
      const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type });
      const alt = (img.getAttribute('alt') || '').trim();
      let f;
      try {
        const shrunk = await shrinkImage(blob);
        const bytes = Uint8Array.from(atob(shrunk.data), (c) => c.charCodeAt(0));
        f = known.get(await sha(bytes.buffer)) || known.get(await sha(await blob.arrayBuffer()));
        if (!f) f = (await api(`/proposals/${p.id}/files`, { method: 'POST', body: { role: 'figure', name: (alt || 'image').slice(0, 60) + (shrunk.mediaType === 'image/png' ? '.png' : '.jpg'), caption: alt, ...shrunk } })).file;
      } catch (err) { toast(err.message, 'error'); img.remove(); continue; }
      const fig = document.createElement('figure');
      fig.dataset.file = f.id;
      if (alt || f.caption) fig.innerHTML = `<figcaption>${esc(alt || f.caption)}</figcaption>`;
      // The caption our download writes under an image comes back as its own line: drop it.
      const host = img.closest('p, h1, h2, h3, h4, li, td, th');
      const block = host && host.tagName === 'P' ? host : null;
      const after = (block || img).nextElementSibling;
      if (after && alt && after.textContent.trim() === alt) after.remove();
      if (!host) { img.replaceWith(fig); continue; }
      img.remove();
      if (block && !block.textContent.trim()) block.replaceWith(fig);
      else if (block) block.after(fig);
      // An image inside a list or table cell moves out to just after it.
      else (host.closest('ul, ol, table') || host).after(fig);
    }
    const title = (oldMd.match(/^#\s+(.+)$/m) || [])[1] || p.title;
    const body = htmlToMarkdown(box).trim();
    if (body.length < 40) throw new Error('That Word file looks empty. Upload the proposal you downloaded and edited.');
    return `# ${title}\n\n${body}\n`;
  }
