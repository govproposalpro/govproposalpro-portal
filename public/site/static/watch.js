/*
 * Demo video page (/watch): the video unlocks after a first name, email and phone opt-in, sent to
 * /api/leads with the ad source (UTM tags, Facebook or Google click id, referring site). Someone
 * who already opted in on this browser goes straight to the video. site.js runs the rest of the
 * page (checkout, booking button, reveal, wins).
 */
(function () {
  'use strict';
  var LEAD_KEY = 'gpp_lead';
  var SRC_KEY = 'gpp_src';
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  // First touch wins: the ad that first brought them stays with them if they come back direct.
  var params = new URLSearchParams(location.search);
  var fresh = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'].forEach(function (k) {
    var v = params.get(k);
    if (v) fresh[k] = v.slice(0, 240);
  });
  if (document.referrer) {
    try { if (new URL(document.referrer).host !== location.host) fresh.referrer = document.referrer.slice(0, 300); } catch (e) { /* ignore */ }
  }
  var source = store.get(SRC_KEY);
  if (!source || (fresh.utm_source || fresh.fbclid || fresh.gclid)) { source = fresh; store.set(SRC_KEY, source); }

  var lead = store.get(LEAD_KEY);
  if (lead && lead.email) window.gppLeadEmail = lead.email;

  document.addEventListener('DOMContentLoaded', function () {
    var co = document.getElementById('checkout');
    var vslId = co ? co.dataset.vslId : '';
    if (!/^[A-Za-z0-9_-]{11}$/.test(vslId || '')) vslId = '';
    var stage = document.getElementById('stage');
    var gate = document.getElementById('gate');
    var play = document.getElementById('vsl-play');
    var still = document.getElementById('vsl-still');
    var err = document.getElementById('gate-err');
    var go = document.getElementById('gate-go');

    if (vslId) {
      still.src = 'https://i.ytimg.com/vi/' + vslId + '/maxresdefault.jpg';
      still.addEventListener('error', function () { still.src = 'https://i.ytimg.com/vi/' + vslId + '/hqdefault.jpg'; }, { once: true });
    }

    // The YouTube video once SITE_VSL_YOUTUBE_ID is set, otherwise the walkthrough hosted here.
    function start() { play.replaceWith(window.gppVideo(vslId)); }
    function unlock(autoplay) {
      stage.classList.remove('is-locked');
      gate.hidden = true;
      play.hidden = false;
      play.addEventListener('click', start, { once: true });
      if (autoplay) start();
    }

    if (lead && lead.email) { unlock(false); return; }
    stage.classList.add('is-locked');

    function fail(msg, field) {
      err.textContent = msg;
      err.hidden = false;
      gate.querySelectorAll('input').forEach(function (i) { i.removeAttribute('aria-invalid'); });
      var input = field && gate.elements[field];
      if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
    }

    gate.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = gate.elements;
      var data = {
        firstName: f.firstName.value.trim(),
        email: f.email.value.trim(),
        phone: f.phone.value.trim(),
        website: f.website.value,
        page: 'watch',
        source: source || {},
      };
      if (!data.firstName) return fail('Please enter your first name.', 'firstName');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return fail('Please enter a valid email address.', 'email');
      if (data.phone.replace(/\D/g, '').length < 10) return fail('Please enter your mobile number with area code.', 'phone');
      err.hidden = true;
      go.disabled = true;
      var label = go.lastChild.textContent;
      go.lastChild.textContent = 'One moment…';
      fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          if (!res.ok) throw res.body;
          store.set(LEAD_KEY, { email: data.email.toLowerCase(), firstName: data.firstName });
          window.gppLeadEmail = data.email.toLowerCase();
          unlock(true);
        })
        .catch(function (b) {
          go.disabled = false;
          go.lastChild.textContent = label;
          fail((b && b.error) || 'We could not save that. Check your connection and try again.', b && b.field);
        });
    });
  });
})();
