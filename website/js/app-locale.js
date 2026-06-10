/* Efir AI — bilingual app data (personas, voices, studio, pricing) */
(function (global) {
  'use strict';

  var FACT_REGISTRY_RU =
    'Thriller — единственный музыкальный клип в National Film Registry США: его сохраняют как культурное наследие наравне с художественным кино.';
  var FACT_REGISTRY_EN =
    'Thriller is the only music video in the US National Film Registry — preserved as cultural heritage alongside feature films.';
  var THRILLER_CORE_RU =
    'Майкл Джексон записал Thriller в эпоху, когда клипы только меняли правила игры. Это был не просто трэк — кинематограф на 14 минут. MTV крутил в основном рок, но Thriller ставили в эфир целиком, прерывая вещание. Джексон вложил полмиллиона из своего кармана — продажи альбома выросли в семь раз.';
  var THRILLER_CORE_EN =
    'Michael Jackson made Thriller when music videos were still rewriting the rules. It was not just a track — a fourteen-minute movie. MTV mostly played rock, but Thriller aired in full, interrupting regular programming. Jackson put half a million dollars of his own money in — album sales jumped sevenfold.';
  var BACKSTAGE_SHORT_RU =
    'Только между нами. Michael Jackson вложил в съёмки Thriller полмиллиона долларов из своего кармана — продюсеры крутили пальцем у виска, а после премьеры продажи альбома подскочили в семь раз. Vincent Price уложил закадровый монолог в один день — без его голоса клип был бы совсем другим. Об этом редко говорят вслух.';
  var BACKSTAGE_SHORT_EN =
    'Just between us. Michael Jackson poured half a million of his own money into the Thriller shoot — producers thought he was crazy, then album sales jumped sevenfold after the premiere. Vincent Price nailed the narration in a single day — without that voice the video would be a different beast. People rarely say this out loud.';

  var STUDIO_VOICES_RU = {
    radio_host: ['zahar', 'ermil', 'alexander'],
    night_dj: ['ermil'],
    expert: ['ermil', 'zahar', 'filipp'],
    contemporary: ['alena', 'omazh', 'marina'],
    fan: ['jane', 'dasha', 'lera'],
    backstage: ['omazh', 'jane'],
  };

  var STUDIO_VOICES_EN = {
    radio_host: ['rachel', 'adam', 'antoni'],
    night_dj: ['adam'],
    expert: ['josh', 'adam', 'antoni'],
    contemporary: ['bella', 'emily', 'matilda'],
    fan: ['elli', 'bella', 'rachel'],
    backstage: ['antoni', 'sam'],
  };

  var VOICES_RU = [
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
    { id: 'lera', label: 'Лера — лёгкий, женский' },
  ];

  var VOICES_EN = [
    { id: 'rachel', label: 'Rachel — calm, clear female' },
    { id: 'adam', label: 'Adam — deep, confident male' },
    { id: 'antoni', label: 'Antoni — warm, rounded male' },
    { id: 'bella', label: 'Bella — soft, gentle female' },
    { id: 'elli', label: 'Elli — young, upbeat female' },
    { id: 'josh', label: 'Josh — crisp narrative male' },
    { id: 'sam', label: 'Sam — raspy, characterful male' },
    { id: 'emily', label: 'Emily — calm, mature female' },
    { id: 'charlie', label: 'Charlie — casual conversational male' },
    { id: 'matilda', label: 'Matilda — expressive, warm female' },
  ];

  var PERSONAS_RU = [
    {
      id: 'radio_host', tag: 'Заводной эфир', name: 'Радиоведущий',
      desc: 'Тёплый эфирный тон: живо, но строго по факту. Драйв дневной радиостанции, который заряжает энергией между треками.',
      traits: ['энергично', 'тепло', 'по делу'],
      quote: '«Слушайте — Thriller взорвал MTV!»',
      voice: 'zahar', rate: 1.08,
      script: THRILLER_CORE_RU + ' Именно этот клип взорвал MTV — звук на максимум, поехали!',
      audio: 'assets/demos/persona-radio_host.wav',
    },
    {
      id: 'night_dj', tag: 'Ночной подкаст', name: 'Ночной диджей',
      desc: 'Тихий ночной эфир: факт чёткий, темп медленный, голос почти на ухо. Для поздних плейлистов и долгой дороги.',
      traits: ['спокойно', 'интимно', 'медленно'],
      quote: '«Доброй ночи! Интересный факт…»',
      voice: 'ermil', rate: 0.92,
      script: 'Доброй ночи! Интересный факт: ' + FACT_REGISTRY_RU + ' Оставайтесь на нашей волне до утра.',
      audio: 'assets/demos/persona-night_dj.wav',
    },
    {
      id: 'expert', tag: 'Эксперт жанра', name: 'Эксперт жанра',
      desc: 'Подкастовая экспертиза: механика жанра без занудства. Объясняет, почему трек устроен именно так и за счёт чего работает.',
      traits: ['разбор', 'контекст', 'точность'],
      quote: '«Уникальный факт:»',
      voice: 'ermil', rate: 1.0,
      script: 'Уникальный факт: ' + FACT_REGISTRY_RU + ' Это эталон поп-хоррора восьмидесятых.',
      audio: 'assets/demos/persona-expert.wav',
    },
    {
      id: 'contemporary', tag: 'Современник эпохи', name: 'Современник эпохи',
      desc: 'Ностальгия от первого лица — будто вы жили, когда трек вышел. Личная память вместо энциклопедии.',
      traits: ['ностальгия', 'от первого лица', 'тепло'],
      quote: '«Я помню это время…»',
      voice: 'alena', rate: 0.98,
      script: 'Я помню это время. Michael Jackson вложил полмиллиона в клип Thriller — и после премьеры продажи альбома выросли в семь раз. Мы смотрели четырнадцатиминутный ролик по MTV целиком, а потом скупали VHS, чтобы пересматривать дома.',
      audio: 'assets/demos/persona-contemporary.wav',
    },
    {
      id: 'fan', tag: 'Фанат-коллекционер', name: 'Фанат-коллекционер',
      desc: 'Восторженный фанат от первого лица: обожает артиста и знает детали, которые греют сердце коллекционера.',
      traits: ['восторг', 'детали', 'любовь к делу'],
      quote: '«Обожаю этот момент!»',
      voice: 'jane', rate: 1.12,
      script: 'Обожаю этот момент! ' + THRILLER_CORE_RU + ' И да — я знаю каждую секунду этого клипа наизусть!',
      audio: 'assets/demos/persona-fan.wav',
    },
    {
      id: 'backstage', tag: 'С закулисья', name: 'Инсайдер с закулисья',
      desc: 'Инсайдерский тон — только если в факте есть курьёз. Истории, о которых обычно говорят вполголоса.',
      traits: ['инсайд', 'курьёз', 'вполголоса'],
      quote: '«Только между нами…»',
      voice: 'omazh', rate: 0.96,
      script: BACKSTAGE_SHORT_RU,
      audio: 'assets/demos/persona-backstage.wav',
    },
  ];

  var PERSONAS_EN = [
    {
      id: 'radio_host', tag: 'High-energy host', name: 'Radio host',
      desc: 'Warm on-air tone — lively but factual. Daytime radio energy between your tracks.',
      traits: ['energetic', 'warm', 'on point'],
      quote: '"Listen — Thriller blew up MTV!"',
      voice: 'rachel', rate: 1.08,
      script: THRILLER_CORE_EN + ' This is the video that hijacked MTV — volume up, let us go!',
      audio: 'assets/demos/en/persona-radio_host.ogg',
    },
    {
      id: 'night_dj', tag: 'Late-night show', name: 'Night DJ',
      desc: 'Quiet night shift: clear fact, slow tempo, voice close to your ear. For late playlists and long drives.',
      traits: ['calm', 'intimate', 'slow'],
      quote: '"Good night! Here is a fact…"',
      voice: 'adam', rate: 0.92,
      script: 'Good night! Quick fact: ' + FACT_REGISTRY_EN + ' Stay on our frequency till morning.',
      audio: 'assets/demos/en/persona-night_dj.ogg',
    },
    {
      id: 'expert', tag: 'Genre expert', name: 'Genre expert',
      desc: 'Podcast expertise without lecturing. Explains why the track works and what makes the genre tick.',
      traits: ['breakdown', 'context', 'precision'],
      quote: '"Unique fact:"',
      voice: 'josh', rate: 1.0,
      script: 'Unique fact: ' + FACT_REGISTRY_EN + ' A pop-horror benchmark of the eighties.',
      audio: 'assets/demos/en/persona-expert.ogg',
    },
    {
      id: 'contemporary', tag: 'Voice of the era', name: 'Contemporary',
      desc: 'First-person nostalgia — as if you lived when the track dropped. Memory over encyclopedia.',
      traits: ['nostalgia', 'first person', 'warm'],
      quote: '"I remember those years…"',
      voice: 'bella', rate: 0.98,
      script: 'I remember those years. Michael Jackson put half a million into the Thriller video — after the premiere album sales jumped sevenfold. We watched the fourteen-minute clip on MTV in full, then bought VHS tapes to replay it at home.',
      audio: 'assets/demos/en/persona-contemporary.ogg',
    },
    {
      id: 'fan', tag: 'Superfan', name: 'Superfan',
      desc: 'Enthusiastic collector energy from the first person — loves the artist and the tiny details.',
      traits: ['hype', 'details', 'devotion'],
      quote: '"I love this moment!"',
      voice: 'elli', rate: 1.12,
      script: 'I love this moment! ' + THRILLER_CORE_EN + ' And yes — I know every second of this video by heart!',
      audio: 'assets/demos/en/persona-fan.ogg',
    },
    {
      id: 'backstage', tag: 'Backstage insider', name: 'Backstage insider',
      desc: 'Insider tone when the fact has a twist. Stories people usually tell in a half-whisper.',
      traits: ['insider', 'gossip', 'hushed'],
      quote: '"Just between us…"',
      voice: 'antoni', rate: 0.96,
      script: BACKSTAGE_SHORT_EN,
      audio: 'assets/demos/en/persona-backstage.ogg',
    },
  ];

  var TEMPOS_RU = [
    { l: 'Очень медленно', r: 0.85 },
    { l: 'Медленно', r: 0.95 },
    { l: 'Нормально', r: 1.08 },
    { l: 'Быстро', r: 1.22 },
    { l: 'Очень быстро', r: 1.38 },
  ];
  var TEMPOS_EN = [
    { l: 'Very slow', r: 0.85 },
    { l: 'Slow', r: 0.95 },
    { l: 'Normal', r: 1.08 },
    { l: 'Fast', r: 1.22 },
    { l: 'Very fast', r: 1.38 },
  ];

  var LENS_RU = [
    { l: '30 секунд', s: '~30 с', n: 1 },
    { l: '1 минута', s: '~60 с', n: 2 },
    { l: 'Без лимита', s: '2+ мин', n: 4 },
  ];
  var LENS_EN = [
    { l: '30 seconds', s: '~30 s', n: 1 },
    { l: '1 minute', s: '~60 s', n: 2 },
    { l: 'Extended', s: '2+ min', n: 4 },
  ];

  function lang() {
    return global.EfirI18n && global.EfirI18n.getLang ? global.EfirI18n.getLang() : 'ru';
  }

  function isEn() {
    return lang() === 'en';
  }

  function getPersonas() {
    return isEn() ? PERSONAS_EN.slice() : PERSONAS_RU.slice();
  }

  function getVoices() {
    return isEn() ? VOICES_EN.slice() : VOICES_RU.slice();
  }

  function getStudioVoices() {
    return isEn() ? STUDIO_VOICES_EN : STUDIO_VOICES_RU;
  }

  function getTempos() {
    return isEn() ? TEMPOS_EN : TEMPOS_RU;
  }

  function getLengths() {
    return isEn() ? LENS_EN : LENS_RU;
  }

  function demoBase() {
    return isEn() ? 'assets/demos/en/' : 'assets/demos/';
  }

  function previewTextsUrl() {
    return isEn() ? 'assets/demos/en/preview-texts.json' : 'assets/demos/preview-texts.json';
  }

  function demoExt() {
    return isEn() ? '.ogg' : '.wav';
  }

  function studioSrc(personaId, voiceId, lenN) {
    var base = demoBase();
    var ext = demoExt();
    if (lenN === 4) return base + 'studio-' + personaId + '-len4' + ext;
    if (lenN === 2) return base + 'studio-' + personaId + '-len2' + ext;
    return base + 'studio-' + personaId + '-' + voiceId + ext;
  }

  function voiceLabel(id) {
    var list = getVoices();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i].label.split(' — ')[0].split(' - ')[0];
    }
    return id;
  }

  function heroHostLabel() {
    return isEn() ? 'Radio host' : 'Заводной радиоведущий';
  }

  function heroScript() {
    return isEn()
      ? '«Michael Jackson made Thriller when videos were rewriting the rules. Not just a track — a fourteen-minute movie. MTV mostly played rock, but Thriller aired in full. Jackson put half a million of his own money in — album sales jumped sevenfold…»'
      : '«Майкл Джексон записал Thriller в эпоху, когда клипы только меняли правила игры. Это был не просто трэк — кинематограф на 14 минут. MTV крутил в основном рок, но Thriller ставили в эфир целиком, прерывая вещание. Джексон вложил полмиллиона из своего кармана — продажи альбома выросли в семь раз…»';
  }

  global.EfirLocale = {
    getPersonas: getPersonas,
    getVoices: getVoices,
    getStudioVoices: getStudioVoices,
    getTempos: getTempos,
    getLengths: getLengths,
    demoBase: demoBase,
    demoExt: demoExt,
    studioSrc: studioSrc,
    voiceLabel: voiceLabel,
    heroHostLabel: heroHostLabel,
    heroScript: heroScript,
    previewTextsUrl: previewTextsUrl,
    isEn: isEn,
  };
})(typeof window !== 'undefined' ? window : globalThis);
