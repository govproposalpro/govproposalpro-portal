/*
 * Landing page behavior: nav, mobile menu, scroll reveal, hero tilt, product walkthrough, live wins
 * (pill, wall, agency strip), count-ups, ROI calculator, hover glow and the phone buy bar.
 * Runs under a strict CSP: no inline code, styles only through the CSSOM.
 */
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nav = document.getElementById('nav');
  var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true });

  // The demo player: the YouTube video when an id is set, otherwise the walkthrough hosted here.
  window.gppVideo = function (yt) {
    var v;
    if (yt) {
      v = document.createElement('iframe');
      v.src = 'https://www.youtube-nocookie.com/embed/' + yt + '?autoplay=1&rel=0&modestbranding=1&playsinline=1';
      v.title = 'GovProposalPro demo';
      v.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      v.allowFullscreen = true;
    } else {
      v = document.createElement('video');
      // MP4 for Safari and most browsers; WebM for browsers without H.264.
      [['/assets/site/demo.mp4', 'video/mp4'], ['/assets/site/demo.webm', 'video/webm']].forEach(function (f) {
        var s = document.createElement('source');
        s.src = f[0];
        s.type = f[1];
        v.appendChild(s);
      });
      v.poster = '/assets/site/demo-poster.webp';
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.setAttribute('aria-label', 'GovProposalPro demo');
    }
    v.className = 'vsl-iframe';
    return v;
  };

  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function shortMoney(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return money(n);
  }
  function the(agency) { return /^(the |u\.?s\.? )/i.test(agency) ? agency : 'the ' + agency; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function getJson(url) { return fetch(url, { credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }

  // Counts a number up from zero the first time it scrolls into view.
  function countUp(node, target, format) {
    var fmt = format === 'money' ? shortMoney : function (v) { return Math.round(v).toLocaleString('en-US'); };
    if (reduced) { node.textContent = fmt(target); return; }
    var start = null, dur = 1600;
    var step = function (t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / dur);
      node.textContent = fmt(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function whenVisible(node, fn) {
    if (!('IntersectionObserver' in window)) return fn();
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); fn(); }
    }, { threshold: 0.3 });
    io.observe(node);
  }

  document.addEventListener('DOMContentLoaded', function () {
    onScroll();
    var year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());

    // Mobile menu
    var btn = document.getElementById('menu-btn');
    var menu = document.getElementById('menu');
    if (btn && menu) btn.addEventListener('click', function () {
      var open = menu.classList.toggle('hidden') === false;
      btn.setAttribute('aria-expanded', String(open));
      if (open) nav.classList.add('scrolled');
    });
    if (menu) menu.addEventListener('click', function (e) { if (e.target.closest('a')) { menu.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); } });

    // Scroll reveal, staggered within each row
    var items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) || reduced) { items.forEach(function (n) { n.classList.add('in'); }); }
    else {
      var rio = new IntersectionObserver(function (entries) {
        var i = 0;
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.style.transitionDelay = (i++ * 70) + 'ms';
          en.target.classList.add('in');
          rio.unobserve(en.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      items.forEach(function (n) { rio.observe(n); });
    }

    // Hero product shot: tilted back at the top of the page, flat once you scroll into it.
    var tilt = document.getElementById('tilt');
    var cta = document.getElementById('mobile-cta');
    var hero = document.getElementById('hero');
    var ticking = false;
    var frame = function () {
      ticking = false;
      var y = window.scrollY;
      if (tilt && !reduced) {
        var p = Math.min(1, y / 520);
        tilt.style.setProperty('--tilt', (16 * (1 - p)).toFixed(2) + 'deg');
        tilt.style.setProperty('--scale', (0.94 + 0.06 * p).toFixed(3));
      }
      if (cta && hero) {
        var nearEnd = window.innerHeight + y > document.documentElement.scrollHeight - 160;
        var show = y > hero.offsetHeight * 0.7 && !nearEnd;
        cta.classList.toggle('show', show);
        cta.setAttribute('aria-hidden', String(!show));
        var link = cta.querySelector('a');
        if (link) link.tabIndex = show ? 0 : -1;
      }
    };
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
    frame();

    // Product walkthrough: tabs swap the screenshot; auto-advances while on screen until someone picks a step.
    var tour = document.getElementById('tour');
    if (tour) {
      var tabs = Array.prototype.slice.call(tour.querySelectorAll('.tour-tab'));
      var imgs = tour.querySelectorAll('.tour-img');
      var caption = document.getElementById('tour-caption');
      var current = 0;
      var auto = !reduced;
      var show = function (i, focus) {
        current = (i + tabs.length) % tabs.length;
        tabs.forEach(function (t, k) {
          var on = k === current;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', String(on));
          t.tabIndex = on ? 0 : -1;
          var bar = t.querySelector('.tour-bar i');
          if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
        });
        imgs.forEach(function (im, k) { im.classList.toggle('is-active', k === current); });
        if (caption) caption.textContent = tabs[current].querySelector('.tour-text').textContent;
        var tab = tabs[current];
        if (focus) tab.focus();
        // Keep the active chip in view on phones without moving the page.
        var strip = tab.parentElement;
        if (strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: tab.offsetLeft - 16, behavior: reduced ? 'auto' : 'smooth' });
      };
      tabs.forEach(function (t, k) {
        t.tabIndex = k === 0 ? 0 : -1;
        t.addEventListener('click', function () { auto = false; tour.classList.remove('is-playing'); show(k); });
        t.addEventListener('keydown', function (e) {
          var d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
          if (!d) return;
          e.preventDefault(); auto = false; tour.classList.remove('is-playing'); show(current + d, true);
        });
        var bar = t.querySelector('.tour-bar i');
        if (bar) bar.addEventListener('animationend', function () { if (auto) show(current + 1); });
      });
      tour.addEventListener('mouseenter', function () { tour.classList.add('is-paused'); });
      tour.addEventListener('mouseleave', function () { tour.classList.remove('is-paused'); });
      if (auto && 'IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          var vis = entries[0].isIntersecting;
          tour.classList.toggle('is-playing', auto && vis);
        }, { threshold: 0.35 }).observe(tour);
      }
    }

    // Cursor-following glow on cards
    document.querySelectorAll('.glow').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });

    // ROI calculator
    var value = document.getElementById('roi-value');
    if (value) {
      var margin = document.getElementById('roi-margin');
      var calc = function () {
        var v = Number(value.value), m = Number(margin.value);
        var ed = document.querySelector('input[name="roi-ed"]:checked');
        var price = Number(ed ? ed.value : 897);
        var profit = v * m / 100;
        var multiple = profit / price;
        document.getElementById('roi-value-out').textContent = money(v);
        document.getElementById('roi-margin-out').textContent = m + '%';
        document.getElementById('roi-profit').textContent = money(profit);
        document.getElementById('roi-multiple').textContent = (multiple >= 10 ? Math.round(multiple) : multiple.toFixed(1).replace(/\.0$/, '')) + '×';
        document.getElementById('roi-ed-name').textContent = price > 897 ? 'Enterprise Edition' : 'Core Edition';
        [value, margin].forEach(function (r) {
          var pct = (r.value - r.min) / (r.max - r.min) * 100;
          r.style.background = 'linear-gradient(90deg, #4DA3FF 0%, #9D7BFF ' + pct + '%, rgba(255,255,255,0.1) ' + pct + '%)';
        });
      };
      [value, margin].forEach(function (r) { r.addEventListener('input', calc); });
      document.querySelectorAll('input[name="roi-ed"]').forEach(function (r) { r.addEventListener('change', calc); });
      calc();
    }

    // Pricing leads with pay in full; the access plan price shows once it is set.
    var co = document.getElementById('checkout');
    var cfg = co ? co.dataset : {};
    ['core', 'enterprise'].forEach(function (ed) {
      var maint = Number(cfg[ed + 'Maint']);
      var m = document.querySelector('[data-maint="' + ed + '"]');
      if (m && maint > 0) m.textContent = ' at ' + money(maint) + ' a month';
    });

    // Optional extras: the call calendar and the demo video show only once they are configured.
    if (/^https:\/\//.test(cfg.bookingUrl || '')) {
      document.querySelectorAll('[data-booking], [data-booking-wrap]').forEach(function (n) { n.hidden = false; });
      // With a calendar set, the Enterprise call leads and buy-now steps back to a second button.
      document.querySelectorAll('[data-call-first]').forEach(function (n) { n.className = n.getAttribute('data-call-first'); });
    }
    // Demo video: the recorded walkthrough hosted here, or the YouTube video once SITE_VSL_YOUTUBE_ID
    // is set. Either way only a still loads until someone presses play.
    var vslSection = document.querySelector('[data-vsl-section]');
    if (vslSection) {
      var yt = /^[A-Za-z0-9_-]{11}$/.test(cfg.vslId || '') ? cfg.vslId : '';
      vslSection.hidden = false;
      document.querySelectorAll('[data-vsl]').forEach(function (n) { n.hidden = false; });
      document.querySelectorAll('[data-vsl-alt]').forEach(function (n) { n.hidden = true; });
      var thumb = document.getElementById('vsl-thumb');
      if (yt) {
        thumb.src = 'https://i.ytimg.com/vi/' + yt + '/maxresdefault.jpg';
        thumb.addEventListener('error', function () { thumb.src = 'https://i.ytimg.com/vi/' + yt + '/hqdefault.jpg'; }, { once: true });
      } else {
        thumb.src = '/assets/site/demo-poster.webp';
      }
      var play = document.getElementById('vsl-play');
      play.addEventListener('click', function () { play.replaceWith(window.gppVideo(yt)); });
    }

    function openDialog(d) {
      if (typeof d.showModal !== 'function') return false;
      d.showModal();
      document.body.classList.add('co-lock');
      return true;
    }
    document.querySelectorAll('dialog.co').forEach(function (d) {
      d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-co-close]')) d.close(); });
      d.addEventListener('close', function () {
        if (!document.querySelector('dialog.co[open]')) document.body.classList.remove('co-lock');
        if (d.id === 'checkout') { var left = flowKey && !finished && stepIdx === 0 ? flowKey : ''; resetCheckout(); offerDownsell(left); }
      });
    });

    // Embedded Whop checkout. Buy buttons keep their whop.com link as the fallback (no script,
    // old browser); with script the checkout opens here: the edition, then its monthly access plan.
    var FLOWS = {
      core: [{ plan: cfg.corePlan, title: 'Core Edition', sub: '$897 one-time' }, { plan: cfg.coreAccessPlan, title: 'Core monthly access', sub: 'Keeps your account, support and proposals active' }],
      enterprise: [{ plan: cfg.enterprisePlan, title: 'Enterprise Edition', sub: '$4,997 one-time' }, { plan: cfg.enterpriseAccessPlan, title: 'Enterprise monthly access', sub: 'Keeps your account, support and Autopilot active' }],
      'core-monthly': [{ plan: cfg.coreMonthlyPlan, title: 'Core Edition, monthly', sub: '$199 a month until you cancel' }],
      'enterprise-monthly': [{ plan: cfg.enterpriseMonthlyPlan, title: 'Enterprise Edition, monthly', sub: '$999 a month until you cancel' }],
    };
    var flow = null, flowKey = '', finished = false, stepIdx = 0, mountSeq = 0, buyerEmail = '';
    var mountEl = document.getElementById('co-mount');
    var doneEl = document.getElementById('co-done');
    var fallback = document.getElementById('co-fallback');
    var loaderAdded = false;
    function addLoader() {
      if (loaderAdded) return;
      loaderAdded = true;
      var sc = document.createElement('script');
      sc.src = 'https://js.whop.com/static/checkout/loader.js';
      sc.async = true;
      document.head.appendChild(sc);
    }
    function paintSteps(final) {
      var two = flow.length > 1;
      co.querySelectorAll('[data-co-step]').forEach(function (li) {
        var n = Number(li.getAttribute('data-co-step'));
        li.hidden = n === 2 && !two;
        var pos = final ? 3 : (two ? stepIdx + 1 : 1);
        li.classList.toggle('is-on', n === pos);
        li.classList.toggle('is-done', n < pos && !(n === 2 && !two));
      });
      var first = co.querySelector('[data-co-step="1"]');
      if (first) first.lastChild.textContent = two ? 'Your edition' : 'Your plan';
    }
    function mountStep() {
      var step = flow[stepIdx];
      document.getElementById('co-title').textContent = step.title;
      document.getElementById('co-sub').textContent = step.sub;
      fallback.href = 'https://whop.com/checkout/' + step.plan;
      fallback.hidden = false;
      doneEl.hidden = true;
      mountEl.hidden = false;
      mountEl.textContent = '';
      var holder = document.createElement('div');
      holder.id = 'gpp-co-' + (++mountSeq);
      holder.setAttribute('data-whop-checkout-plan-id', step.plan);
      holder.setAttribute('data-whop-checkout-identifier', holder.id);
      holder.setAttribute('data-whop-checkout-theme', 'dark');
      holder.setAttribute('data-whop-checkout-skip-redirect', 'true');
      holder.setAttribute('data-whop-checkout-on-complete', 'gppCheckoutComplete');
      // The buyer's email from step one, or the one they gave to watch the demo (watch.js).
      var prefill = buyerEmail || window.gppLeadEmail || '';
      if (prefill) holder.setAttribute('data-whop-checkout-prefill-email', prefill);
      mountEl.appendChild(holder);
      paintSteps(false);
      addLoader();
    }
    function showDone() {
      finished = true;
      mountEl.textContent = '';
      mountEl.hidden = true;
      doneEl.hidden = false;
      fallback.hidden = true;
      document.getElementById('co-title').textContent = "You're all set";
      document.getElementById('co-sub').textContent = 'Your login link is on its way';
      paintSteps(true);
    }
    function resetCheckout() { if (mountEl) mountEl.textContent = ''; flow = null; flowKey = ''; finished = false; }

    // Monthly is only offered as a downsell: once per visit, to someone who opens the pay-in-full
    // checkout for an edition and closes it without paying.
    var ds = document.getElementById('downsell');
    function offerDownsell(key) {
      if (!ds || (key !== 'core' && key !== 'enterprise')) return;
      try { if (sessionStorage.getItem('gpp_ds')) return; sessionStorage.setItem('gpp_ds', '1'); } catch (e) { /* show it anyway */ }
      ds.querySelectorAll('[data-ds]').forEach(function (n) { n.hidden = n.getAttribute('data-ds') !== key; });
      setTimeout(function () { openDialog(ds); }, 250);
    }
    if (ds) ds.addEventListener('click', function (e) { if (e.target.closest('[data-checkout]')) ds.close(); });
    // Whop calls this by name when a payment completes inside the embedded checkout.
    window.gppCheckoutComplete = function () {
      if (!flow) return;
      var id = 'gpp-co-' + mountSeq;
      var next = function () {
        if (stepIdx + 1 < flow.length) { stepIdx += 1; mountStep(); } else showDone();
      };
      // Carry the buyer's email into the access plan so it lands on the same account.
      var got = null;
      try { if (window.wco && window.wco.getEmail) got = window.wco.getEmail(id, 2000); } catch (e) { got = null; }
      Promise.race([Promise.resolve(got), new Promise(function (r) { setTimeout(r, 2500); })])
        .then(function (email) { if (typeof email === 'string' && email.indexOf('@') > 0) buyerEmail = email; })
        .catch(function () {})
        .then(next);
    };
    document.querySelectorAll('[data-checkout]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (!co || cfg.mode === 'link' || typeof co.showModal !== 'function' || e.metaKey || e.ctrlKey || e.shiftKey) return;
        var key = a.getAttribute('data-checkout');
        var start = 0;
        if (/-access$/.test(key)) { key = key.replace(/-access$/, ''); start = 1; }
        var f = FLOWS[key];
        if (!f || !f.every(function (s) { return /^plan_/.test(s.plan || ''); })) return;
        e.preventDefault();
        flow = f; flowKey = key; finished = false; stepIdx = start;
        mountStep();
        openDialog(co);
      });
    });

    // Live member wins: hero pill, stats, agency strip and the wins wall. Sections stay hidden
    // unless there is real published data to show.
    getJson('/api/public/wins/stats').then(function (s) {
      if (!s || !s.count) return;
      var pill = document.getElementById('live-pill-text');
      if (pill) pill.textContent = shortMoney(s.total) + ' in contracts won by members';
      var agencies = (s.agencies || []).filter(Boolean);
      var nums = { total: s.total, count: s.count, agencies: agencies.length };
      var wall = document.getElementById('wins');
      if (wall) {
        wall.classList.add('has-data');
        wall.querySelectorAll('[data-count]').forEach(function (n) {
          var key = n.getAttribute('data-count');
          n.textContent = '0';
          whenVisible(n, function () { countUp(n, nums[key] || 0, n.getAttribute('data-format')); });
        });
      }
      var strip = document.getElementById('agencies');
      var track = document.getElementById('agency-track');
      if (strip && track && agencies.length >= 4) {
        for (var copy = 0; copy < 2; copy++) {
          var group = el('span');
          if (copy) group.setAttribute('aria-hidden', 'true');
          agencies.forEach(function (a) { group.appendChild(el('span', null, a)); });
          track.appendChild(group);
        }
        strip.classList.add('has-data');
      }
    }).catch(function () { /* the page reads fine without live stats */ });

    getJson('/api/public/wins').then(function (d) {
      var grid = document.getElementById('wins-grid');
      var wins = (d && d.wins) || [];
      if (!grid || !wins.length) return;
      wins.slice(0, window.innerWidth < 640 ? 4 : 9).forEach(function (w) {
        var card = el('div', 'win reveal in');
        var badge = el('span', 'win-badge', '\u{1F3C6}');
        badge.setAttribute('aria-hidden', 'true');
        var body = el('div', 'min-w-0');
        body.appendChild(el('p', 'win-amt', money(w.amount)));
        body.appendChild(el('p', 'win-meta', w.name + ' won from ' + the(w.agency)));
        card.appendChild(badge);
        card.appendChild(body);
        grid.appendChild(card);
      });
    }).catch(function () { /* optional */ });
  });
})();
