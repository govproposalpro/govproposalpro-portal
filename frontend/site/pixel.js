/*
 * Meta (Facebook) pixel for the public sales pages. The pixel id comes from
 * <meta name="gpp-pixel">, filled in by the server (META_PIXEL_ID). This is Meta's standard
 * snippet as a file, since the page's security policy blocks inline scripts.
 * window.gppTrack(event, params) sends a standard event and does nothing if the pixel is off.
 */
(function () {
  'use strict';
  // Microsoft Clarity (free heatmaps and session replays), only when CLARITY_ID is set.
  var cl = document.querySelector('meta[name="gpp-clarity"]');
  var clarityId = cl && /^[a-z0-9]{6,20}$/.test(cl.content) ? cl.content : '';
  if (clarityId) {
    window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    var ct = document.createElement('script'); ct.async = true; ct.src = 'https://www.clarity.ms/tag/' + clarityId;
    document.head.appendChild(ct);
  }
  var meta = document.querySelector('meta[name="gpp-pixel"]');
  var id = meta && /^\d{6,20}$/.test(meta.content) ? meta.content : '';
  window.gppTrack = function (event, params, opts) {
    try { if (window.fbq) window.fbq('track', event, params || {}, opts || {}); } catch (e) { /* never block the page */ }
  };
  if (!id) return;
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0;
    t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  window.fbq('init', id);
  window.fbq('track', 'PageView');
})();
