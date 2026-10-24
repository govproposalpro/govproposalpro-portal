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
