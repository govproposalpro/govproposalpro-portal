/* Landing page behavior: nav background on scroll, mobile menu, scroll reveal. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  var nav = document.getElementById('nav');
  var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true });

  document.addEventListener('DOMContentLoaded', function () {
    onScroll();
    var year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());

    var btn = document.getElementById('menu-btn');
    var menu = document.getElementById('menu');
    btn.addEventListener('click', function () {
      var open = menu.classList.toggle('hidden') === false;
      btn.setAttribute('aria-expanded', String(open));
      if (open) nav.classList.add('scrolled');
    });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) { menu.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); } });

    var items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { items.forEach(function (el) { el.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  });
})();
