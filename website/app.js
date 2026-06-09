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
  var MOBILE_TAG = 'mobile-latest';
  var APK_FALLBACK = '/efir-ai.apk';
  var EXT_FALLBACK = 'https://github.com/' + GH_REPO + '/releases/download/' + MOBILE_TAG + '/efir-extension.zip';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------- Personas ---------------- */
  var THRILLER_CORE = 'Майкл Джексон записал Thriller в эпоху, когда клипы только меняли правила игры. Это был не просто трэк — кинематограф на 14 минут. MTV крутил в основном рок, но Thriller ставили в эфир целиком, прерывая вещание. Джексон вложил полмиллиона из своего кармана — продажи альбома выросли в семь раз.';

  var FACT_REGISTRY = 'Thriller — единственный музыкальный клип в National Film Registry США: его сохраняют как культурное наследие наравне с художественным кино.';
  var FACT_BUDGET = 'Michael Jackson вложил в съёмки Thriller полмиллиона долларов из своего кармана — продюсеры крутили пальцем у виска, а после премьеры продажи альбома подскочили в семь раз.';
  var BACKSTAGE_STORY_SHORT = 'Только между нами. ' + FACT_BUDGET + ' Vincent Price уложил закадровый монолог в один день — без его голоса клип был бы совсем другим. Об этом редко говорят вслух.';

  var STUDIO_VOICES = {
    radio_host: ['zahar', 'ermil', 'alexander'],
    night_dj: ['ermil'],
    expert: ['ermil', 'zahar', 'filipp'],
    contemporary: ['alena', 'omazh', 'marina'],
    fan: ['jane', 'dasha', 'lera'],
    backstage: ['omazh', 'jane']
  };

  var PERSONAS = [
    {
      id: 'radio_host', tag: 'Заводной эфир', name: 'Радиоведущий',
      desc: 'Тёплый эфирный тон: живо, но строго по факту. Драйв дневной радиостанции, который заряжает энергией между треками.',
      traits: ['энергично', 'тепло', 'по делу'],
      quote: '«Слушайте — Thriller взорвал MTV!»',
      voice: 'zahar', rate: 1.08, pitch: 1.05,
      script: THRILLER_CORE + ' Именно этот клип взорвал MTV — звук на максимум, поехали!',
      audio: 'assets/demos/persona-radio_host.wav'
    },
    {
      id: 'night_dj', tag: 'Ночной подкаст', name: 'Ночной диджей',
      desc: 'Тихий ночной эфир: факт чёткий, темп медленный, голос почти на ухо. Для поздних плейлистов и долгой дороги.',
      traits: ['спокойно', 'интимно', 'медленно'],
      quote: '«Доброй ночи! Интересный факт…»',
      voice: 'ermil', rate: 0.92, pitch: 0.95,
      script: 'Доброй ночи! Интересный факт: ' + FACT_REGISTRY + ' Оставайтесь на нашей волне до утра.',
      audio: 'assets/demos/persona-night_dj.wav'
    },
    {
      id: 'expert', tag: 'Эксперт жанра', name: 'Эксперт жанра',
      desc: 'Подкастовая экспертиза: механика жанра без занудства. Объясняет, почему трек устроен именно так и за счёт чего работает.',
      traits: ['разбор', 'контекст', 'точность'],
      quote: '«Уникальный факт:»',
      voice: 'ermil', rate: 1.0, pitch: 1.0,
      script: 'Уникальный факт: ' + FACT_REGISTRY + ' Это эталон поп-хоррора восьмидесятых.',
      audio: 'assets/demos/persona-expert.wav'
    },
    {
      id: 'contemporary', tag: 'Современник эпохи', name: 'Современник эпохи',
      desc: 'Ностальгия от первого лица — будто вы жили, когда трек вышел. Личная память вместо энциклопедии.',
      traits: ['ностальгия', 'от первого лица', 'тепло'],
      quote: '«Я помню это время…»',
      voice: 'alena', rate: 0.98, pitch: 1.0,
      script: 'Я помню это время. Michael Jackson вложил полмиллиона в клип Thriller — и после премьеры продажи альбома выросли в семь раз. Мы смотрели четырнадцатиминутный ролик по MTV целиком, а потом скупали VHS, чтобы пересматривать дома.',
      audio: 'assets/demos/persona-contemporary.wav'
    },
    {
      id: 'fan', tag: 'Фанат-коллекционер', name: 'Фанат-коллекционер',
      desc: 'Восторженный фанат от первого лица: обожает артиста и знает детали, которые греют сердце коллекционера.',
      traits: ['восторг', 'детали', 'любовь к делу'],
      quote: '«Обожаю этот момент!»',
      voice: 'jane', rate: 1.12, pitch: 1.12,
      script: 'Обожаю этот момент! ' + THRILLER_CORE + ' И да — я знаю каждую секунду этого клипа наизусть!',
      audio: 'assets/demos/persona-fan.wav'
    },
    {
      id: 'backstage', tag: 'С закулисья', name: 'Инсайдер с закулисья',
      desc: 'Инсайдерский тон — только если в факте есть курьёз. Истории, о которых обычно говорят вполголоса.',
      traits: ['инсайд', 'курьёз', 'вполголоса'],
      quote: '«Только между нами…»',
      voice: 'omazh', rate: 0.96, pitch: 0.98,
      script: BACKSTAGE_STORY_SHORT,
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

  function portraitImg(p) {
    return (
      '<img class="persona-art" src="assets/personas/persona-' + p.id + '.png" alt="Амплуа: ' + p.name + '" ' +
      'loading="lazy" decoding="async" width="760" height="640" />'
    );
  }

  /* ---------------- Render persona cards ---------------- */
  var rail = $('#personaRail');
  if (rail) {
    PERSONAS.forEach(function (p, i) {
      var card = document.createElement('article');
      card.className = 'persona-card';
      card.innerHTML =
        '<div class="persona-portrait" data-persona="' + p.id + '">' + portraitImg(p) +
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

  function demoStudioSrc(personaId, voiceId, lenN) {
    if (lenN === 4) return 'assets/demos/studio-' + personaId + '-len4.wav';
    if (lenN === 2) return 'assets/demos/studio-' + personaId + '-len2.wav';
    return 'assets/demos/studio-' + personaId + '-' + voiceId + '.wav';
  }

  function playStudioDemo(srcList, rate, btn) {
    var idx = 0;
    function tryNext() {
      if (idx >= srcList.length) {
        if (btn) btn.classList.remove('playing');
        return;
      }
      playDemo(srcList[idx], rate, btn, null);
      demoAudio.onerror = function () {
        idx += 1;
        tryNext();
      };
    }
    tryNext();
  }

  function playDemo(src, rate, btn, statusEl) {
    if (!src) {
      if (statusEl) statusEl.textContent = 'Демо-аудио скоро будет доступно.';
      return;
    }
    if (currentBtn === btn && !demoAudio.paused) { stopSpeak(); return; }
    stopSpeak();
    demoAudio.volume = 1;
    demoAudio.muted = false;
    demoAudio.src = src;
    demoAudio.playbackRate = rate || 1;
    demoAudio.onplaying = null;
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

  /* ---------------- Persona rail nav + drag scroll ---------------- */
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

    var dragging = false, moved = false, startX = 0, startScroll = 0;
    rail.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || e.target.closest('.persona-play')) return;
      dragging = true;
      moved = false;
      startX = e.pageX;
      startScroll = rail.scrollLeft;
      rail.classList.add('is-dragging');
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var dx = e.pageX - startX;
      if (Math.abs(dx) > 4) moved = true;
      rail.scrollLeft = startScroll - dx;
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      rail.classList.remove('is-dragging');
    }
    window.addEventListener('mouseup', endDrag);
    rail.addEventListener('mouseleave', endDrag);
    rail.addEventListener('click', function (e) {
      if (!moved) return;
      e.preventDefault();
      e.stopPropagation();
      moved = false;
    }, true);
  })();

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

  /* ---------------- Hero now-playing scroll drift (desktop) ---------------- */
  (function () {
    var np = document.getElementById('heroNowPlaying');
    var inner = document.querySelector('#hero > .hero-inner');
    var header = document.getElementById('siteHeader');
    if (!np || !inner) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var mq = window.matchMedia('(min-width: 981px)');
    var metrics = null;

    function headerStopTop() {
      return header ? header.getBoundingClientRect().bottom : 0;
    }

    function measure() {
      np.style.transform = '';
      if (!mq.matches) {
        metrics = null;
        return;
      }
      var elR = np.getBoundingClientRect();
      var innerR = inner.getBoundingClientRect();
      var scrollY = window.scrollY;
      metrics = {
        elDocTop: scrollY + elR.top,
        elHeight: elR.height,
        innerDocBottom: scrollY + innerR.bottom,
      };
    }

    function onScroll() {
      if (!mq.matches || !metrics) {
        np.style.transform = '';
        return;
      }
      var scrollY = window.scrollY;
      var stopTop = headerStopTop();
      var trigger = metrics.elDocTop - stopTop;
      var drift = scrollY - trigger;
      if (drift <= 0) {
        np.style.transform = '';
        return;
      }
      var innerBottomVp = metrics.innerDocBottom - scrollY;
      var elNaturalBottom = metrics.elDocTop - scrollY + metrics.elHeight;
      var maxDrift = Math.max(0, innerBottomVp - elNaturalBottom);
      drift = Math.min(drift, maxDrift);
      np.style.transform = 'translate3d(0,' + drift + 'px,0)';
    }

    function tick() {
      measure();
      onScroll();
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', tick);
    if (mq.addEventListener) mq.addEventListener('change', tick);
    else if (mq.addListener) mq.addListener(tick);
    tick();
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

    var demoCopy = { short: {}, minute: {}, full: {} };
    var state = { persona: PERSONAS[0] };

    function prettyDisplay(text) {
      if (!text) return '';
      return text
        .replace(/\bмайкл джексон\b/gi, 'Майкл Джексон')
        .replace(/\bджохн\b/gi, 'Джон')
        .replace(/\bджохн ландис\b/gi, 'Джон Ландис')
        .replace(/\bландис\b/g, 'Ландис')
        .replace(/\bвинсент прайс\b/gi, 'Винсент Прайс')
        .replace(/\bмикхаил питерс\b/gi, 'Майкл Питерс')
        .replace(/\bхореографу\s+майкл\s+питерс\b/gi, 'хореографу Майклу Питерсу')
        .replace(/\bубеждать\s+его\b/gi, 'убеждать Джона Ландиса')
        .replace(/\bубеждать\s+ландиса\b/gi, 'убеждать Джона Ландиса')
        .replace(/\bмикхаил\b/g, 'Майкл')
        .replace(/\bджакксон\b/gi, 'Джексон');
    }

    function studioDisplayText(personaId, lenN) {
      if (lenN >= 4) return demoCopy.full[personaId] || '';
      if (lenN >= 2) return demoCopy.minute[personaId] || '';
      return demoCopy.short[personaId] || '';
    }

    function syncVoiceSelect() {
      if (!voiceSel) return;
      var allowed = STUDIO_VOICES[state.persona.id] || [state.persona.voice];
      var prev = voiceSel.value;
      voiceSel.innerHTML = '';
      VOICES.forEach(function (v) {
        if (allowed.indexOf(v.id) === -1) return;
        var o = document.createElement('option');
        o.value = v.id;
        o.textContent = v.label;
        voiceSel.appendChild(o);
      });
      if (allowed.indexOf(prev) !== -1) voiceSel.value = prev;
      else voiceSel.value = allowed[0];
    }

    function render() {
      var p = state.persona;
      var lenN = LENS[+length.value].n;
      hostEl.textContent = p.name;
      tempoOut.textContent = TEMPOS[+tempo.value].l;
      lengthOut.textContent = LENS[+length.value].l;
      tagVoice.textContent = 'Голос: ' + voiceLabel(voiceSel.value);
      tagLen.textContent = LENS[+length.value].s;
      tagTempo.textContent = 'Темп: ' + TEMPOS[+tempo.value].l.toLowerCase();
      var text = studioDisplayText(p.id, lenN);
      scriptEl.textContent = text || p.script;
    }

    PERSONAS.forEach(function (p, i) {
      var b = document.createElement('button');
      b.className = 'chip' + (i === 0 ? ' on' : ''); b.textContent = p.name; b.dataset.i = i;
      b.addEventListener('click', function () {
        $$('.chip', ampluaChips).forEach(function (c) { c.classList.remove('on'); });
        b.classList.add('on'); state.persona = PERSONAS[i];
        syncVoiceSelect();
        render();
      });
      ampluaChips.appendChild(b);
    });
    VOICES.forEach(function (v) { var o = document.createElement('option'); o.value = v.id; o.textContent = v.label; voiceSel.appendChild(o); });
    syncVoiceSelect();

    [tempo, length].forEach(function (r) { r.addEventListener('input', render); });
    voiceSel.addEventListener('change', render);

    playBtn.addEventListener('click', function () {
      if (eq) eq.classList.remove('paused');
      var p = state.persona;
      var lenN = LENS[+length.value].n;
      var voice = voiceSel.value;
      var primary = demoStudioSrc(p.id, voice, lenN);
      var fallbacks = [primary];
      if (lenN >= 2) fallbacks.push(demoStudioSrc(p.id, voice, lenN === 4 ? 2 : 1));
      else fallbacks.push(demoStudioSrc(p.id, voice, 2), p.audio);
      playStudioDemo(fallbacks, TEMPOS[+tempo.value].r, playBtn);
    });

    fetch('assets/demos/preview-texts.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        (data.personas || []).forEach(function (p) {
          demoCopy.short[p.id] = prettyDisplay(p.display || p.speakable);
        });
        (data.studioLong || []).forEach(function (s) {
          demoCopy.minute[s.persona] = prettyDisplay((s.len2 && (s.len2.display || s.len2.speakable)) || '');
          demoCopy.full[s.persona] = prettyDisplay((s.len4 && (s.len4.display || s.len4.speakable)) || '');
        });
        render();
      })
      .catch(function () { render(); });
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

  /* ---------------- Download links (BFF → GitHub API → mobile-latest) ---------------- */
  (function () {
    var apkEls = ['#dlApk', '#successApk', '#heroApk'].map(function (id) { return $(id); }).filter(Boolean);
    var extEls = ['#dlExt', '#successExt', '#heroExt'].map(function (id) { return $(id); }).filter(Boolean);
    var apkVer = $('#apkVersion');
    var extVer = $('#extVersion');

    function pickAssets(rel) {
      var assets = rel.assets || [];
      var apk = assets.filter(function (a) { return /\.apk$/i.test(a.name); })[0];
      var ext = assets.filter(function (a) { return /\.(zip|crx)$/i.test(a.name); })[0];
      return {
        apkUrl: apk ? apk.browser_download_url : null,
        extensionUrl: ext ? ext.browser_download_url : null,
        tag: rel.tag_name || null,
      };
    }

    function applyLinks(links) {
      var tagLabel = links.tag ? ('версия ' + links.tag) : 'последняя сборка';
      var cacheBust = links.publishedAt ? ('?t=' + encodeURIComponent(links.publishedAt)) : '';
      var apkUrl = (links.apkUrl || APK_FALLBACK) + cacheBust;
      var extUrl = (links.extensionUrl || EXT_FALLBACK) + cacheBust;
      apkEls.forEach(function (e) {
        e.href = apkUrl;
        e.setAttribute('download', 'efir-ai.apk');
        e.removeAttribute('target');
      });
      extEls.forEach(function (e) {
        e.href = extUrl;
        e.setAttribute('download', 'efir-extension.zip');
        e.removeAttribute('target');
      });
      if (apkVer) apkVer.textContent = links.apkUrl ? tagLabel : tagLabel + ' (ожидает сборку)';
      if (extVer) extVer.textContent = links.extensionUrl ? tagLabel : tagLabel + ' (ожидает сборку)';
    }

    function fetchGhMobileLatest() {
      return fetch('https://api.github.com/repos/' + GH_REPO + '/releases/tags/' + encodeURIComponent(MOBILE_TAG), {
        headers: { Accept: 'application/vnd.github+json' },
      }).then(function (r) {
        if (!r.ok) throw new Error('no mobile-latest');
        return r.json();
      }).then(pickAssets);
    }

    function fetchGhLatest() {
      return fetch('https://api.github.com/repos/' + GH_REPO + '/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' },
      }).then(function (r) {
        if (!r.ok) throw new Error('no latest');
        return r.json();
      }).then(pickAssets);
    }

    function fetchGhList() {
      return fetch('https://api.github.com/repos/' + GH_REPO + '/releases?per_page=15', {
        headers: { Accept: 'application/vnd.github+json' },
      }).then(function (r) {
        if (!r.ok) throw new Error('no list');
        return r.json();
      }).then(function (list) {
        for (var i = 0; i < list.length; i += 1) {
          var picked = pickAssets(list[i]);
          if (picked.apkUrl || picked.extensionUrl) return picked;
        }
        throw new Error('no assets');
      });
    }

    function fetchBffDownloads() {
      var base = API_BASE;
      if (!base) return Promise.reject(new Error('no api base'));
      return fetch(base + '/v1/public/downloads', { headers: { Accept: 'application/json' } })
        .then(function (r) {
          if (!r.ok) throw new Error('bff ' + r.status);
          return r.json();
        })
        .then(function (d) {
          if (!d.apkUrl && !d.extensionUrl) throw new Error('empty bff');
          return {
            apkUrl: d.apkUrl,
            extensionUrl: d.extensionUrl,
            tag: d.tag,
          };
        });
    }

    fetchBffDownloads()
      .catch(function () { return fetchGhMobileLatest(); })
      .catch(function () { return fetchGhLatest(); })
      .catch(function () { return fetchGhList(); })
      .then(applyLinks)
      .catch(function () {
        applyLinks({ apkUrl: null, extensionUrl: null, tag: null });
      });
  })();

})();
