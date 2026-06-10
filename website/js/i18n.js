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
      download: {
        sub:
          'Эфир AI работает на Android и в браузере. Подписка единая — войдите под одним email, и настройки синхронизируются между устройствами.',
        androidTitle: 'Приложение для Android',
        androidDesc:
          'Следит за текущим треком в любом плеере (Spotify, Яндекс Музыка, YouTube Music) и озвучивает истории между песнями.',
        androidMeta: 'APK · Android 8.0+',
        androidBtn: 'Скачать APK',
        androidFine: 'После скачивания разрешите установку из этого источника в настройках телефона.',
        extTitle: 'Расширение для браузера',
        extDesc:
          'Для Chrome и Яндекс Браузера. Работает с веб-плеерами Яндекс Музыки, Spotify и YouTube прямо во вкладке.',
        extMeta: 'Chrome / Яндекс · MV3',
        extBtn: 'Установить расширение',
        extFineLink: 'Как установить расширение →',
      },
      sections: {
        serviceKicker: 'О сервисе',
        serviceTitle: 'Знакомые треки <span class="grad-text">звучат заново</span>',
        serviceSub:
          'Когда музыка играет фоном, детали ускользают. Эфир AI возвращает трекам контекст: между песнями звучит короткая живая вставка с настоящим фактом, и даже заигранная композиция открывается с новой стороны.',
        personasSub:
          'Один и тот же факт звучит по-разному. Выберите характер — и послушайте, как меняется подача. Листайте карточки вбок.',
        howSub:
          'Всю тяжёлую работу берёт на себя сервер, а вам остаётся только слушать. Вот что происходит за те несколько секунд, пока играет песня.',
        pricingTitle: 'Расширенные возможности',
        pricingSub: 'для качественного опыта прослушивания',
        finalCtaTitle: 'Готовы услышать музыку <span class="grad-text">по-новому?</span>',
        finalCtaSub: 'Соберите свой эфир за минуту — и пусть каждый трек расскажет историю.',
        finalCtaBtn: 'Подключить Эфир AI',
        tierBasic: 'Базовый',
        tierExtended: 'Расширенный',
        tierFree: 'бесплатно',
        tierFrom: 'от 167 ₽/мес',
      },
      modals: {
        successApk: 'Скачать APK для Android',
        successExt: 'Скачать расширение',
        loginSubmit: 'Войти в кабинет',
      },
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
      download: {
        sub:
          'Efir AI runs on Android and in the browser. One subscription — sign in with the same email and settings sync across devices.',
        androidTitle: 'Android app',
        androidDesc:
          'Tracks what is playing in any player (Spotify, Yandex Music, YouTube Music) and narrates stories between songs.',
        androidMeta: 'APK · Android 8.0+',
        androidBtn: 'Download APK',
        androidFine: 'After download, allow installs from this source in your phone settings.',
        extTitle: 'Browser extension',
        extDesc:
          'For Chrome and Yandex Browser. Works with Yandex Music, Spotify, and YouTube web players right in the tab.',
        extMeta: 'Chrome / Yandex · MV3',
        extBtn: 'Install extension',
        extFineLink: 'How to install the extension →',
      },
      sections: {
        serviceKicker: 'About',
        serviceTitle: 'Familiar tracks <span class="grad-text">sound new</span>',
        serviceSub:
          'When music is background noise, details slip away. Efir AI brings context back: a short live fact between songs, and even old favorites feel fresh.',
        personasSub:
          'One fact — many deliveries. Pick a persona and hear how the tone shifts. Swipe the cards sideways.',
        howSub:
          'The server does the heavy lifting — you just listen. Here is what happens in the few seconds while a song plays.',
        pricingTitle: 'Extended features',
        pricingSub: 'for a richer listening experience',
        finalCtaTitle: 'Ready to hear music <span class="grad-text">in a new way?</span>',
        finalCtaSub: 'Build your station in a minute — let every track tell a story.',
        finalCtaBtn: 'Get Efir AI',
        tierBasic: 'Basic',
        tierExtended: 'Extended',
        tierFree: 'free',
        tierFrom: 'from $3.33/mo',
      },
      modals: {
        successApk: 'Download APK for Android',
        successExt: 'Download extension',
        loginSubmit: 'Sign in to account',
      },
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

  function applyDownload(T) {
    var d = T.download;
    if (!d) return;
    setText('#download .section-sub', d.sub);
    var cards = document.querySelectorAll('#download .dl-card');
    if (cards[0]) {
      var a0 = cards[0];
      var h0 = a0.querySelector('h3');
      var p0 = a0.querySelector('p:not(.dl-fine)');
      var meta0 = a0.querySelector('.dl-meta li:first-child');
      var btn0 = q('#dlApk');
      var fine0 = a0.querySelector('.dl-fine');
      if (h0) h0.textContent = d.androidTitle;
      if (p0) p0.textContent = d.androidDesc;
      if (meta0) meta0.textContent = d.androidMeta;
      if (btn0) btn0.innerHTML = '<span class="btn-ic site-ic ic-download" aria-hidden="true"></span> ' + d.androidBtn;
      if (fine0) fine0.textContent = d.androidFine;
    }
    if (cards[1]) {
      var a1 = cards[1];
      var h1 = a1.querySelector('h3');
      var p1 = a1.querySelector('p:not(.dl-fine)');
      var meta1 = a1.querySelector('.dl-meta li:first-child');
      var btn1 = q('#dlExt');
      var fine1 = a1.querySelector('.dl-fine a');
      if (h1) h1.textContent = d.extTitle;
      if (p1) p1.textContent = d.extDesc;
      if (meta1) meta1.textContent = d.extMeta;
      if (btn1) btn1.innerHTML = '<span class="btn-ic site-ic ic-download" aria-hidden="true"></span> ' + d.extBtn;
      if (fine1) fine1.textContent = d.extFineLink;
    }
    var successApk = q('#successApk');
    var successExt = q('#successExt');
    if (successApk && T.modals) {
      successApk.innerHTML = '<span class="btn-ic site-ic ic-download" aria-hidden="true"></span> ' + T.modals.successApk;
    }
    if (successExt && T.modals) {
      successExt.innerHTML = '<span class="btn-ic site-ic ic-puzzle" aria-hidden="true"></span> ' + T.modals.successExt;
    }
  }

  function applySections(T, lang) {
    var s = T.sections;
    if (!s) return;
    setText('#service .kicker', s.serviceKicker);
    setHtml('#service .section-title', s.serviceTitle);
    setText('#service .section-sub', s.serviceSub);
    setText('#personas .kicker', lang === 'en' ? 'Personas' : 'Амплуа');
    setHtml(
      '#personas .section-title',
      lang === 'en'
        ? 'A host for <span class="grad-text">your taste</span>'
        : 'Рассказчик на <span class="grad-text">ваш вкус</span>',
    );
    setText('#personas .section-sub', s.personasSub);
    setText('#how .kicker', lang === 'en' ? 'How it works' : 'Как это работает');
    setHtml(
      '#how .section-title',
      lang === 'en'
        ? 'From track to story in <span class="grad-text">seconds</span>'
        : 'От трека до истории — <span class="grad-text">за секунды</span>',
    );
    setText('#how .section-sub', s.howSub);
    setText('#download .kicker', lang === 'en' ? 'Download' : 'Скачать');
    setHtml(
      '#download .section-title',
      lang === 'en'
        ? 'Wherever <span class="grad-text">your music</span> plays'
        : 'Там, где <span class="grad-text">ваша музыка</span>',
    );
    setText('#pricing .kicker', lang === 'en' ? 'Pricing' : 'Тарифы');
    setText('#pricing .section-title', s.pricingTitle);
    setText('#pricing .section-sub', s.pricingSub);
    setText('#models .kicker', lang === 'en' ? 'Tech stack' : 'Технологии и модели');
    setText('#models .section-title', lang === 'en' ? 'Under the hood' : 'Что под капотом');
    setText('#faq .kicker', 'FAQ');
    setText('#faq .section-title', lang === 'en' ? 'Common questions' : 'Частые вопросы');
    setHtml('.final-cta h2', s.finalCtaTitle);
    var ctaP = q('.final-cta p');
    if (ctaP) ctaP.textContent = s.finalCtaSub;
    var ctaBtn = q('.final-cta .btn');
    if (ctaBtn) ctaBtn.textContent = s.finalCtaBtn;
    var tiers = document.querySelectorAll('.tier-explain');
    if (tiers[0]) {
      var h = tiers[0].querySelector('header h3');
      var price = tiers[0].querySelector('.tier-price-min');
      if (h) h.textContent = s.tierBasic;
      if (price) price.textContent = s.tierFree;
    }
    if (tiers[1]) {
      var h2 = tiers[1].querySelector('header h3');
      var price2 = tiers[1].querySelector('.tier-price-min');
      if (h2) h2.textContent = s.tierExtended;
      if (price2) price2.textContent = s.tierFrom;
    }
    var planNames =
      lang === 'en' ? ['Month', 'Year', 'Quarter'] : ['Месяц', 'Год', 'Квартал'];
    document.querySelectorAll('.plans .plan-name').forEach(function (el, i) {
      if (planNames[i]) el.textContent = planNames[i];
    });
    var loginSubmit = q('#loginModalSubmit');
    if (loginSubmit && T.modals) loginSubmit.textContent = T.modals.loginSubmit;
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
    applySections(T, lang);
    applyDownload(T);
    if (global.EfirRefreshDownloadLabels) global.EfirRefreshDownloadLabels();
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
