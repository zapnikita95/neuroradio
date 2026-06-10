/* Efir AI — site language (RU / EN, device default) */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'efir_site_lang';

  var STRINGS = {
    ru: {
      metaTitle: 'Эфир AI — нейросетевой радиоведущий о музыке для Android и браузера',
      metaDescription:
        'Эфир AI — нейро-радио и AI-радиоведущий для Android и браузера. Пока играет трек, сервис находит факт о песне и рассказывает историю живым голосом между композициями.',
      nav: { service: 'Сервис', personas: 'Амплуа', how: 'Как это работает', studio: 'Студия', pricing: 'Тарифы', account: 'Кабинет', docs: 'Документы', login: 'Войти', logout: 'Выйти', download: 'Скачать' },
      hero: {
        eyebrow: 'Нейро-радио · факты о музыке · Android и браузер',
        title: 'Нейро-радиоведущий для вашей музыки: <span class="grad-text">истории о каждом треке</span>',
        lead:
          'Эфир AI — это нейросетевой радиоведущий, который слушает вашу музыку вместе с вами. Пока играет трек, он находит самый интересный факт о песне, артисте или эпохе, рассказывает его голосом выбранного амплуа и снова отдаёт эфир музыке. Получается личная радиостанция, собранная вокруг вашего плейлиста — на Android и в браузере.',
        apk: 'Скачать APK для Android',
        ext: 'Расширение для браузера',
        listen: 'Послушать ведущих',
        stat1: 'источников фактов',
        stat2: 'амплуа ведущих',
        stat3: 'до истории в эфире',
      },
      studio: {
        kicker: 'Студия',
        title: 'Какой будет эфир — задаёте <span class="grad-text">только вы</span>',
        sub: 'Это живой пример. Двигайте настройки — и смотрите, как прямо сейчас меняется история про Thriller: тон, голос и длина.',
        amplua: 'Амплуа',
        voice: 'Голос',
        tempo: 'Темп речи',
        length: 'Длина истории',
        speak: 'Озвучить',
        hint: 'Это демонстрация подачи. В приложении факт каждый раз новый и собирается в реальном времени.',
        carousel: 'Листай влево или вправо — год по центру',
        onAir: 'В эфире…',
        loadFail: 'Не удалось загрузить демо — попробуйте позже.',
        tapAgain: 'Нажмите ещё раз для воспроизведения.',
        soon: 'Демо-аудио скоро будет доступно.',
      },
      pricing: {
        perMonth: '/мес',
        perQuarter: '/3 мес',
        perYear: '/год',
        subscribe: 'Оформить',
        currency: '₽',
      },
      persona: { play: 'Послушать пример: ', amp: 'Амплуа: ' },
    },
    en: {
      metaTitle: 'Efir AI — AI radio host for your music on Android & browser',
      metaDescription:
        'Efir AI finds a real fact about the track you are playing and tells a short story in a voice you choose — between songs, on Android or in the browser.',
      nav: { service: 'Service', personas: 'Personas', how: 'How it works', studio: 'Studio', pricing: 'Pricing', account: 'Account', docs: 'Legal', login: 'Sign in', logout: 'Sign out', download: 'Download' },
      hero: {
        eyebrow: 'Neuro radio · music facts · Android & browser',
        title: 'AI radio host for your music: <span class="grad-text">a story for every track</span>',
        lead:
          'Efir AI listens along with you. While a track plays, it finds the most interesting fact about the song, artist, or era, tells it in the persona you pick, then hands the air back to your music. Your playlist becomes a personal station — on Android and in the browser.',
        apk: 'Download APK for Android',
        ext: 'Browser extension',
        listen: 'Hear the hosts',
        stat1: 'fact sources',
        stat2: 'host personas',
        stat3: 'to story on air',
      },
      studio: {
        kicker: 'Studio',
        title: 'You shape the broadcast — <span class="grad-text">only you</span>',
        sub: 'Live demo. Move the sliders and hear how the Thriller story changes — tone, voice, and length.',
        amplua: 'Persona',
        voice: 'Voice',
        tempo: 'Speech tempo',
        length: 'Story length',
        speak: 'Play voiceover',
        hint: 'Demo of delivery only. In the app each fact is new and built in real time.',
        carousel: 'Swipe left or right — year in the center',
        onAir: '● On air…',
        loadFail: 'Could not load demo — try again later.',
        tapAgain: 'Tap again to play.',
        soon: 'Demo audio coming soon.',
      },
      pricing: {
        perMonth: '/mo',
        perQuarter: '/3 mo',
        perYear: '/yr',
        subscribe: 'Subscribe',
        currency: '$',
      },
      persona: { play: 'Play sample: ', amp: 'Persona: ' },
    },
  };

  var PRICING_EN = {
    month: { price: '3.99', old: null, period: 'month', note: 'Flexible — pay monthly, cancel anytime.', badge: null, cta: 'Subscribe' },
    year: { price: '39.99', old: '47.88', period: 'year', note: 'Best value — about $3.33 per month.', badge: 'Best value · −16%', cta: 'Subscribe for $39.99' },
    quarter: { price: '9.99', old: '11.97', period: 'quarter', note: 'Middle ground — commit without overpaying.', badge: '−16%', cta: 'Subscribe' },
  };

  var PRICING_RU = {
    month: { price: '199', old: null, period: 'месяц', note: 'Гибкий вариант: платите помесячно и отменяете когда угодно.', badge: null, cta: 'Оформить' },
    year: { price: '1999', old: '2388', period: 'год', note: 'Лучшее предложение: ~167 ₽ в месяц при оплате за год.', badge: 'Выгоднее всего · −16%', cta: 'Оформить за 1999 ₽' },
    quarter: { price: '499', old: '597', period: '3 месяца', note: 'Золотая середина — попробовать вдолгую без переплаты.', badge: '−16%', cta: 'Оформить' },
  };

  function detectDeviceLang() {
    var nav = (navigator.language || navigator.userLanguage || 'ru').toLowerCase();
    return nav.indexOf('ru') === 0 ? 'ru' : 'en';
  }

  function getStored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v === 'ru' || v === 'en') return v;
    } catch (_e) { /* ignore */ }
    return null;
  }

  function getLang() {
    return getStored() || detectDeviceLang();
  }

  function setLang(lang) {
    if (lang !== 'ru' && lang !== 'en') return;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (_e) { /* ignore */ }
    apply(lang);
    global.dispatchEvent(new CustomEvent('efir:langchange', { detail: { lang: lang } }));
  }

  function q(sel) {
    return document.querySelector(sel);
  }

  function setHtml(sel, html) {
    var el = q(sel);
    if (el) el.innerHTML = html;
  }

  function setText(sel, text) {
    var el = q(sel);
    if (el) el.textContent = text;
  }

  function applyNav(T) {
    var n = T.nav;
    var links = document.querySelectorAll('.nav a');
    if (links[0]) links[0].textContent = n.service;
    if (links[1]) links[1].textContent = n.personas;
    if (links[2]) links[2].textContent = n.how;
    if (links[3]) links[3].textContent = n.studio;
    if (links[4]) links[4].textContent = n.pricing;
    if (links[5]) links[5].textContent = n.account;
    if (links[6]) links[6].textContent = n.docs;
    var login = q('#navLoginBtn');
    var logout = q('#navLogoutBtn');
    var cta = q('.nav-cta');
    if (login) login.textContent = n.login;
    if (logout) logout.textContent = n.logout;
    if (cta) cta.textContent = n.download;
  }

  function applyHero(T, lang) {
    var h = T.hero;
    setHtml('.hero .eyebrow', '<i class="live-dot"></i> ' + h.eyebrow);
    setHtml('.hero .hero-title', h.title);
    setText('.hero .hero-lead', h.lead);
    var apk = q('#heroApk');
    var ext = q('#heroExt');
    if (apk) apk.innerHTML = '<span class="btn-ic site-ic ic-download" aria-hidden="true"></span> ' + h.apk;
    if (ext) ext.innerHTML = '<span class="btn-ic site-ic ic-puzzle" aria-hidden="true"></span> ' + h.ext;
    var listen = q('.hero-listen');
    if (listen) listen.innerHTML = '<span class="scroll-arrow" aria-hidden="true"></span> ' + h.listen;
    var stats = document.querySelectorAll('.hero-stats.compact div');
    if (stats[0]) stats[0].innerHTML = '<strong>10+</strong><span>' + h.stat1 + '</span>';
    if (stats[1]) stats[1].innerHTML = '<strong>6</strong><span>' + h.stat2 + '</span>';
    if (stats[2]) stats[2].innerHTML = '<strong>~5 ' + (lang === 'en' ? 's' : 'c') + '</strong><span>' + h.stat3 + '</span>';
    var host = q('#heroNowPlaying .np-host');
    if (host && global.EfirLocale) host.textContent = global.EfirLocale.heroHostLabel();
    var script = q('#heroScript');
    if (script && global.EfirLocale) script.textContent = global.EfirLocale.heroScript();
  }

  function applyStudio(T) {
    var s = T.studio;
    setText('#studio .kicker', s.kicker);
    setHtml('#studio .section-title', s.title);
    setText('#studio .section-sub', s.sub);
    var labels = document.querySelectorAll('#studio .ctrl > label, #studio .ctrl-head label');
    if (labels[0]) labels[0].textContent = s.amplua;
    if (labels[1]) labels[1].textContent = s.voice;
    if (labels[2]) labels[2].textContent = s.tempo;
    if (labels[3]) labels[3].textContent = s.length;
    var play = q('#previewPlay');
    if (play) play.innerHTML = '<span class="play-glyph"></span> ' + s.speak;
    setText('.studio-hint', s.hint);
  }

  function applyPageBlocks(lang) {
    if (lang !== 'en') return;
    setText('#service .kicker', 'About');
    setHtml('#service .section-title', 'Familiar tracks <span class="grad-text">sound new</span>');
    setText('#personas .kicker', 'Personas');
    setHtml('#personas .section-title', 'A host for <span class="grad-text">your taste</span>');
    setText('#personas .section-sub', 'One fact — many deliveries. Pick a persona and hear how the tone shifts. Swipe the cards sideways.');
    setText('#how .kicker', 'How it works');
    setHtml('#how .section-title', 'From track to story in <span class="grad-text">seconds</span>');
    setText('#download .kicker', 'Download');
    setHtml('#download .section-title', 'Wherever <span class="grad-text">your music</span> plays');
    setText('#pricing .kicker', 'Pricing');
    setText('#pricing .section-title', 'Extended features');
    setText('#pricing .section-sub', 'for a richer listening experience');
    setText('#models .kicker', 'Tech stack');
    setText('#models .section-title', 'Under the hood');
    setText('#faq .kicker', 'FAQ');
    setText('#faq .section-title', 'Common questions');
    setHtml('.final-cta h2', 'Ready to hear music <span class="grad-text">in a new way?</span>');
    var ctaP = q('.final-cta p');
    if (ctaP) ctaP.textContent = 'Build your station in a minute — let every track tell a story.';
    var ctaBtn = q('.final-cta .btn');
    if (ctaBtn) ctaBtn.textContent = 'Get Efir AI';
    var tierBasic = document.querySelector('.tier-explain header h3');
    if (tierBasic) tierBasic.textContent = 'Basic';
    var tierExt = document.querySelector('.tier-explain.accent header h3');
    if (tierExt) tierExt.textContent = 'Extended';
    document.querySelectorAll('.plans .plan-name').forEach(function (el, i) {
      var names = ['Month', 'Year', 'Quarter'];
      if (names[i]) el.textContent = names[i];
    });
  }

  function applyPricing(lang) {
    var plans = document.querySelectorAll('.plans .plan');
    var data = lang === 'en' ? PRICING_EN : PRICING_RU;
    var T = STRINGS[lang].pricing;
    var map = { month: 0, year: 1, quarter: 2 };
    plans.forEach(function (plan) {
      var key = plan.getAttribute('data-plan');
      var p = data[key];
      if (!p) return;
      var cur = plan.querySelector('.cur');
      var amount = plan.querySelector('.amount');
      var per = plan.querySelector('.per');
      var note = plan.querySelector('.plan-note');
      var badge = plan.querySelector('.plan-badge');
      var old = plan.querySelector('.plan-old');
      var btn = plan.querySelector('.subscribe-btn');
      if (cur) cur.textContent = T.currency;
      if (amount) amount.textContent = p.price;
      if (per) {
        per.textContent = key === 'month' ? T.perMonth : key === 'year' ? T.perYear : T.perQuarter;
      }
      if (note) note.textContent = p.note;
      if (badge) {
        if (p.badge) {
          badge.textContent = p.badge;
          badge.hidden = false;
        } else badge.hidden = true;
      }
      if (old) {
        if (p.old) {
          old.hidden = false;
          old.innerHTML = p.old + ' ' + T.currency + (lang === 'en' ? '' : ' ₽');
        } else old.hidden = true;
      }
      if (btn) btn.textContent = p.cta;
      plan.setAttribute('data-price', p.price);
      if (p.old) plan.setAttribute('data-old', p.old);
      else plan.removeAttribute('data-old');
    });
  }

  function apply(lang) {
    var T = STRINGS[lang] || STRINGS.ru;
    document.documentElement.lang = lang === 'en' ? 'en' : 'ru';
    document.title = T.metaTitle;
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', T.metaDescription);
    applyNav(T);
    applyHero(T, lang);
    applyStudio(T);
    applyPricing(lang);
    applyPageBlocks(lang);
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.classList.toggle('on', btn.getAttribute('data-lang') === lang);
    });
  }

  function mountSwitcher() {
    var host = q('.header-actions');
    if (!host || q('#langSwitch')) return;
    var wrap = document.createElement('div');
    wrap.className = 'lang-switch';
    wrap.id = 'langSwitch';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Language');
    wrap.innerHTML =
      '<button type="button" class="lang-btn" data-lang="ru" title="Русский">RU</button>' +
      '<button type="button" class="lang-btn" data-lang="en" title="English">EN</button>';
    host.insertBefore(wrap, host.firstChild);
    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-lang]');
      if (!btn) return;
      setLang(btn.getAttribute('data-lang'));
    });
  }

  function init() {
    mountSwitcher();
    apply(getLang());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.EfirI18n = {
    getLang: getLang,
    setLang: setLang,
    apply: apply,
    strings: STRINGS,
  };
})(window);
