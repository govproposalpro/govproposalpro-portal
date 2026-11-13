  // ------------------------------------------------------------------ The member's own SAM.gov API key

  const SAM_KEY_STATE = {
    none: ['Not added', 'bg-white/[0.08] text-mist-300'],
    ok: ['Working', 'bg-emerald-500/15 text-emerald-300'],
    expiring: ['Expires soon', 'bg-amber-400/15 text-amber-200'],
    expired: ['Expired', 'bg-brand-red/20 text-brand-redSoft'],
    rejected: ['Not accepted', 'bg-brand-red/20 text-brand-redSoft'],
    broken: ['Re-enter key', 'bg-brand-red/20 text-brand-redSoft'],
  };

  function samKeyPill(k) {
    const s = (k && k.state) || 'none';
    const [label, cls] = SAM_KEY_STATE[s] || SAM_KEY_STATE.none;
    const extra = k && k.set && k.last4 ? `<span class="text-xs text-mist-500">ends in ${esc(k.last4)}${k.expiresOn ? ` · expires ${fmtDate(k.expiresOn)}` : ''}</span>` : '';
    return `<span class="inline-flex flex-wrap items-center gap-2"><span class="pill ${cls}">${label}</span>${extra}</span>`;
  }

  /** One line above every page while the key needs attention; on the dashboard also when none is saved. */
  function drawKeybar(path) {
    const bar = $('#keybar');
    if (!bar) return;
    const k = state.me && state.me.samKey;
    const s = (k && k.state) || 'none';
    const show = path !== '/sam-key' && path !== '/welcome' && (['expiring', 'expired', 'rejected', 'broken'].includes(s) || (s === 'none' && path === '/'));
    bar.classList.toggle('hidden', !show);
    if (!show) { bar.innerHTML = ''; return; }
    const msg = {
      none: ['Connect your free SAM.gov API key', 'It powers bid matching, subcontractor search, vetting and your SAM.gov check. It takes 2 minutes.', 'Add your key', 'border-brand-blueSoft/30 bg-brand-blue/10 text-mist-100'],
      expiring: [`Your SAM.gov API key expires ${k.daysLeft <= 0 ? 'today' : `in ${k.daysLeft} day${k.daysLeft === 1 ? '' : 's'}`}`, 'SAM.gov keys last 90 days. Get a new one in SAM.gov and paste it here so your tools keep working.', 'Update key', 'border-amber-300/30 bg-amber-400/10 text-amber-50'],
      expired: ['Your SAM.gov API key has expired', 'Bid matching, subcontractor search and vetting need a working key. Get a new one in SAM.gov under Account Details.', 'Add a new key', 'border-brand-red/30 bg-brand-red/10 text-mist-100'],
      rejected: ['SAM.gov stopped accepting your API key', 'It was probably reset or expired early. Get a new one in SAM.gov under Account Details.', 'Add a new key', 'border-brand-red/30 bg-brand-red/10 text-mist-100'],
      broken: ['Please re-enter your SAM.gov API key', 'We could not read your saved key after a security update. Paste it again.', 'Re-enter key', 'border-brand-red/30 bg-brand-red/10 text-mist-100'],
    }[s];
    bar.innerHTML = `<div class="flex flex-wrap items-center gap-3 rounded-3xl border ${msg[3]} p-4">
      <span class="ico-bubble ${s === 'none' ? 'ico-blue' : s === 'expiring' ? 'ico-violet' : 'ico-red'}">${icon('lockshield', 'h-4 w-4')}</span>
      <p class="min-w-0 flex-1 text-sm"><strong class="text-white">${esc(msg[0])}.</strong> <span class="text-mist-300">${esc(msg[1])}</span></p>
      <a href="/app/sam-key" data-link class="btn-primary !px-4 !py-2 !text-xs">${esc(msg[2])}</a></div>`;
  }

  async function viewSamKey(view) {
    let k = (await api('/me/sam-key')).samKey;
    const plus90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    const draw = () => {
      view.innerHTML = `
        ${pageHead('SAM.gov API key', 'Your own free key keeps your SAM.gov tools fast and working. SAM.gov makes every key expire after 90 days, so we remind you before yours does.')}
        <div class="grid items-start gap-6 lg:grid-cols-5">
          <section class="card p-6 sm:p-8 lg:col-span-3">
            <div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-semibold text-white">Your key</h2>${samKeyPill(k)}</div>
            ${k.state === 'rejected' ? `<p class="mt-3 rounded-2xl border border-brand-red/30 bg-brand-red/10 p-3 text-sm text-brand-redSoft">SAM.gov stopped accepting this key on ${fmtDate(k.rejectedOn)}. Paste a new one below.</p>` : ''}
            ${k.addedOn ? `<p class="mt-2 text-sm text-mist-400">Added ${fmtDate(k.addedOn)}.</p>` : ''}
            <form id="key-form" class="mt-6 space-y-4" novalidate>
              <label class="block"><span class="label">${k.set ? 'New SAM.gov API key' : 'SAM.gov API key'}</span>
                <input name="key" type="password" autocomplete="off" spellcheck="false" class="field" maxlength="200" placeholder="Paste the Public API Key from SAM.gov" /></label>
              <label class="block"><span class="label">Expiration date (shown under the key in SAM.gov)</span>
                <input name="expiresOn" type="date" class="field sm:max-w-[14rem]" value="${plus90}" /></label>
              <p class="text-xs text-mist-500">We check the key with SAM.gov, store it encrypted, and only ever show its last 4 characters. We email you 14, 7 and 1 days before it expires.</p>
              <div class="flex flex-wrap gap-2">
                <button type="submit" class="btn-primary">${icon('lockshield', 'h-4 w-4')}Save key</button>
                ${k.set ? '<button type="button" id="key-remove" class="btn-ghost">Remove key</button>' : ''}
              </div>
            </form>
          </section>
          <section class="card p-6 lg:col-span-2">
            <h2 class="font-semibold text-white">Get your key in 2 minutes</h2>
            <ol class="mt-4 space-y-3 text-sm text-mist-300">
              ${[
                ['Sign in to SAM.gov', 'Use your Login.gov account. A free SAM.gov user account is enough; your company does not need to be registered yet.'],
                ['Open Account Details', 'Click your name at the top right, then Account Details.'],
                ['Copy your Public API Key', 'Under Public API Key, enter your password, generate the key if you have none, and copy it. Note the expiration date shown with it.'],
                ['Paste it here', 'Save it on this page. When SAM.gov expires it after 90 days, generate a new one the same way and paste it again.'],
              ].map(([t, b], i) => `<li class="flex gap-3"><span class="ico-bubble ico-blue !h-7 !w-7 !rounded-full text-xs font-bold">${i + 1}</span><span><strong class="text-white">${t}.</strong> ${b}</span></li>`).join('')}
            </ol>
            <a href="https://sam.gov/profile/details" target="_blank" rel="noopener noreferrer" class="btn-ghost mt-5 !px-3 !py-1.5 !text-xs">Open SAM.gov Account Details</a>
            <p class="mt-5 text-xs text-mist-500">A key from a SAM.gov account linked to a registered company gets up to 1,000 lookups a day; a plain account gets 10. Never share your key with anyone else.</p>
          </section>
        </div>`;
      $('#key-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('button[type=submit]', e.target);
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>Checking with SAM.gov';
        try {
          ({ samKey: k } = await api('/me/sam-key', { method: 'PUT', body: { key: e.target.key.value, expiresOn: e.target.expiresOn.value || null } }));
          state.me.samKey = k;
          toast('SAM.gov key saved. We will remind you before it expires.');
          drawKeybar('/sam-key');
          draw();
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
          btn.innerHTML = icon('lockshield', 'h-4 w-4') + 'Save key';
        }
      });
      const rm = $('#key-remove');
      if (rm) rm.addEventListener('click', async () => {
        try {
          ({ samKey: k } = await api('/me/sam-key', { method: 'DELETE' }));
          state.me.samKey = k;
          toast('Key removed.');
          draw();
        } catch (err) { toast(err.message, 'error'); }
      });
    };
    draw();
  }
