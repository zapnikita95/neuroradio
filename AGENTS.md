# Music Story — заметки для агентов (читать перед правками)

## Что это за проект

Android-приложение (и desktop/iOS в репо) слушает **сейчас играющий трек** (Яндекс Музыка и др. через MediaSession), генерирует **короткую русскую историю** про трек и **озвучивает** её голосом Yandex.

Пользователь в РФ: **Groq/Gemini с телефона часто недоступны** → основной путь через **BFF на Railway** (EU/US).

---

## Озвучка (КРИТИЧНО — не менять без явного запроса)

| Шаг | Где | Как |
|-----|-----|-----|
| 1 | **Railway BFF** `backend/` | После генерации текста: **Yandex Cloud TTS** (`yandex-tts.ts`) → файл `.ogg` в `backend/audio/` |
| 2 | BFF | Подписанный URL: `signAudioAccess()` → `GET /audio/{file}.ogg?exp=&sig=` |
| 3 | **Android** `StoryPlayer.kt` | **Только ExoPlayer** по полному URL с сервера |
| 4 | Android | **НЕТ** `android.speech.tts.TextToSpeech`, **НЕТ** «системного движка», **НЕТ** fallback на телефон |

Если `audioUrl` пустой — это **ошибка конфигурации/бэкенда**, а не повод включать TTS на устройстве.

Переменные Railway для озвучки: `YANDEX_API_KEY`, `YANDEX_FOLDER_ID`.

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

---

## Репозиторий

| Путь | Назначение |
|------|------------|
| `android/` | APK, Kotlin, Compose UI |
| `backend/` | Node/Express BFF, деплой Railway (Dockerfile в корне или `backend/Dockerfile`) |
| `desktop/` | Tauri + веб (опционально) |
| `ios/` | Swift (опционально) |
| `MusicStory.apk` | Debug APK в **корне** после `assembleDebug` |
| `railway.toml` | Root Directory **пустой** → корневой Dockerfile |
| `backend/RAILWAY.md` | Деплой, переменные, volume для `ACCOUNT_DATA_DIR` |

---

## BFF API (основное)

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/health` | Healthcheck Railway |
| POST | `/v1/auth/token` | JWT для APK (cert SHA256) |
| POST | `/v1/story/full` | Метаданные + LLM + **Yandex TTS** + `audioUrl` |
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

## Что агенту НЕ делать

- Не добавлять Android `TextToSpeech` / «проверь синтез речи в настройках» для основного сценария.
- Не менять цепочку озвучки на «локальный TTS» без явного запроса пользователя.
- Не ломать `POST /v1/story/full` как единственный источник `audioUrl` для production.
- Не коммитить `.env`, ключи API.
- APK пользователю указывать как **`MusicStory.apk`** в корне репозитория.

---

## Сборка и деплой

```bash
# APK
cd android && ./gradlew assembleDebug   # → ../MusicStory.apk

# Backend локально
cd backend && npm ci && npm run build && node dist/index.js

# Production: push в `main` → Railway GitHub deploy; start: `node dist/index.js`
```
