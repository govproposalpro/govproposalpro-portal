/*
 * GovProposalPro contract-win popups. Works on our landing page and on any other site:
 *   <script src="https://access.govproposalpro.com/embed/wins.js" defer></script>
 * Styles are set through the CSSOM (element.style), so it runs under a strict CSP with no inline styles.
 */
(function () {
  'use strict';
  if (window.__gppWins) return;
  window.__gppWins = true;

  var script = document.currentScript;
  var origin = script && script.src ? new URL(script.src, location.href).origin : location.origin;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SHOW_MS = 5500;
  var SEEN_KEY = 'gpp-wins-seen';

  function readSeen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (e) { return []; } }
  function writeSeen(list) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-120))); } catch (e) { /* storage blocked */ } }
  function dismissed() { try { return sessionStorage.getItem('gpp-wins-off') === '1'; } catch (e) { return false; } }
  function css(el, styles) { for (var k in styles) el.style[k] = styles[k]; return el; }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function the(agency) { return /^(the |u\.?s\.? )/i.test(agency) ? agency : 'the ' + agency; }

  var queue = [];
  var timer = null;
  var hovering = false;
  var box;

  function build() {
    box = css(document.createElement('div'), {
      position: 'fixed', left: '16px', bottom: '16px', zIndex: '2147483000', maxWidth: 'min(360px, calc(100vw - 32px))',
      display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px 12px 12px', borderRadius: '18px',
      background: 'rgba(22, 22, 24, 0.86)', color: '#F5F5F7', border: '1px solid rgba(255,255,255,0.10)',
      boxShadow: '0 20px 50px -18px rgba(0,0,0,0.85)', backdropFilter: 'saturate(180%) blur(20px)', webkitBackdropFilter: 'saturate(180%) blur(20px)',
      font: '13px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", Arial, sans-serif',
      opacity: '0', transform: reduced ? 'none' : 'translateY(16px) scale(0.98)', transition: reduced ? 'opacity 200ms' : 'opacity 350ms ease, transform 450ms cubic-bezier(.2,.8,.2,1)',
      pointerEvents: 'none',
    });
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    var badge = css(document.createElement('span'), {
      flex: '0 0 auto', width: '38px', height: '38px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0A66FF, #FF2D46)', fontSize: '18px',
    });
    badge.textContent = '\u{1F3C6}';
    badge.setAttribute('aria-hidden', 'true');
    var text = css(document.createElement('span'), { flex: '1 1 auto', minWidth: '0' });
    var label = css(document.createElement('span'), { display: 'block', fontSize: '11px', fontWeight: '600', letterSpacing: '0.04em', textTransform: 'uppercase', color: '#4DA3FF', marginBottom: '2px' });
    label.textContent = 'New contract win';
    var msg = document.createElement('span');
    text.appendChild(label);
    text.appendChild(msg);
    var close = css(document.createElement('button'), {
      flex: '0 0 auto', alignSelf: 'flex-start', border: '0', background: 'transparent', color: '#86868B', cursor: 'pointer', fontSize: '18px', lineHeight: '1', padding: '0 0 0 4px',
    });
    close.type = 'button';
    close.setAttribute('aria-label', 'Hide contract win popups');
    close.textContent = '×';
    close.addEventListener('click', function () {
      try { sessionStorage.setItem('gpp-wins-off', '1'); } catch (e) { /* ignore */ }
      clearTimeout(timer);
      hide();
    });
    box.addEventListener('mouseenter', function () { hovering = true; });
    box.addEventListener('mouseleave', function () { hovering = false; });
    box.appendChild(badge);
    box.appendChild(text);
    box.appendChild(close);
    box._msg = msg;
    document.body.appendChild(box);
  }

  function show(win) {
    box._msg.textContent = '';
    var b = document.createElement('b');
    b.textContent = win.name;
    css(b, { fontWeight: '600', color: '#FFFFFF' });
    box._msg.appendChild(b);
    box._msg.appendChild(document.createTextNode(' just won a contract worth over ' + money(win.amount) + ' from ' + the(win.agency)));
    // On our landing page, sit above the phone buy bar while it is showing.
    var bar = document.getElementById('mobile-cta');
    var lift = bar && bar.classList.contains('show') ? bar.offsetHeight + 24 : 16;
    css(box, { bottom: lift + 'px', opacity: '1', transform: 'none', pointerEvents: 'auto' });
  }
  function hide() { css(box, { opacity: '0', transform: reduced ? 'none' : 'translateY(16px) scale(0.98)', pointerEvents: 'none' }); }

  function next() {
    if (dismissed()) return;
    if (document.hidden) { timer = setTimeout(next, 3000); return; }
    if (!queue.length) { load(); return; }
    var win = queue.shift();
    var seen = readSeen();
    seen.push(win.id);
    writeSeen(seen);
    show(win);
    var hideAt = function () {
      if (hovering) { timer = setTimeout(hideAt, 1000); return; }
      hide();
      timer = setTimeout(next, 6000 + Math.random() * 6000);
    };
    timer = setTimeout(hideAt, SHOW_MS);
  }

  function load() {
    fetch(origin + '/api/public/wins', { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : { wins: [] }; })
      .then(function (data) {
        var wins = (data && data.wins) || [];
        var seen = readSeen();
        var fresh = wins.filter(function (w) { return seen.indexOf(w.id) === -1; });
        queue = fresh.length >= 5 ? fresh : wins;
        if (!fresh.length) writeSeen([]);
        if (queue.length) timer = setTimeout(next, 1500);
      })
      .catch(function () { /* no popups when the feed is unreachable */ });
  }

  function start() {
    if (dismissed()) return;
    build();
    setTimeout(load, 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
