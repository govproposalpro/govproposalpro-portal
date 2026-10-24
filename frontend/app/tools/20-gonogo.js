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
