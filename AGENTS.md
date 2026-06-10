# Music Story — заметки для агентов (читать перед правками)

## Что это за проект

Android-приложение (и desktop/iOS в репо) слушает **сейчас играющий трек** (Яндекс Музыка и др. через MediaSession), генерирует **короткую историю** про трек (RU или EN по языку приложения) и **озвучивает** на сервере.

**Язык:** RU по умолчанию; EN если язык устройства не русский или выбран вручную в Настройках → Общие. EN — отдельный pipeline: факты, промпты, quality gates, TTS (не перевод с русского).

Пользователь в РФ: **Groq/Gemini с телефона часто недоступны** → основной путь через **BFF на Railway** (EU/US).

---

## Озвучка (КРИТИЧНО — не менять без явного запроса)

| Шаг | Где | Как |
|-----|-----|-----|
| 1 | **Railway BFF** `backend/` | После генерации текста: **TTS router** (`tts-router.ts`) → `.ogg` в `backend/audio/` |
| 1a | RU premium | **Yandex Cloud TTS** (`yandex-tts.ts`) |
| 1b | RU free/trial | **Edge TTS** |
| 1c | EN premium | **ElevenLabs** (`elevenlabs-tts.ts`, ~10 голосов в `elevenlabs-voices.ts`) |
| 1d | EN free/trial | **Edge TTS** en-US |
| 2 | BFF | Подписанный URL: `signAudioAccess()` → `GET /audio/{file}.ogg?exp=&sig=` |
| 3 | **Android** `StoryPlayer.kt` | **Только ExoPlayer** по полному URL с сервера |
| 4 | Android | **НЕТ** `android.speech.tts.TextToSpeech`, **НЕТ** «системного движка», **НЕТ** fallback на телефон |

Если `audioUrl` пустой — это **ошибка конфигурации/бэкенда**, а не повод включать TTS на устройстве.

Переменные Railway: `YANDEX_API_KEY`, `YANDEX_FOLDER_ID`; для EN premium — `ELEVENLABS_API_KEY`, `ELEVENLABS_ENABLED=true`, опционально `ELEVENLABS_MODEL_ID=eleven_flash_v2_5`.

**Цены USD (международные):** $3.99 / $9.99 / $39.99 — см. `SUBSCRIPTION_PLANS_USD` в `yookassa.ts`. RU: 199₽ / 499₽ / 1999₽.

---

## Поток «история под трек»

```
Телефон                          Railway BFF                         Внешние API
────────                         ───────────                         ───────────
MediaNotificationListener
  → StoryOrchestrator
  → StoryRepository.fetchStory()
       POST /v1/auth/token  ──►  JWT (секрет из GROQ_API_KEY)
       POST /v1/story/full  ──►  MusicBrainz + факты (Wiki/MB/DDG)
                                 Groq или Gemini → script
                                 Yandex TTS → .ogg
       ◄── script + audioUrl
  → resolveAudioUrl() → полный https://…/audio/….ogg?sig=…
  → StoryPlayer (ExoPlayer)
```

Локальный fallback (свой `GROQ_API_KEY` / `GEMINI_API_KEY` на телефоне) — **только текст**, без Yandex; для озвучки всё равно нужен успешный **backend** с `audioUrl`.

**Android `StoryRepository`:** при настроенном Railway URL **сначала всегда** `POST /v1/story/full` (Yandex), **не** прямой Groq с телефона, даже если в настройках сохранён Groq-ключ. Прямой ключ — только запасной вариант, если сервер не ответил.

---

## Репозиторий

| Путь | Назначение |
|------|------------|
| `android/` | APK, Kotlin, Compose UI |
| `backend/` | Node/Express BFF, деплой Railway (Dockerfile в корне или `backend/Dockerfile`) |
| `desktop/` | Tauri + веб (опционально) |
| `ios/` | Swift (опционально) |
| `efir-ai.apk` | Debug APK в **корне** после `assembleDebug` |
| `railway.toml` | Root Directory **пустой** → корневой Dockerfile |
| `backend/RAILWAY.md` | Деплой, переменные, volume для `ACCOUNT_DATA_DIR` |

---

## BFF API (основное)

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/health` | Healthcheck Railway |
| POST | `/v1/auth/token` | JWT для APK (cert SHA256) |
| POST | `/v1/story/full` | Метаданные + LLM + **Yandex TTS** + `audioUrl` |

**LLM на сервере:** `story-llm-router.ts` — сначала выбранный провайдер (`LLM_PROVIDER`), при 429/качестве — второй. Внутри Groq/Gemini автоматически перебираются **все модели** (`groq-models.ts`, `gemini-models.ts`). **Не** менять на один жёсткий model без fallback.
| GET | `/audio/*` | Раздача OGG (только signed URL) |
| GET/POST | `/v1/sync/*` | Синхронизация настроек/истории между устройствами (опционально для пользователя) |

---

## Android — ключевые классы

| Класс | Роль |
|-------|------|
| `StoryOrchestrator` | Авто/ручной триггер, пауза музыки, UI-состояние |
| `StoryRepository` | Кэш Room, вызов backend / direct Groq |
| `StoryPlayer` | **Только ExoPlayer + server audioUrl** |
| `ApiClient` | HTTP к Railway, JWT refresh |
| `BackendAuthManager` | Токен приложения |
| `ConnectionChecker` | Доступность backend |
| `SettingsDataStore` | URL Railway, голос, лимиты, ключи |
| `MediaMonitorService` | Фон, отслеживание трека |

---

## iOS — ключевые классы (зеркало Android)

| Класс | Роль |
|-------|------|
| `StoryOrchestrator` | Авто/ручной триггер, пауза музыки |
| `StoryRepository` | SwiftData-кэш, backend |
| `StoryPlayer` | AVPlayer + server/local OGG |
| `BackendClient` | HTTP, JWT |
| `SettingsStore` | URL, триггеры, offline pack phase |
| `NowPlayingCoordinator` | Spotify / Apple Music, смена трека |
| `OfflinePackStore` | Офлайн-эфир: сбор 10 треков + генерация |
| `NotificationService` | Push (факты, offline pack) |
| `AppStrings` | RU-строки — **синхрон с** `android/.../strings.xml` |

**Правило:** любая фича в `android/` → сразу правки в `ios/MusicStory/` + `project.pbxproj`. См. `.cursor/rules/ios-android-parity.mdc`.

---

## Что агенту НЕ делать

- Не добавлять Android `TextToSpeech` / «проверь синтез речи в настройках» для основного сценария.
- Не менять цепочку озвучки на «локальный TTS» без явного запроса пользователя.
- Не ломать `POST /v1/story/full` как единственный источник `audioUrl` для production.
- Не коммитить `.env`, ключи API.
- APK пользователю указывать как **`efir-ai.apk`** в корне репозитория.
- **Не** заканчивать фичу только Android — iOS-код в том же коммите (деплой iOS пользователь делает с Mac).

---

## Сборка и деплой

```bash
# APK
cd android && ./gradlew assembleDebug   # → ../efir-ai.apk

# Backend локально
cd backend && npm ci && npm run build && node dist/index.js

# Production: push в `main` → Railway GitHub deploy; start: `node dist/index.js`
```
