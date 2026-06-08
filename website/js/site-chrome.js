/* Эфир AI — шапка, бургер, год в подвале */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var header = $('#siteHeader');
  if (header) {
    window.addEventListener('scroll', function () {
      header.classList.toggle('scrolled', window.scrollY > 24);
    }, { passive: true });
  }

  var burger = $('#burger');
  if (burger && header) {
    burger.addEventListener('click', function () {
      var open = header.classList.toggle('menu-open');
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $$('.nav a, .header-actions a, .header-actions button, .nav-cta, .nav-logout').forEach(function (el) {
      el.addEventListener('click', function () {
        header.classList.remove('menu-open');
        burger.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  var yr = $('#year');
  if (yr) yr.textContent = new Date().getFullYear();
})();
