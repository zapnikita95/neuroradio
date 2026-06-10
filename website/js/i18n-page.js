/* Efir AI — full page copy for RU/EN (loaded before i18n.js) */
(function (global) {
  'use strict';

  global.EfirPageCopy = {
    ru: {
      service: {
        features: [
          {
            title: 'Всё в реальном времени',
            desc:
              'Эфир ничего не достаёт из заготовок: факт ищется, ранжируется и превращается в историю в тот самый момент, когда играет трек. Поэтому каждый выпуск получается своим — даже для одной и той же песни.',
          },
          { title: 'Амплуа на выбор', desc: 'Пять характеров ведущих — от заводного эфира до ночного подкаста.' },
          { title: 'Только проверенные факты', desc: 'Источники ранжируются по «интересности», выдумки отсекаются фильтрами качества.' },
          { title: 'Бесшовно с музыкой', desc: 'Плавно ставим трек на паузу, рассказываем историю и возвращаем воспроизведение.' },
          { title: 'Тонкая настройка', desc: 'Голос, темп, длина истории и частота — всё под вас, ползунками.' },
        ],
      },
      how: {
        steps: [
          { title: 'Слышим трек', desc: 'Приложение видит, что играет прямо сейчас — артиста и название.' },
          { title: 'Ищем в 10+ источниках', desc: 'Wikipedia, MusicBrainz, Wikidata и другие базы — собираем десятки фактов о треке и артисте.' },
          { title: 'Ранжируем по «интересности»', desc: 'Выше поднимаются конфликты, прорывы, курьёзы и рекорды, а сухой энциклопедический шум уходит вниз.' },
          { title: 'Предобрабатываем', desc: 'Чистим, проверяем на достоверность, отсеиваем повторы и выдумки.' },
          { title: 'Накладываем амплуа', desc: 'Один факт — голосом выбранного характера: ритм, лексика, точка зрения.' },
          { title: 'Озвучиваем и ставим на паузу', desc: 'В реальном времени переводим в речь, плавно приглушаем трек и рассказываем историю.' },
        ],
        note:
          'Важно: мы не используем заранее записанные ролики. Факт собирается и превращается в историю прямо во время прослушивания, поэтому эфир всегда живой и не повторяется.',
      },
      models: {
        sub: 'Прозрачно о том, как устроен сервис: какие модели готовят текст и голос, и откуда берутся факты.',
        cards: [
          {
            title: 'Поиск фактов',
            desc: 'Wikipedia, MusicBrainz, Wikidata, DuckDuckGo и веб-сниппеты. Из десятков кандидатов выбирается один проверяемый факт-семя.',
            bullets: ['10+ источников', 'оценка «интересности»', 'защита от выдумок'],
          },
          {
            title: 'Генерация текста',
            desc: 'Большие языковые модели собирают короткий сценарий радиовставки в стиле выбранного амплуа.',
            bullets: ['Gemma — стабильно на базовом', 'DeepSeek V3 — на расширенном', 'авто-переключение моделей'],
          },
          {
            title: 'Синтез речи',
            desc: 'Текст превращается в живую речь и отдаётся в приложение как готовое аудио.',
            bullets: ['Yandex SpeechKit', '13 голосов, регулировка темпа', 'DeepSeek V3 для историй'],
          },
          {
            title: 'Приватность',
            desc: 'Слушаем только метаданные трека (артист и название). Истории и настройки можно синхронизировать между устройствами.',
            bullets: ['без записи звука с микрофона', 'аудио по подписанным ссылкам', 'данные — по вашему email'],
          },
        ],
      },
      pricing: {
        basicLead: 'Чтобы вы спокойно попробовали Эфир AI и поняли, нравится ли вам формат. Ничего платить не нужно.',
        basicFeatures: [
          'До 10 историй в день',
          'Все 5 амплуа ведущих',
          'Поиск фактов в 10+ источниках',
          'Озвучка голосами Yandex SpeechKit',
          'Ручной и автоматический запуск',
        ],
        extendedLead:
          'Для тех, кто слушает каждый день и хочет максимум качества: более умная модель историй, профессиональный голос и больше эфира.',
        extendedFeatures: [
          'Всё из базового',
          'До 25 историй в день',
          'Истории на модели DeepSeek V3 — глубже и точнее',
          'Yandex SpeechKit — расширенный набор голосов',
          'Тонкая настройка темпа и длины',
          'Офлайн-эфир: пакет из 10 историй без интернета',
          'Синхронизация между устройствами',
        ],
        planFeatures: [
          ['Полный расширенный доступ', '25 историй в день', 'Премиум-голос', 'Офлайн-эфир (10 треков)'],
          [
            'Полный расширенный доступ',
            '25 историй в день',
            'Премиум-голос Yandex SpeechKit',
            'Офлайн-эфир (10 треков)',
            'Приоритетная поддержка',
          ],
          ['Полный расширенный доступ', '25 историй в день', 'Премиум-голос'],
        ],
        fine: 'Оплата привязывается к вашему email — по нему подписка распознаётся в приложении. Используйте тот же адрес при входе.',
        extendedFrom: 'от 167 ₽/мес',
      },
      docs: {
        kicker: 'Документы',
        title: 'Всё прозрачно',
        sub: 'Правовые документы сервиса Эфир AI. Перед оплатой рекомендуем ознакомиться.',
        items: [
          { title: 'Публичная оферта', desc: 'Условия использования и оказания услуг.', link: 'Открыть →' },
          { title: 'Политика конфиденциальности', desc: 'Как мы обрабатываем и храним данные.', link: 'Открыть →' },
          { title: 'Пользовательское соглашение', desc: 'Права и обязанности сторон.', link: 'Открыть →' },
          { title: 'Согласие на обработку ПДн', desc: 'Обработка персональных данных при оплате.', link: 'Открыть →' },
          { title: 'Удаление аккаунта', desc: 'Как запросить удаление учётной записи и данных.', link: 'Открыть →' },
        ],
      },
      faq: [
        {
          q: 'Что такое Эфир AI?',
          a: 'Это нейросетевой радиоведущий для Android и браузера. Пока играет музыка, сервис находит интересный факт о треке или артисте и озвучивает его живым голосом выбранного амплуа между песнями.',
        },
        {
          q: 'Это записанные заранее истории?',
          a: 'Нет, факт ищется, а история генерируется в реальном времени, пока играет трек, поэтому даже для одной песни эфир каждый раз получается новым.',
        },
        {
          q: 'На каких платформах работает Эфир AI?',
          a: 'На Android (приложение, APK для версии 8.0 и новее) и в браузере (расширение для Chrome и Яндекс Браузера). Подписка единая по email и синхронизируется между устройствами.',
        },
        {
          q: 'С какими плеерами работает?',
          a: 'Spotify, Яндекс Музыка, YouTube Music, Apple Music и другие приложения и веб-плееры, которые отдают метаданные текущего трека.',
        },
        { q: 'Эфир AI слушает мой микрофон?', a: 'Нет. Используются только метаданные текущего трека — артист и название. Запись звука не ведётся.' },
        {
          q: 'Можно ли пользоваться бесплатно?',
          a: 'Да. Базовый тариф бесплатный: до 10 историй в день, все 5 амплуа, поиск фактов в 10+ источниках. Текст генерирует модель Gemma, озвучка — Yandex SpeechKit. Расширенный тариф добавляет DeepSeek V3, премиум-голоса, до 25 историй в день и офлайн-эфир.',
        },
        {
          q: 'Работает ли офлайн?',
          a: 'Новые истории требуют интернет. На расширенном тарифе нажмите «Подготовить офлайн-эфир» в настройках: перемотайте или включите shuffle — соберите 10 разных треков. Приложение подготовит истории в фоне и пришлёт уведомление, когда пакет готов к прослушиванию без сети.',
        },
        {
          q: 'Сколько стоит подписка?',
          a: 'Базовый доступ бесплатный. Расширенная подписка стоит 199 ₽ в месяц, 499 ₽ за квартал или 1999 ₽ за год — годовой вариант выгоднее всего, около 167 ₽ в месяц.',
        },
        {
          q: 'Как работает подписка по email?',
          a: 'При оплате вы указываете email. По нему подписка распознаётся в приложении — войдите с тем же адресом, и расширенный доступ активируется.',
        },
        {
          q: 'Можно ли подключить свои API-ключи?',
          a: 'Да. В настройках приложения вы можете указать собственные ключи для языковых моделей и синтеза речи — тогда запросы пойдут через ваш аккаунт провайдера. Поддерживаются Groq, Google Gemini, OpenRouter и Yandex SpeechKit.',
        },
        {
          q: 'Работает ли с Яндекс Музыкой?',
          a: 'Да — на Android через приложение и в браузере через расширение на music.yandex.ru. Также Spotify, YouTube Music и другие плееры. <a href="docs/yandex-music.html">Подробный гид →</a>',
        },
        {
          q: 'Что такое нейро-радио?',
          a: 'Это персональное радио поверх вашего плейлиста: AI-ведущий находит факт о текущем треке и озвучивает историю между песнями. <a href="docs/neuro-radio.html">Узнать больше →</a>',
        },
        {
          q: 'Можно отменить подписку?',
          a: 'Да, в любой момент. В <a href="account/">личном кабинете на сайте</a> или в приложении (Аккаунт → Оплата) нажмите «Отвязать карту» — автопродление отключится, доступ сохранится до конца оплаченного периода.',
        },
      ],
      footer: {
        tagline: 'Нейро-радиоведущий для вашей музыки',
        service: 'Сервис',
        serviceLinks: ['О сервисе', 'Амплуа', 'Как работает', 'Студия'],
        plans: 'Тарифы',
        plansLinks: ['Подписка', 'Личный кабинет', 'Модели', 'FAQ'],
        guides: 'Гиды',
        guidesLinks: ['Нейро-радио', 'Яндекс Музыка', 'Android APK', 'Расширение'],
        legal: 'Документы',
        legalLinks: ['Оферта', 'Конфиденциальность', 'Соглашение', 'Удаление аккаунта'],
      },
      modal: {
        kicker: 'Оформление подписки',
        titlePrefix: 'Расширенный · ',
        features: [
          'Полный расширенный доступ',
          'До 25 историй в день',
          'Yandex SpeechKit',
          'DeepSeek V3 для историй',
          'Синхронизация между устройствами',
        ],
        emailLabel: 'Ваш email',
        emailErr: 'Введите корректный email',
        note: 'По этому адресу подписка распознаётся в приложении — войдите с тем же email.',
        agree:
          'Я принимаю <a href="docs/oferta.html" target="_blank">оферту</a> и <a href="docs/privacy.html" target="_blank">политику конфиденциальности</a>, и согласен с <a href="docs/consent.html" target="_blank">обработкой персональных данных</a>.',
        pay: 'Оплатить',
        close: 'Закрыть',
      },
    },
    en: {
      service: {
        features: [
          {
            title: 'All in real time',
            desc:
              'Nothing is pulled from a script library: the fact is found, ranked, and turned into a story while the track plays. Every broadcast feels fresh — even for the same song.',
          },
          { title: 'Pick your host', desc: 'Five personas — from high-energy daytime radio to a late-night whisper.' },
          { title: 'Verified facts only', desc: 'Sources are ranked for interest; fabrications are filtered out.' },
          { title: 'Seamless with music', desc: 'We pause the track smoothly, tell the story, then hand playback back.' },
          { title: 'Fine-tuned control', desc: 'Voice, tempo, story length, and frequency — all yours, with sliders.' },
        ],
      },
      how: {
        steps: [
          { title: 'Hear the track', desc: 'The app sees what is playing right now — artist and title.' },
          { title: 'Search 10+ sources', desc: 'Wikipedia, MusicBrainz, Wikidata, and more — dozens of facts about the track and artist.' },
          { title: 'Rank by interest', desc: 'Conflicts, breakthroughs, curiosities, and records rise; dry encyclopedic noise sinks.' },
          { title: 'Pre-process', desc: 'Clean up, verify accuracy, drop repeats and fabrications.' },
          { title: 'Apply the persona', desc: 'One fact — in the voice of the character you chose: rhythm, vocabulary, point of view.' },
          { title: 'Voice and pause', desc: 'Synthesize speech in real time, duck the track, and tell the story.' },
        ],
        note:
          'Important: we do not use pre-recorded clips. The fact is assembled and turned into a story while you listen, so the broadcast stays live and never repeats.',
      },
      models: {
        sub: 'Transparent look at how the service works: which models write the script and voice it, and where facts come from.',
        cards: [
          {
            title: 'Fact search',
            desc: 'Wikipedia, MusicBrainz, Wikidata, DuckDuckGo, and web snippets. One verifiable seed fact from dozens of candidates.',
            bullets: ['10+ sources', 'interest scoring', 'anti-hallucination filters'],
          },
          {
            title: 'Text generation',
            desc: 'Large language models craft a short radio insert in the style of your chosen persona.',
            bullets: ['Gemma — stable on Basic', 'DeepSeek V3 — on Extended', 'automatic model fallback'],
          },
          {
            title: 'Speech synthesis',
            desc: 'Text becomes live speech and is delivered to the app as ready audio.',
            bullets: ['Yandex SpeechKit (RU)', 'ElevenLabs premium (EN)', 'tempo control'],
          },
          {
            title: 'Privacy',
            desc: 'We only read track metadata (artist and title). Stories and settings can sync across devices.',
            bullets: ['no microphone recording', 'audio via signed URLs', 'data tied to your email'],
          },
        ],
      },
      pricing: {
        basicLead: 'Try Efir AI at your own pace and see if the format fits. No payment required.',
        basicFeatures: [
          'Up to 10 stories per day',
          'All 5 host personas',
          'Fact search across 10+ sources',
          'Yandex SpeechKit voices (RU)',
          'Manual and automatic triggers',
        ],
        extendedLead:
          'For daily listeners who want maximum quality: smarter story models, premium voices, and more airtime.',
        extendedFeatures: [
          'Everything in Basic',
          'Up to 25 stories per day',
          'DeepSeek V3 stories — deeper and sharper',
          'ElevenLabs premium voices (EN)',
          'Fine-tune tempo and length',
          'Offline pack: 10 saved stories without internet',
          'Sync across devices',
        ],
        planFeatures: [
          ['Full extended access', '25 stories per day', 'Premium voice', 'Offline pack (10 tracks)'],
          [
            'Full extended access',
            '25 stories per day',
            'ElevenLabs premium voice',
            'Offline pack (10 tracks)',
            'Priority support',
          ],
          ['Full extended access', '25 stories per day', 'Premium voice'],
        ],
        fine: 'Payment is tied to your email — the app recognizes your subscription by it. Sign in with the same address.',
        extendedFrom: 'from $3.33/mo',
      },
      docs: {
        kicker: 'Legal',
        title: 'Everything in the open',
        sub: 'Legal documents for Efir AI. We recommend reading them before payment.',
        items: [
          { title: 'Public offer', desc: 'Terms of use and service provision.', link: 'Open →' },
          { title: 'Privacy policy', desc: 'How we process and store data.', link: 'Open →' },
          { title: 'Terms of service', desc: 'Rights and obligations of both parties.', link: 'Open →' },
          { title: 'Personal data consent', desc: 'Processing personal data during payment.', link: 'Open →' },
          { title: 'Account deletion', desc: 'How to request deletion of your account and data.', link: 'Open →' },
        ],
      },
      faq: [
        {
          q: 'What is Efir AI?',
          a: 'An AI radio host for Android and the browser. While music plays, the service finds an interesting fact about the track or artist and voices it in your chosen persona between songs.',
        },
        {
          q: 'Are these pre-recorded stories?',
          a: 'No. The fact is found and the story is generated in real time while the track plays, so even the same song sounds different each time.',
        },
        {
          q: 'Which platforms are supported?',
          a: 'Android (APK, 8.0+) and the browser (Chrome and Yandex Browser extension). One email subscription syncs across devices.',
        },
        {
          q: 'Which players work?',
          a: 'Spotify, Yandex Music, YouTube Music, Apple Music, and other apps or web players that expose now-playing metadata.',
        },
        { q: 'Does Efir AI listen to my microphone?', a: 'No. Only track metadata — artist and title. No audio recording.' },
        {
          q: 'Is there a free tier?',
          a: 'Yes. Basic is free: up to 10 stories per day, all 5 personas, 10+ fact sources. Extended adds DeepSeek V3, premium voices, 25 stories per day, and offline packs.',
        },
        {
          q: 'Does offline work?',
          a: 'New stories need internet. On Extended, tap “Prepare offline pack” in settings, queue 10 different tracks, and the app builds stories in the background — you get a notification when the pack is ready.',
        },
        {
          q: 'How much does subscription cost?',
          a: 'Basic is free. Extended is $3.99/month, $9.99/quarter, or $39.99/year — yearly is best value at about $3.33/month.',
        },
        {
          q: 'How does email subscription work?',
          a: 'You pay with your email. Sign into the app with the same address and extended access activates.',
        },
        {
          q: 'Can I use my own API keys?',
          a: 'Yes. In app settings you can add keys for LLM and TTS providers — requests then go through your account. Groq, Gemini, OpenRouter, Yandex SpeechKit supported.',
        },
        {
          q: 'Does it work with Yandex Music?',
          a: 'Yes — Android app and browser extension on music.yandex.ru. Also Spotify, YouTube Music, and more. <a href="docs/yandex-music.html">Full guide →</a>',
        },
        {
          q: 'What is neuro-radio?',
          a: 'Personal radio on top of your playlist: the AI host finds a fact about the current track and voices a story between songs. <a href="docs/neuro-radio.html">Learn more →</a>',
        },
        {
          q: 'Can I cancel subscription?',
          a: 'Anytime. In your <a href="account/">account on the site</a> or the app (Account → Billing) tap “Unlink card” — auto-renew stops; access lasts until the paid period ends.',
        },
      ],
      footer: {
        tagline: 'AI radio host for your music',
        service: 'Service',
        serviceLinks: ['About', 'Personas', 'How it works', 'Studio'],
        plans: 'Plans',
        plansLinks: ['Pricing', 'Account', 'Tech stack', 'FAQ'],
        guides: 'Guides',
        guidesLinks: ['Neuro-radio', 'Yandex Music', 'Android APK', 'Extension'],
        legal: 'Legal',
        legalLinks: ['Offer', 'Privacy', 'Terms', 'Delete account'],
      },
      modal: {
        kicker: 'Subscribe',
        titlePrefix: 'Extended · ',
        features: [
          'Full extended access',
          'Up to 25 stories per day',
          'ElevenLabs premium (EN)',
          'DeepSeek V3 stories',
          'Sync across devices',
        ],
        emailLabel: 'Your email',
        emailErr: 'Enter a valid email',
        note: 'The app recognizes your subscription by this email — sign in with the same address.',
        agree:
          'I accept the <a href="docs/oferta.html" target="_blank">offer</a>, <a href="docs/privacy.html" target="_blank">privacy policy</a>, and <a href="docs/consent.html" target="_blank">personal data processing</a>.',
        pay: 'Pay now',
        close: 'Close',
      },
    },
  };
})(window);
