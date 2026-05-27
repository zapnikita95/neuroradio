# NeuroRadio

Персональный AI-радиоведущий для музыки, которая играет прямо сейчас.

NeuroRadio слушает текущий трек в Spotify, Яндекс Музыке, YouTube Music и других плеерах, находит контекст про песню и через несколько секунд рассказывает короткую историю голосом. Это ощущается как маленькая вставка на хорошем радио: кто записал трек, чем он интересен, почему за ним стоит больше, чем просто строчка в плейлисте.

Главная боль простая: в потоке даже любимая музыка часто становится плоской. Треки сменяют друг друга, а история, настроение эпохи, случайности записи и человеческие детали остаются где-то за кадром. NeuroRadio добавляет этому прослушиванию объёма, чтобы знакомые песни открывались глубже, а новые быстрее цепляли.

Основной сценарий сделан под Android. Приложение само видит трек, ставит музыку на паузу, проигрывает историю и возвращает воспроизведение. Бэкенд берёт на себя всё тяжёлое: факты, генерацию текста, озвучку и защищённую выдачу аудио.

## Что умеет

- Определяет текущий трек через Android MediaSession и уведомления музыкальных приложений.
- Работает со Spotify, Яндекс Музыкой, YouTube Music, Apple Music и другими плеерами, которые отдают метаданные системе.
- Генерирует короткие русские AI-истории про песню, артиста, релиз, эпоху или любопытный факт вокруг трека.
- Озвучивает текст на сервере через Yandex SpeechKit и отдаёт готовый OGG-файл в приложение.
- Умеет включаться автоматически через заданное число треков или запускаться вручную кнопкой.
- Хранит историю прослушиваний и уже созданные рассказы локально.
- Поддерживает Android-приложение, iOS-прототип и Windows desktop-виджет.

## Для кого

- Для тех, кто слушает музыку в дороге, на прогулке, на работе или дома и хочет чуть больше контекста без ручного поиска.
- Для фанатов Spotify, Яндекс Музыки, YouTube Music и Apple Music, которым интересны истории песен, артистов и альбомов.
- Для людей, которые любят формат радио, но хотят персональную подачу под свой плейлист.
- Для разработчиков, которым интересны Android MediaSession, музыкальные ассистенты, AI storytelling, text-to-speech и voice UX.

## Как это работает

1. На телефоне играет трек.
2. Android-приложение получает артиста и название из системной медиасессии.
3. Приложение отправляет запрос в BFF-бэкенд.
4. Бэкенд уточняет данные через MusicBrainz и дополнительные источники фактов.
5. LLM собирает короткий сценарий в стиле живой радиовставки.
6. Yandex SpeechKit превращает сценарий в аудио.
7. Приложение получает ссылку на файл, проигрывает историю через ExoPlayer и возвращает музыку.

```text
Music app -> Android app -> Backend -> facts + LLM + Yandex TTS -> audio story -> Android app
```

## Почему это цепляет

Обычный плейлист быстро превращается в фон. NeuroRadio добавляет к музыке контекст: внезапную деталь о записи, историю релиза, связь с эпохой, артистом или сценой. Песня остаётся главной, а вокруг неё появляется воздух, глубина и повод услышать её внимательнее.

Проект хорошо ложится на прогулки, поездки, домашние прослушивания, вечеринки и любые ситуации, где музыка уже играет, а доставать телефон и искать факты руками лень.

## Платформы

### Android

Основная платформа проекта: Kotlin, Jetpack Compose, Room, ExoPlayer, foreground service, NotificationListener и MediaSession.

Готовый debug APK после сборки лежит в корне репозитория:

```text
MusicStory.apk
```

Установка на устройство:

```bash
adb install -r MusicStory.apk
```

Сборка из исходников:

```bash
cd android
./gradlew assembleDebug
```

APK автоматически копируется в корень проекта как `MusicStory.apk`.

### Backend

Node.js/Express BFF для генерации историй, обогащения фактов и серверной озвучки.

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Локальный сервер поднимается на `http://localhost:3000`.

Для полного сценария нужны переменные:

- `GROQ_API_KEY` или другой настроенный LLM-провайдер для текста.
- `YANDEX_API_KEY` и `YANDEX_FOLDER_ID` для озвучки через Yandex SpeechKit.
- `AUTH_JWT_SECRET` при необходимости задать отдельный секрет для авторизации приложения.

### iOS

В репозитории есть SwiftUI-проект для iOS 17+:

```bash
git clone https://github.com/zapnikita95/music-story.git
cd music-story/ios
open MusicStory.xcodeproj
```

Дальше в Xcode нужно выбрать Team в Signing & Capabilities и запустить проект.

### Windows Desktop

Tauri-виджет для Windows: компактное окно поверх экрана, работа с системными медиаданными через Windows SMTC.

```bash
cd desktop
npm install
npm run tauri build
```

Собранный exe: `desktop/src-tauri/target/release/music-story-desktop.exe`.

## Структура проекта

```text
music-story/
├── android/       # Android-приложение
├── backend/       # Express BFF, факты, LLM, Yandex SpeechKit
├── desktop/       # Tauri + React виджет для Windows
├── ios/           # SwiftUI-проект
├── docs/          # Технические заметки и планы
└── MusicStory.apk # Debug APK после сборки Android
```

## Настройка на телефоне

1. Установите `MusicStory.apk`.
2. Откройте приложение и выдайте доступ к уведомлениям.
3. В настройках укажите URL бэкенда:
   - эмулятор: `http://10.0.2.2:3000`
   - реальное устройство: `http://<IP_ПК>:3000`
4. Запустите музыку в любимом плеере.
5. Нажмите «Рассказать историю» или дождитесь автоматического запуска.

## Технологии

- Android: Kotlin, Jetpack Compose, Room, ExoPlayer, MediaSession, NotificationListener.
- Backend: Node.js, Express, TypeScript, JWT, signed audio URLs.
- Источники данных: MusicBrainz, Wikipedia/fact providers, LLM-провайдеры.
- Озвучка: Yandex Cloud SpeechKit.
- Desktop: Tauri 2, React, TypeScript.
- iOS: SwiftUI, WidgetKit, Spotify App Remote, Apple Music.

## Ключевые слова

AI radio, NeuroRadio, нейрорадио, music discovery, music stories, song facts, AI music assistant, Android music app, Spotify companion, Яндекс Музыка, YouTube Music, Apple Music, MediaSession, NotificationListener, text to speech, Yandex SpeechKit, LLM, music storytelling, voice assistant, personalized radio.

## Документация

- [Инструкция по запуску и тестированию](docs/README.md)
- [Backend README](backend/README.md)
- [Railway deploy](backend/RAILWAY.md)
- [iOS README](ios/README.md)
- [Desktop README](desktop/README.md)

## Репозиторий и деплой

GitHub: `zapnikita95/music-story`

Бэкенд разворачивается на Railway из корневого `Dockerfile`. Секреты хранятся в Railway Variables или локальном `backend/.env`; в репозиторий попадают только шаблоны `.env.example`.

## Статус

Проект находится в активной разработке. Android-сценарий с серверной генерацией и озвучкой является основным фокусом.
