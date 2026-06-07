/* ============================================================
   Эфир AI — app.js
   ============================================================ */
(function () {
  'use strict';

  // Backend base for the public subscribe endpoint.
  // Same-origin by default (site served from the Railway backend);
  // override with window.EFIR_API_BASE if the site is hosted separately.
  var API_BASE = (window.EFIR_API_BASE || '').replace(/\/$/, '');
  var GH_REPO = 'zapnikita95/neuroradio';
  var APK_FALLBACK = 'https://github.com/' + GH_REPO + '/releases/latest/download/MusicStory.apk';
  var EXT_FALLBACK = 'https://github.com/' + GH_REPO + '/releases/latest/download/efir-extension.zip';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------- Personas ---------------- */
  var THRILLER_CORE = 'Thriller — единственный музыкальный клип в National Film Registry США: его сохраняют как культурное наследие наравне с художественным кино. Vincent Price записал зловещий закадровый текст, а съёмки танца с зомби длились неделями.';

  var PERSONAS = [
    {
      id: 'radio_host', tag: 'Заводной эфир', name: 'Радиоведущий',
      desc: 'Тёплый эфирный тон: живо, но строго по факту. Драйв дневной радиостанции, который заряжает энергией между треками.',
      traits: ['энергично', 'тепло', 'по делу'],
      quote: '«А вот это — личное. Слушайте…»',
      pal: ['#ff7a3d', '#ff3d8b'], skin: ['#ffd9b8', '#ff9e7a'], eye: '#3a1c2e', accent: '#ffd84d',
      voice: 'zahar', rate: 1.08, pitch: 1.05,
      script: 'А вот это — личное. ' + THRILLER_CORE + ' Именно этот клип взорвал MTV — звук на максимум, поехали!',
      audio: 'assets/demos/persona-radio_host.wav'
    },
    {
      id: 'night_dj', tag: 'Ночной подкаст', name: 'Ночной диджей',
      desc: 'Тихий ночной эфир: факт чёткий, темп медленный, голос почти на ухо. Для поздних плейлистов и долгой дороги.',
      traits: ['спокойно', 'интимно', 'медленно'],
      quote: '«Тихо… только вы и эта песня.»',
      pal: ['#3b2c8f', '#1e2a78'], skin: ['#cfd6ff', '#8aa0ff'], eye: '#10163a', accent: '#9ad7ff',
      voice: 'filipp', rate: 0.92, pitch: 0.95,
      script: 'Тихо. Только вы и эта песня. ' + THRILLER_CORE + ' Останьтесь со мной до утра.',
      audio: 'assets/demos/persona-night_dj.wav'
    },
    {
      id: 'expert', tag: 'Эксперт жанра', name: 'Эксперт жанра',
      desc: 'Подкастовая экспертиза: механика жанра без занудства. Объясняет, почему трек устроен именно так и за счёт чего работает.',
      traits: ['разбор', 'контекст', 'точность'],
      quote: '«Разберём, почему это работает.»',
      pal: ['#7b2fff', '#2bd4ff'], skin: ['#e7d9ff', '#b89aff'], eye: '#1a1140', accent: '#5ef0ff',
      voice: 'ermil', rate: 1.0, pitch: 1.0,
      script: 'Разберём, почему это работает. ' + THRILLER_CORE + ' Это эталон поп-хоррора восьмидесятых.',
      audio: 'assets/demos/persona-expert.wav'
    },
    {
      id: 'contemporary', tag: 'Современник эпохи', name: 'Современник эпохи',
      desc: 'Ностальгия от первого лица — будто вы жили, когда трек вышел. Личная память вместо энциклопедии.',
      traits: ['ностальгия', 'от первого лица', 'тепло'],
      quote: '«Я помню это время…»',
      pal: ['#d98a2b', '#a83b6a'], skin: ['#ffe0c2', '#f0a87a'], eye: '#3a221c', accent: '#ffcf8a',
      voice: 'alena', rate: 0.98, pitch: 1.0,
      script: 'Я помню это время. Когда клип Thriller показали по MTV — мы замерли у экранов. ' + THRILLER_CORE,
      audio: 'assets/demos/persona-contemporary.wav'
    },
    {
      id: 'fan', tag: 'Фанат-коллекционер', name: 'Фанат-коллекционер',
      desc: 'Восторженный фанат от первого лица: обожает артиста и знает детали, которые греют сердце коллекционера.',
      traits: ['восторг', 'детали', 'любовь к делу'],
      quote: '«Обожаю этот момент!»',
      pal: ['#ff3d8b', '#a855f7'], skin: ['#ffd4ec', '#ff8ac4'], eye: '#3a1430', accent: '#ffe14d',
      voice: 'jane', rate: 1.12, pitch: 1.12,
      script: 'Обожаю этот момент! ' + THRILLER_CORE + ' И да — я знаю каждую секунду этого клипа наизусть!',
      audio: 'assets/demos/persona-fan.wav'
    },
    {
      id: 'backstage', tag: 'С закулисья', name: 'Инсайдер с закулисья',
      desc: 'Инсайдерский тон — только если в факте есть курьёз. Истории, о которых обычно говорят вполголоса.',
      traits: ['инсайд', 'курьёз', 'вполголоса'],
      quote: '«Только между нами…»',
      pal: ['#8f1d3a', '#2a1145'], skin: ['#f0c9d4', '#c87a96'], eye: '#2a0e1c', accent: '#ff6b8a',
      voice: 'omazh', rate: 0.96, pitch: 0.98,
      script: 'Только между нами. ' + THRILLER_CORE + ' Об этом редко рассказывают вслух.',
      audio: 'assets/demos/persona-backstage.wav'
    }
  ];

  /* ---------------- Voices (Yandex labels) ---------------- */
  var VOICES = [
    { id: 'zahar', label: 'Захар — глубокий, мужской' },
    { id: 'ermil', label: 'Ермил — бодрый, мужской' },
    { id: 'filipp', label: 'Филипп — мягкий, мужской' },
    { id: 'alexander', label: 'Александр — ровный, мужской' },
    { id: 'kirill', label: 'Кирилл — нейтральный, мужской' },
    { id: 'alena', label: 'Алёна — дружелюбный, женский' },
    { id: 'jane', label: 'Джейн — выразительный, женский' },
    { id: 'omazh', label: 'Омаж — тёплый, женский' },
    { id: 'marina', label: 'Марина — спокойный, женский' },
    { id: 'dasha', label: 'Даша — живой, женский' },
    { id: 'julia', label: 'Юлия — низкий, женский' },
    { id: 'masha', label: 'Маша — мягкий, женский' },
    { id: 'lera', label: 'Лера — лёгкий, женский' }
  ];
  function voiceLabel(id) { for (var i = 0; i < VOICES.length; i++) if (VOICES[i].id === id) return VOICES[i].label.split(' — ')[0]; return id; }

  /* ---------------- Portrait SVG ---------------- */
  function portrait(p, idx) {
    var g = 'g' + idx;
    var acc = accessory(p, idx);
    return '' +
'<svg viewBox="0 0 380 320" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Амплуа: ' + p.name + '">' +
'<defs>' +
  '<linearGradient id="bg' + g + '" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' + p.pal[0] + '"/><stop offset="1" stop-color="' + p.pal[1] + '"/>' +
  '</linearGradient>' +
  '<radialGradient id="sk' + g + '" cx="0.5" cy="0.42" r="0.62">' +
    '<stop offset="0" stop-color="' + p.skin[0] + '"/><stop offset="1" stop-color="' + p.skin[1] + '"/>' +
  '</radialGradient>' +
  '<radialGradient id="gl' + g + '" cx="0.5" cy="0.4" r="0.6">' +
    '<stop offset="0" stop-color="#fff" stop-opacity="0.5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>' +
  '</radialGradient>' +
'</defs>' +
'<rect width="380" height="320" fill="url(#bg' + g + ')"/>' +
'<circle cx="190" cy="150" r="150" fill="url(#gl' + g + ')"/>' +
// floating sprites
'<g opacity="0.5" fill="' + p.accent + '">' +
  '<circle cx="44" cy="58" r="5"/><circle cx="330" cy="44" r="7"/><circle cx="346" cy="232" r="5"/>' +
  '<text x="300" y="120" font-size="34" font-family="Unbounded,sans-serif" opacity="0.7">♪</text>' +
  '<text x="40" y="210" font-size="26" font-family="Unbounded,sans-serif" opacity="0.6">♫</text>' +
'</g>' +
// shoulders
'<path d="M70 320 Q70 246 190 246 Q310 246 310 320 Z" fill="' + p.pal[1] + '" opacity="0.9"/>' +
'<path d="M104 320 Q104 270 190 270 Q276 270 276 320 Z" fill="#0d0a1a" opacity="0.25"/>' +
// head
'<ellipse cx="190" cy="150" rx="92" ry="104" fill="url(#sk' + g + ')"/>' +
// hair / top accent
'<path d="M98 132 Q104 54 190 50 Q276 54 282 132 Q250 96 190 96 Q130 96 98 132 Z" fill="#0d0a1a" opacity="0.45"/>' +
// eyes (focal point)
eye(150, 150, p.eye) + eye(230, 150, p.eye) +
// brows
'<path d="M126 120 Q150 110 174 120" stroke="#0d0a1a" stroke-opacity="0.4" stroke-width="5" fill="none" stroke-linecap="round"/>' +
'<path d="M206 120 Q230 110 254 120" stroke="#0d0a1a" stroke-opacity="0.4" stroke-width="5" fill="none" stroke-linecap="round"/>' +
// nose + mouth
'<path d="M190 156 Q196 178 188 186" stroke="#0d0a1a" stroke-opacity="0.25" stroke-width="4" fill="none" stroke-linecap="round"/>' +
'<path d="M168 202 Q190 216 212 202" stroke="#0d0a1a" stroke-opacity="0.5" stroke-width="5" fill="none" stroke-linecap="round"/>' +
acc +
'</svg>';
  }
  function eye(cx, cy, iris) {
    return '<g>' +
      '<ellipse cx="' + cx + '" cy="' + cy + '" rx="22" ry="17" fill="#fff"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="11" fill="' + iris + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="#000"/>' +
      '<circle cx="' + (cx + 4) + '" cy="' + (cy - 4) + '" r="3" fill="#fff"/>' +
    '</g>';
  }
  function accessory(p, idx) {
    switch (p.id) {
      case 'radio_host': // headphones + mic
        return '<g stroke="' + p.accent + '" stroke-width="9" fill="none" stroke-linecap="round">' +
          '<path d="M104 150 A86 86 0 0 1 276 150"/></g>' +
          '<rect x="92" y="146" width="22" height="46" rx="11" fill="' + p.accent + '"/>' +
          '<rect x="266" y="146" width="22" height="46" rx="11" fill="' + p.accent + '"/>' +
          '<g stroke="' + p.accent + '" stroke-width="6" stroke-linecap="round"><line x1="300" y1="214" x2="300" y2="250"/></g>' +
          '<circle cx="300" cy="206" r="13" fill="' + p.accent + '"/>';
      case 'night_dj': // moon + headphones
        return '<g stroke="' + p.accent + '" stroke-width="8" fill="none" stroke-linecap="round"><path d="M108 150 A82 82 0 0 1 272 150"/></g>' +
          '<rect x="96" y="146" width="20" height="42" rx="10" fill="' + p.accent + '"/>' +
          '<rect x="264" y="146" width="20" height="42" rx="10" fill="' + p.accent + '"/>' +
          '<path d="M322 60 a22 22 0 1 0 20 30 a17 17 0 1 1 -20 -30 Z" fill="' + p.accent + '" opacity="0.9"/>';
      case 'expert': // glasses
        return '<g stroke="' + p.accent + '" stroke-width="6" fill="none">' +
          '<circle cx="150" cy="150" r="30"/><circle cx="230" cy="150" r="30"/>' +
          '<line x1="180" y1="150" x2="200" y2="150"/><line x1="120" y1="146" x2="100" y2="138"/><line x1="260" y1="146" x2="280" y2="138"/></g>';
      case 'contemporary': // vinyl record
        return '<g transform="translate(308 210)"><circle r="30" fill="#0d0a1a" opacity="0.85"/><circle r="30" fill="none" stroke="' + p.accent + '" stroke-width="2" opacity="0.6"/><circle r="9" fill="' + p.accent + '"/><circle r="3" fill="#0d0a1a"/></g>';
      case 'fan': // sparkles / hearts
        return '<g fill="' + p.accent + '">' +
          '<path d="M312 196 l5 10 11 1 -8 8 2 11 -10 -5 -10 5 2 -11 -8 -8 11 -1 Z"/>' +
          '<path d="M56 132 l4 8 9 1 -7 6 2 9 -8 -4 -8 4 2 -9 -7 -6 9 -1 Z"/></g>';
      case 'backstage': // curtain
        return '<g fill="' + p.accent + '" opacity="0.85">' +
          '<path d="M0 0 H64 Q52 60 60 130 Q40 150 20 130 Q28 60 0 64 Z"/></g>' +
          '<g fill="' + p.accent + '" opacity="0.85"><path d="M380 0 H316 Q328 60 320 130 Q340 150 360 130 Q352 60 380 64 Z"/></g>';
      default: return '';
    }
  }

  /* ---------------- Render persona cards ---------------- */
  var rail = $('#personaRail');
  if (rail) {
    PERSONAS.forEach(function (p, i) {
      var card = document.createElement('article');
      card.className = 'persona-card';
      card.innerHTML =
        '<div class="persona-portrait">' + portrait(p, i) +
          '<button class="persona-play" data-i="' + i + '" aria-label="Послушать пример: ' + p.name + '"><span class="play-glyph"></span></button>' +
        '</div>' +
        '<div class="persona-body">' +
          '<span class="persona-tag">' + p.tag + '</span>' +
          '<h3 class="persona-name">' + p.name + '</h3>' +
          '<p class="persona-desc">' + p.desc + '</p>' +
          '<div class="persona-traits">' + p.traits.map(function (t) { return '<span>' + t + '</span>'; }).join('') + '</div>' +
          '<p class="persona-quote">' + p.quote + '</p>' +
          '<p class="persona-status" data-status="' + i + '"></p>' +
        '</div>';
      rail.appendChild(card);
    });
  }

  /* ---------------- Demo audio (Yandex TTS pre-rendered) ---------------- */
  var demoAudio = new Audio();
  demoAudio.preload = 'none';
  var currentBtn = null;

  function stopSpeak() {
    demoAudio.pause();
    demoAudio.currentTime = 0;
    if (currentBtn) { currentBtn.classList.remove('playing'); currentBtn = null; }
    $$('.persona-status').forEach(function (s) { s.textContent = ''; });
    var eq = $('#previewEq');
    if (eq) eq.classList.add('paused');
  }

  function demoStudioSrc(personaId, voiceId) {
    return 'assets/demos/studio-' + personaId + '-' + voiceId + '.wav';
  }

  function playDemo(src, rate, btn, statusEl) {
    if (!src) {
      if (statusEl) statusEl.textContent = 'Демо-аудио скоро будет доступно.';
      return;
    }
    if (currentBtn === btn && !demoAudio.paused) { stopSpeak(); return; }
    stopSpeak();
    demoAudio.src = src;
    demoAudio.playbackRate = rate || 1;
    currentBtn = btn || null;
    if (btn) btn.classList.add('playing');
    if (statusEl) statusEl.textContent = '● В эфире…';
    demoAudio.onended = function () {
      if (btn) btn.classList.remove('playing');
      if (statusEl) statusEl.textContent = '';
      if (currentBtn === btn) currentBtn = null;
      var eq = $('#previewEq');
      if (eq) eq.classList.add('paused');
    };
    demoAudio.onerror = function () {
      if (btn) btn.classList.remove('playing');
      if (statusEl) statusEl.textContent = 'Не удалось загрузить демо — попробуйте позже.';
    };
    demoAudio.play().catch(function () {
      if (statusEl) statusEl.textContent = 'Нажмите ещё раз для воспроизведения.';
    });
  }

  $$('.persona-play').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var p = PERSONAS[+btn.dataset.i];
      var statusEl = $('[data-status="' + btn.dataset.i + '"]');
      playDemo(p.audio, p.rate, btn, statusEl);
    });
  });

  /* ---------------- Persona rail nav ---------------- */
  (function () {
    if (!rail) return;
    var prev = $('#railPrev'), next = $('#railNext'), bar = $('#railProgressBar');
    function step() { var c = rail.querySelector('.persona-card'); return c ? c.offsetWidth + 22 : 380; }
    if (prev) prev.addEventListener('click', function () { rail.scrollBy({ left: -step(), behavior: 'smooth' }); });
    if (next) next.addEventListener('click', function () { rail.scrollBy({ left: step(), behavior: 'smooth' }); });
    rail.addEventListener('scroll', function () {
      var max = rail.scrollWidth - rail.clientWidth;
      var r = max > 0 ? rail.scrollLeft / max : 0;
      if (bar) { bar.style.width = '22%'; bar.style.marginLeft = (r * 78) + '%'; }
    });
  })();

  /* ---------------- Header scroll + burger ---------------- */
  var header = $('#siteHeader');
  function onScroll() { if (header) header.classList.toggle('scrolled', window.scrollY > 24); }
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
  var burger = $('#burger');
  if (burger && header) {
    burger.addEventListener('click', function () {
      var open = header.classList.toggle('menu-open');
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $$('.nav a, .nav-cta').forEach(function (a) { a.addEventListener('click', function () { header.classList.remove('menu-open'); burger.classList.remove('open'); }); });
  }

  /* ---------------- Reveal on scroll ---------------- */
  (function () {
    var els = $$('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    els.forEach(function (e) { io.observe(e); });
  })();

  /* ---------------- Hero parallax (cursor follow) ---------------- */
  (function () {
    var hero = $('#hero'); if (!hero) return;
    var items = $$('[data-depth]', hero);
    var raf = null, mx = 0, my = 0;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    hero.addEventListener('mousemove', function (e) {
      var r = hero.getBoundingClientRect();
      mx = (e.clientX - r.left - r.width / 2) / r.width;
      my = (e.clientY - r.top - r.height / 2) / r.height;
      if (!raf) raf = requestAnimationFrame(apply);
    });
    hero.addEventListener('mouseleave', function () { mx = 0; my = 0; if (!raf) raf = requestAnimationFrame(apply); });
    function apply() {
      raf = null;
      items.forEach(function (it) {
        var d = parseFloat(it.getAttribute('data-depth')) || 0.05;
        it.style.transform = 'translate(' + (mx * d * 220) + 'px,' + (my * d * 220) + 'px)';
      });
    }
  })();

  /* ---------------- Studio (interactive demo) ---------------- */
  (function () {
    var scriptEl = $('#previewScript'); if (!scriptEl) return;
    var hostEl = $('#previewHost'), tagVoice = $('#tagVoice'), tagLen = $('#tagLen'), tagTempo = $('#tagTempo');
    var ampluaChips = $('#ampluaChips'), voiceSel = $('#voiceSelect');
    var tempo = $('#tempo'), tempoOut = $('#tempoOut');
    var length = $('#length'), lengthOut = $('#lengthOut');
    var playBtn = $('#previewPlay'), eq = $('#previewEq');

    var TEMPOS = [{ l: 'Очень медленно', r: 0.85 }, { l: 'Медленно', r: 0.95 }, { l: 'Нормально', r: 1.08 }, { l: 'Быстро', r: 1.22 }, { l: 'Очень быстро', r: 1.38 }];
    var LENS = [{ l: '30 секунд', s: '~30 с', n: 1 }, { l: '1 минута', s: '~60 с', n: 2 }, { l: 'Без лимита', s: '2+ мин', n: 4 }];

    var FACTS = [
      'National Film Registry включил этот клип в список культурного наследия США',
      'Vincent Price записал зловещий закадровый монолог',
      'съёмки танца с зомби заняли недели',
      'именно этот ролик сделал короткометражку главным событием эры MTV'
    ];
    var FOCUS = {
      all: '', pop: ' Чистый поп-инжиниринг эпохи MTV.',
      rock: ' Даже рокеры признавали железную ритм-секцию трека.',
      hiphop: ' Этот бит потом сэмплировали в хип-хопе десятки раз.',
      electronic: ' Сухой звук драм-машины Linn — мостик к электронике.'
    };

    var state = { persona: PERSONAS[0], focus: 'all' };

    PERSONAS.forEach(function (p, i) {
      var b = document.createElement('button');
      b.className = 'chip' + (i === 0 ? ' on' : ''); b.textContent = p.name; b.dataset.i = i;
      b.addEventListener('click', function () {
        $$('.chip', ampluaChips).forEach(function (c) { c.classList.remove('on'); });
        b.classList.add('on'); state.persona = PERSONAS[i];
        if (voiceSel) voiceSel.value = state.persona.voice;
        render();
      });
      ampluaChips.appendChild(b);
    });
    VOICES.forEach(function (v) { var o = document.createElement('option'); o.value = v.id; o.textContent = v.label; voiceSel.appendChild(o); });
    voiceSel.value = PERSONAS[0].voice;

    $$('#focusChips .chip').forEach(function (c) {
      c.addEventListener('click', function () {
        $$('#focusChips .chip').forEach(function (x) { x.classList.remove('on'); });
        c.classList.add('on'); state.focus = c.dataset.focus; render();
      });
    });

    function buildStory() {
      var p = state.persona, n = LENS[+length.value].n;
      var op = p.script.split('.')[0] + '.';
      var body = FACTS.slice(0, n).map(function (f) { return f + '.'; }).join(' ');
      var tail = FOCUS[state.focus] || '';
      var closer = '';
      var s = p.script.split('. ');
      if (s.length) closer = ' ' + s[s.length - 1];
      return op + ' ' + body + tail + (n > 1 ? closer : '');
    }

    function render() {
      var p = state.persona;
      hostEl.textContent = p.name;
      tempoOut.textContent = TEMPOS[+tempo.value].l;
      lengthOut.textContent = LENS[+length.value].l;
      tagVoice.textContent = 'Голос: ' + voiceLabel(voiceSel.value);
      tagLen.textContent = LENS[+length.value].s;
      tagTempo.textContent = 'Темп: ' + TEMPOS[+tempo.value].l.toLowerCase();
      scriptEl.style.opacity = '0';
      setTimeout(function () { scriptEl.textContent = '«' + buildStory() + '»'; scriptEl.style.opacity = '1'; }, 130);
    }

    [tempo, length].forEach(function (r) { r.addEventListener('input', render); });
    voiceSel.addEventListener('change', render);

    playBtn.addEventListener('click', function () {
      if (eq) eq.classList.remove('paused');
      var p = state.persona;
      var src = demoStudioSrc(p.id, voiceSel.value);
      var fallback = p.audio;
      playDemo(src, TEMPOS[+tempo.value].r, playBtn, null);
      demoAudio.onerror = function () {
        playDemo(fallback, TEMPOS[+tempo.value].r, playBtn, null);
      };
    });

    render();
  })();

  /* ---------------- Subscribe modal ---------------- */
  (function () {
    var backdrop = $('#modalBackdrop'); if (!backdrop) return;
    var form = $('#subscribeForm'), success = $('#modalSuccess');
    var planName = $('#modalPlanName'), amountEl = $('#modalAmount'), perEl = $('#modalPer'), oldEl = $('#modalOld');
    var payAmount = $('#payAmount'), emailInput = $('#emailInput'), emailErr = $('#emailErr');
    var agreeInput = $('#agreeInput'), agreeErr = $('#agreeErr'), successEmail = $('#successEmail');
    var lastFocus = null;
    var PER = { month: '/мес', quarter: '/3 мес', year: '/год' };
    var selectedPlanKey = 'year';

    function openModal(plan) {
      var price = plan.getAttribute('data-price'), old = plan.getAttribute('data-old');
      var name = plan.querySelector('.plan-name').textContent;
      var key = plan.getAttribute('data-plan');
      selectedPlanKey = key;
      planName.textContent = name;
      amountEl.textContent = price; perEl.textContent = PER[key] || '';
      payAmount.textContent = price + ' ₽';
      if (old) { oldEl.hidden = false; oldEl.textContent = old + ' ₽'; } else { oldEl.hidden = true; }
      form.hidden = false; success.hidden = true;
      emailErr.hidden = true; agreeErr.hidden = true; form.reset();
      backdrop.hidden = false; document.body.style.overflow = 'hidden';
      lastFocus = document.activeElement;
      setTimeout(function () { emailInput.focus(); }, 50);
    }
    function closeModal() { backdrop.hidden = true; document.body.style.overflow = ''; stopSpeak(); if (lastFocus) lastFocus.focus(); }

    $$('.subscribe-btn').forEach(function (b) {
      b.addEventListener('click', function () { openModal(b.closest('.plan')); });
    });
    $('#modalClose').addEventListener('click', closeModal);
    $('#successClose').addEventListener('click', closeModal);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !backdrop.hidden) closeModal(); });

    function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var okEmail = validEmail(emailInput.value.trim());
      var okAgree = agreeInput.checked;
      emailErr.hidden = okEmail; agreeErr.hidden = okAgree;
      if (!okEmail || !okAgree) return;

      var payBtn = $('#payBtn'); var prevText = payBtn.innerHTML;
      payBtn.disabled = true; payBtn.innerHTML = 'Создаём платёж…';

      var payload = { email: emailInput.value.trim(), plan: selectedPlanKey, amount: amountEl.textContent };
      var url = (API_BASE || '') + '/v1/public/payment/create';
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          if (res.ok && res.body.confirmationUrl) {
            window.location.href = res.body.confirmationUrl;
            return;
          }
          if (res.ok) {
            successEmail.textContent = payload.email;
            form.hidden = true; success.hidden = false;
            return;
          }
          emailErr.hidden = false;
          emailErr.textContent = res.body.error || 'Не удалось создать платёж';
        })
        .catch(function () {
          emailErr.hidden = false;
          emailErr.textContent = 'Сеть недоступна — попробуйте позже';
        })
        .finally(function () {
          payBtn.disabled = false; payBtn.innerHTML = prevText;
        });
    });
  })();

  /* ---------------- GitHub latest release wiring ---------------- */
  (function () {
    var apkEls = ['#dlApk', '#successApk'].map($).filter(Boolean);
    var extEls = ['#dlExt', '#successExt'].map($).filter(Boolean);
    var apkVer = $('#apkVersion'), extVer = $('#extVersion');

    fetch('https://api.github.com/repos/' + GH_REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) { if (!r.ok) throw new Error('no release'); return r.json(); })
      .then(function (rel) {
        var assets = rel.assets || [];
        var apk = assets.filter(function (a) { return /\.apk$/i.test(a.name); })[0];
        var ext = assets.filter(function (a) { return /\.(zip|crx)$/i.test(a.name); })[0];
        if (apk) { apkEls.forEach(function (e) { e.href = apk.browser_download_url; }); if (apkVer) apkVer.textContent = 'версия ' + (rel.tag_name || ''); }
        if (ext) { extEls.forEach(function (e) { e.href = ext.browser_download_url; }); if (extVer) extVer.textContent = 'версия ' + (rel.tag_name || ''); }
        if (!apk) apkEls.forEach(function (e) { e.href = APK_FALLBACK; });
        if (!ext) extEls.forEach(function (e) { e.href = EXT_FALLBACK; });
      })
      .catch(function () {
        apkEls.forEach(function (e) { e.href = APK_FALLBACK; });
        extEls.forEach(function (e) { e.href = EXT_FALLBACK; });
        if (apkVer) apkVer.textContent = 'последняя сборка';
        if (extVer) extVer.textContent = 'последняя сборка';
      });
  })();

  /* ---------------- Misc ---------------- */
  var yr = $('#year'); if (yr) yr.textContent = new Date().getFullYear();
})();
