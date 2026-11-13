  // ------------------------------------------------------------------ Team login (Enterprise)

  async function viewTeam(view) {
    const head = pageHead('Team Login', 'Give your VA or business partner their own login. They work inside your Command Center; your profile, keys, Autopilot settings and team stay owner-only.');
    if (state.me.seat) {
      view.innerHTML = head + emptyState('You are signed in with a team login', 'Only the account owner can manage team logins.');
      return;
    }
    let data = await api('/team');
    const showLink = (url) => {
      $('#tm-link').innerHTML = sectionCard('Send them this link', `<p class="text-sm text-mist-400">Email is not set up, so send this one-time link yourself:</p><p class="mt-2 break-all font-mono text-xs text-mist-100">${esc(url || '')}</p>`, 'mt-6');
    };
    const draw = () => {
      const full = data.seats.length >= data.max;
      view.innerHTML = `${head}
        <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr),360px]">
          ${sectionCard('Your team', data.seats.length ? `<ul class="divide-y divide-white/[0.06]">${data.seats.map((s) => `
            <li class="flex flex-wrap items-center gap-3 py-3"><div class="min-w-0 flex-1"><p class="truncate font-medium text-white">${esc(s.name || s.email)}</p>
              <p class="text-xs text-mist-500">${esc(s.email)} · ${s.status === 'invited' ? '<span class="text-amber-200">Invite sent, password not set yet</span>' : s.lastLoginAt ? `last signed in ${fmtDate(s.lastLoginAt)}` : 'active'}</p></div>
              ${s.status === 'invited' ? `<button class="btn-ghost !px-3 !py-1.5 !text-xs" data-resend="${s.id}">Resend invite</button>` : ''}
              <button class="btn-ghost !px-3 !py-1.5 !text-xs" data-remove="${s.id}">Remove</button></li>`).join('')}</ul>`
            : '<p class="text-sm text-mist-500">No team logins yet.</p>')}
          ${sectionCard('Invite someone', full ? `<p class="text-sm text-mist-400">Enterprise includes ${data.max} team login${data.max === 1 ? '' : 's'}. Remove one to invite someone else.</p>` : `
            <form id="tm-form" class="space-y-3" novalidate>
              <div><label class="label" for="tm-name">Name</label><input id="tm-name" class="field" maxlength="120" /></div>
              <div><label class="label" for="tm-email">Email</label><input id="tm-email" type="email" class="field" maxlength="254" /></div>
              <button class="btn-primary w-full">${icon('mail', 'h-4 w-4')}Send invite</button>
              <p class="text-xs text-mist-500">They get an email to set their own password. They can use every tool and share your monthly limits, but cannot change your profile, keys, settings or team.</p>
            </form>`)}
        </div>
        <div id="tm-link"></div>`;
      const form = $('#tm-form');
      if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('button', form);
        btn.disabled = true;
        try {
          const r = await api('/team', { method: 'POST', body: { name: $('#tm-name').value, email: $('#tm-email').value } });
          data = await api('/team');
          draw();
          if (r.emailed) toast('Invite sent.');
          else showLink(r.url);
        } catch (err) { btn.disabled = false; toast(err.message, 'error'); }
      });
      $$('[data-resend]', view).forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          const r = await api(`/team/${b.dataset.resend}/resend`, { method: 'POST', body: {} });
          if (r.emailed) toast('Invite sent again.');
          else showLink(r.url);
        } catch (err) { toast(err.message, 'error'); }
        b.disabled = false;
      }));
      $$('[data-remove]', view).forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Remove this team login? They are signed out right away.')) return;
        try { await api('/team/' + b.dataset.remove, { method: 'DELETE' }); data = await api('/team'); draw(); toast('Removed.'); } catch (err) { toast(err.message, 'error'); }
      }));
    };
    draw();
  }
