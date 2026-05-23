# PLAN-02 — Backend BFF API

## Цель

Скрыть API-ключи (GROQ, Yandex SpeechKit) на сервере, обогатить метаданные трека и вернуть готовую историю с аудио.

## Стек

- Node.js + TypeScript (`backend/`)
- Express REST API
- Порт по умолчанию: `3000`

## Endpoints

### `GET /health`

Проверка доступности сервера.

### `POST /v1/story/full`

Объединённый endpoint: enrich + generate + synthesize.

**Request:**
```json
{ "artist": "Кино", "title": "Группа крови" }
```

**Response (полный режим):**
```json
{
  "artist": "Кино",
  "title": "Группа крови",
  "year": 1988,
  "genre": "rock",
  "script": "...",
  "word_count": 62,
  "audioUrl": "/audio/uuid.ogg",
  "demo": false
}
```

**Response (demo-режим, без ключей):**
```json
{
  "artist": "Кино",
  "title": "Группа крови",
  "script": "...",
  "audioUrl": null,
  "demo": true,
  "ttsHint": "Используйте Android TTS"
}
```

## Android-клиент

| Файл | Назначение |
|------|------------|
| `StoryApi.kt` | Retrofit interface |
| `ApiClient.kt` | OkHttp, base URL из DataStore |
| `StoryRepository.kt` | Кэш Room + fallback |

### URL бэкенда

| Окружение | URL |
|-----------|-----|
| Emulator | `http://10.0.2.2:3000` |
| Real device | `http://192.168.x.x:3000` |

## Безопасность

- Ключи только в `.env` на сервере (см. `.env.example`)
- Никогда не в APK
- Rate limit: 30 req/min per device (TODO)
- App Check перед Play Store (TODO)

## Переменные окружения

| Переменная | Назначение |
|------------|------------|
| `GROQ_API_KEY` | Генерация текста |
| `YANDEX_API_KEY` | SpeechKit TTS |
| `YANDEX_FOLDER_ID` | Yandex Cloud folder |
| `PORT` | Порт сервера (3000) |

## Offline fallback (Android)

1. Room cache (24 ч)
2. `LocalStoryGenerator` — локальный русский текст
3. Android TextToSpeech (`audioUrl = null`)

## Чеклист

- [x] Express server + `/health`
- [x] `POST /v1/story/full`
- [x] Demo-режим без ключей
- [x] Retrofit client в Android
- [x] Настраиваемый backend URL
- [ ] MusicBrainz enrichment
- [ ] Firebase Storage для audio
- [ ] Rate limiting

## Smoke test

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/v1/story/full \
  -H "Content-Type: application/json" \
  -d '{"artist":"Кино","title":"Группа крови"}'
```
