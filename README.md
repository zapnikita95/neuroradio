# Music Story

«Нейрорадио» для стриминговых плееров: определяет текущий трек, запрашивает короткую (~30 сек) русскую справку у бэкенда и озвучивает её.

**Платформы:** Android (Kotlin) · iOS (SwiftUI, iOS 17+) · **Windows Desktop** (Tauri виджет)

## Быстрый старт

### Готовый APK

Собранный debug-APK лежит в корне проекта:

```
MusicStory.apk
```

Установка на устройство:

```bash
adb install -r MusicStory.apk
```

### Сборка из исходников

```bash
cd android
./gradlew assembleDebug
```

APK автоматически копируется в корень: **`MusicStory.apk`**

**Требования:** JDK 17, Android SDK (API 35), Gradle wrapper в `android/`.

### iOS (SwiftUI)

Сборка **только на macOS** (Xcode). Проект уже в репозитории — XcodeGen не нужен.

```bash
git clone https://github.com/zapnikita95/music-story.git
cd music-story/ios
open MusicStory.xcodeproj
```

В Xcode: **Signing & Capabilities** → Team → **Run** (⌘R).

Подробная инструкция: [ios/README.md](ios/README.md) · [PLAN-06](docs/PLAN-06-ios.md)

### Windows Desktop (виджет)

Круглый always-on-top виджет: Spotify / Яндекс / браузер через Windows SMTC.

```bash
cd desktop
npm install
npm run tauri build
```

Exe: `desktop/src-tauri/target/release/music-story-desktop.exe`

Подробнее: [desktop/README.md](desktop/README.md)

| iOS | Android |
|-----|---------|
| Spotify App Remote + Apple Music (авто) | MediaSession (авто) |
| ShazamKit / ручной ввод (Яндекс и др.) | NotificationListener |
| Локальное уведомление + виджет | Persistent notification |

### Бэкенд (BFF)

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Сервер: `http://localhost:3000`. Без API-ключей работает demo-режим (готовый текст + локальный TTS на телефоне).

## Возможности

| Компонент | Описание |
|-----------|----------|
| **Media detection** | Spotify, Яндекс Музыка, YT Music, Apple Music через NotificationListener + MediaSession |
| **StoryOrchestrator** | Автоперехват (pause → история → resume) и ручной режим |
| **TriggerEngine** | Каждые N треков, whitelist артистов/жанров/треков, always/never |
| **Scrobbling** | Локальная история прослушиваний (Room), кэш историй offline |
| **UI** | Compose: онбординг, главная, настройки, история, плеер справки |
| **Backend BFF** | MusicBrainz, GROQ LLM, Yandex SpeechKit TTS |

## Структура

```
Music story/
├── android/              # Kotlin + Jetpack Compose
├── desktop/              # Tauri 2 + React (Windows виджет)
├── ios/                  # SwiftUI (iOS 17+)
├── backend/              # Node.js Express BFF
├── docs/                 # Подробная документация и планы подсистем
├── .env.example          # Шаблон секретов бэкенда
└── MusicStory.apk        # Собранный APK (копируется сюда автоматически)
```

## Настройка на устройстве

1. Установите APK и откройте приложение.
2. Выдайте **доступ к уведомлениям** (онбординг → Настройки Android).
3. В **Настройки → URL бэкенда** укажите адрес сервера:
   - Эмулятор: `http://10.0.2.2:3000`
   - Реальное устройство: `http://<IP_ПК>:3000`
4. Запустите Spotify или Яндекс Музыку — на главном экране появятся артист и название.

## Документация

- [Полная инструкция по запуску и тестированию](docs/README.md)
- [PLAN-01: Media detection](docs/PLAN-01-media-detection.md)
- [PLAN-02: Backend API](docs/PLAN-02-backend-api.md)
- [PLAN-03: AI prompts](docs/PLAN-03-ai-prompts.md)
- [PLAN-04: Triggers & scrobbling](docs/PLAN-04-triggers-scrobbling.md)
- [PLAN-05: Testing & release](docs/PLAN-05-testing-release.md)
- [PLAN-06: iOS](docs/PLAN-06-ios.md)
- [Backend README](backend/README.md)

## GitHub и Railway

- **Репозиторий:** https://github.com/zapnikita95/music-story
- **Деплой бэкенда:** Railway → GitHub repo `music-story` → сборка через корневой **`Dockerfile`** (Root Directory = пусто)
- **Секреты:** только в Railway Variables и локальном `backend/.env` — **не коммитить** (см. `.gitignore`)

Подробно: [backend/RAILWAY.md](backend/RAILWAY.md)

## Секреты (опционально)

**Файл `backend/.env` в git не попадает.** В репозитории только шаблоны `.env.example`.

Для локального сервера или Railway Variables:

| Переменная | Назначение |
|------------|------------|
| `GROQ_API_KEY` | Генерация текста (Groq) + автоматический JWT для APK |
| `AUTH_JWT_SECRET` | *(опционально)* свой JWT-секрет; иначе выводится из `GROQ_API_KEY` |
| `ALLOWED_CERT_SHA256` | *(опционально)* release fingerprint для Play Store |
| `ALLOWED_IOS_TEAM_ID` | *(опционально)* Apple Team ID для iOS-приложения |
| `DESKTOP_AUTH_SECRET` | *(опционально)* секрет для desktop-клиента (`client_type: desktop`) |
| `ALLOW_DESKTOP_AUTH` | *(dev)* `true` — desktop-токены без секрета |
| `YANDEX_API_KEY` | Yandex SpeechKit |
| `YANDEX_FOLDER_ID` | Каталог Yandex Cloud |

## Лицензия

MVP / внутреннее использование. Play Store prep — см. `docs/PLAN-05-testing-release.md`.
