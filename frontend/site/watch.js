/*
 * The VSL sales page (/, /watch, /demo): the video starts muted on open; the first name, email and phone opt-in, sent to
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

  // The offer (buy buttons and pricing) appears once the video reaches the end card at 1:37, and
  // stays on for this visitor after that. ?offer=1 shows it straight away (for links from emails).
  var OFFER_AT = 97;
  var OFFER_KEY = 'gpp_offer';
  var offerShown = false;
  function showOffer() {
    if (offerShown) return;
    offerShown = true;
    store.set(OFFER_KEY, 1);
    document.querySelectorAll('[data-offer]').forEach(function (n) { n.hidden = false; n.querySelectorAll('.reveal').forEach(function (r) { r.classList.add('in'); }); n.classList.add('in'); });
    document.querySelectorAll('[data-pre-offer]').forEach(function (n) { n.hidden = true; });
    var bar = document.getElementById('mobile-cta');
    if (bar) bar.classList.add('offer');
  }
  function watchForOffer(v) {
    if (offerShown || !v || v.tagName !== 'VIDEO') return;
    var check = function () { if (v.currentTime >= OFFER_AT || (v.dataset.now === 'demo')) showOffer(); };
    v.addEventListener('timeupdate', check);
    v.addEventListener('ended', showOffer);
  }

  var lead = store.get(LEAD_KEY);
  if (lead && lead.email) window.gppLeadEmail = lead.email;

  document.addEventListener('DOMContentLoaded', function () {
    if (store.get(OFFER_KEY) || params.get('offer') === '1' || params.get('checkout') === 'done') showOffer();
    var co = document.getElementById('checkout');
    var vslId = co ? co.dataset.vslId : '';
    if (!/^[A-Za-z0-9_-]{11}$/.test(vslId || '')) vslId = '';
    // A full video hosted elsewhere (SITE_VSL_VIDEO_URL, for example in GoHighLevel) plays on its own.
    var vslUrl = !vslId && co && /^https:\/\//.test(co.dataset.vslUrl || '') ? co.dataset.vslUrl : '';
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

    // How the opt-in works (SITE_VSL_GATE): 'sound' (default) starts the video muted the moment the
    // page opens and asks for the opt-in when they tap for sound; 'none' never asks; 'first' asks
    // before the video plays. Browsers never allow sound without a tap, so every mode starts muted
    // or waits for a tap.
    var gateMode = (co && co.dataset.gate) || 'sound';
    if (vslId) gateMode = 'first'; // a YouTube player can't be started muted and unmuted from here
    var chapters = document.getElementById('chapters');
    var useChapters = !vslId && !vslUrl;
    var current = play;
    var soundBtn = document.getElementById('vsl-sound');
    var hasLead = function () { return Boolean(lead && lead.email); };
    // Win popups wait while the opt-in form is open, and on phones while the video fills the screen.
    window.gppWinsQuiet = function () {
      if (!gate.hidden) return true;
      if (!window.matchMedia('(max-width: 639px)').matches) return false;
      var r = stage.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    };

    function mount(clip) {
      if (current.tagName === 'VIDEO' || current.tagName === 'IFRAME') return current;
      var v = window.gppVideo(vslId, clip);
      current.replaceWith(v);
      current = v;
      still.hidden = v.tagName === 'VIDEO';
      watchForOffer(v);
      if (v.tagName !== 'VIDEO') showOffer(); // YouTube can't report its time
      if (!vslId) v.addEventListener('ended', function () { if (current.dataset.now === 'intro') show('demo', !current.muted); });
      return v;
    }
    function show(clip, withSound) {
      var v = mount(clip);
      if (v.tagName !== 'VIDEO') return;
      if (v.dataset.now !== clip) window.gppSetClip(v, clip);
      // Keep the cover image up while the first frames load.
      if (!v.getAttribute('poster')) v.setAttribute('poster', '/assets/site/intro-v5-poster.webp');
      v.dataset.now = clip;
      v.muted = !withSound;
      // iOS Safari checks the attribute as well as the property before it allows muted autoplay.
      if (withSound) v.removeAttribute('muted'); else v.setAttribute('muted', '');
      v.controls = Boolean(withSound);
      var p = v.play();
      if (p && p.catch) p.catch(function (er) {
        if (er && er.name === 'AbortError') return; // a newer play() call took over
        // Low Power Mode and some browsers refuse even muted autoplay: show the play button.
        if (!withSound) { v.controls = true; if (soundBtn) soundBtn.hidden = false; }
      });
      if (useChapters) chapters.querySelectorAll('[data-clip]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.clip === clip)); });
    }
    // Sound on: from the top, with sound, inside the tap so phones allow it.
    function playWithSound() {
      gate.hidden = true;
      stage.classList.remove('is-locked', 'is-asking');
      if (soundBtn) soundBtn.hidden = true;
      if (useChapters) chapters.hidden = false;
      var v = mount(vslUrl || 'intro');
      if (v.tagName === 'VIDEO') { try { v.currentTime = 0; } catch (e) { /* not loaded yet */ } }
      show((v.dataset && v.dataset.now) || vslUrl || 'intro', true);
    }
    function askForOptIn() {
      gate.hidden = false;
      stage.classList.add('is-asking');
      var first = gate.elements.firstName;
      if (window.matchMedia('(max-width: 1023px)').matches) gate.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 250);
    }
    function wantSound() { if (gateMode === 'sound' && !hasLead()) askForOptIn(); else playWithSound(); }

    if (useChapters) {
      chapters.querySelectorAll('[data-clip]').forEach(function (b) {
        b.addEventListener('click', function () { show(b.dataset.clip, true); });
      });
    }
    if (vslUrl) still.src = '/assets/site/intro-v5-poster.webp';
    if (soundBtn) soundBtn.addEventListener('click', wantSound);

    if (gateMode === 'first' && !hasLead()) {
      stage.classList.add('is-locked');
    } else {
      // Muted autoplay straight away; a tap anywhere on the video (or the sound button) turns sound on.
      gate.hidden = true;
      play.hidden = true;
      show(vslUrl || 'intro', false);
      if (soundBtn) soundBtn.hidden = false;
      if (current.tagName === 'VIDEO') current.addEventListener('click', function (e) { if (current.muted) { e.preventDefault(); wantSound(); } });
    }

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
      // Start the sound inside this tap (phones only allow it from a tap); saving happens alongside.
      playWithSound();
      lead = { email: data.email.toLowerCase(), firstName: data.firstName };
      store.set(LEAD_KEY, lead);
      window.gppLeadEmail = lead.email;
      fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          if (!res.ok) throw res.body;
          if (window.gppTrack) window.gppTrack('Lead', { content_name: 'VSL opt-in' });
        })
        .catch(function (b) {
          // Only a bad field stops them; a network hiccup never interrupts the video.
          if (b && b.field) {
            lead = null;
            try { localStorage.removeItem(LEAD_KEY); } catch (x) { /* fine */ }
            if (current.tagName === 'VIDEO') current.pause();
            askForOptIn();
            fail(b.error || 'Please check that field.', b.field);
          }
        });
    });
  });
})();
