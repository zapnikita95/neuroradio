# iOS: озвучка историй — только WAV (не OGG)

**Обязательно прочитать перед любыми правками TTS, кэша офлайн-аудио или `StoryPlayer` на iOS.**

## Главное правило

| Платформа | Формат серверной озвучки | Плеер |
|-----------|--------------------------|--------|
| **Android** | OGG Opus (Yandex/Salute по умолчанию) | ExoPlayer — OGG ок |
| **iOS** | **WAV (lpcm-wav)** | AVPlayer — **OGG НЕ ИГРАЕТ** |

**AVPlayer на iOS не декодирует OGG/Opus.** Файл может скачаться, UI покажет «история играет», звука не будет. Fallback на `AVSpeechSynthesizer` — другой голос, не Yandex/Edge.

## Что уже сделано в коде (не ломать)

1. **Запрос истории** — iOS шлёт `client_platform: "ios"` в `POST /v1/story/full` (`StoryRequest` в `ios/MusicStory/Data/Models.swift`).
2. **Бэкенд** — при `client_platform === 'ios'`:
   - имя файла: `*.wav`;
   - Yandex TTS: `audioFormat: lpcm-wav`;
   - Salute (OGG-only) → fallback на Yandex WAV (`preferIosPlayback` в `tts-router.ts`).
3. **StoryPlayer** — не передаёт `.ogg` в AVPlayer; при ошибке — fallback на системный TTS.
4. **Офлайн-кэш** — по умолчанию выключен; при апдейте сбрасывается битый OGG (`migratePlaybackCacheIfNeeded`).

## Запрещено

- Отдавать iOS URL на `/audio/*.ogg` как основной путь воспроизведения.
- Кэшировать на iPhone OGG и потом `resolvePlaybackURL(preferLocal: true)` без проверки расширения.
- Менять `YANDEX_TTS_FORMAT=oggopus` глобально «для всех» — Android сломается; iOS нужен **per-client** WAV.
- Считать, что «раз на Android играет — на iOS тоже заработает».

## Проверка после правок

```bash
# auth token + story с ios platform — audioUrl должен содержать .wav
curl -sS -X POST 'https://www.efir-ai.ru/v1/story/full' \
  -H 'Authorization: Bearer …' \
  -H 'Content-Type: application/json' \
  -d '{"artist":"Кино","title":"Группа крови","story_narrator":"auto","tts_voice":"auto","tts_speed":1,"tts_emotion":"neutral","client_platform":"ios"}' \
  | jq '.audioUrl, .audioFile'
```

На устройстве: Console.app → категория воспроизведения; в логах Railway — `[yandex-tts] … format=lpcm-wav`.

## Симптомы регрессии

- История генерируется, текст есть, **тишина**.
- Через ~6–25 с роботический голос (fallback TTS) вместо нейро-голоса.
- В кэше `offline_stories/*.ogg` на iPhone.

## Файлы

| Область | Путь |
|---------|------|
| iOS плеер | `ios/MusicStory/Domain/StoryPlayer.swift` |
| iOS запрос | `ios/MusicStory/Data/StoryRepository.swift`, `Models.swift` |
| Роутинг TTS | `backend/src/services/tts-router.ts` |
| Формат Yandex | `backend/src/services/yandex-tts.ts` |
| Story API | `backend/src/routes/story.ts` (`client_platform`, `storyAudioExtensionForClient`) |

## История инцидента (2026-06)

Два дня: сервер отдавал OGG (как Android), iOS AVPlayer молчал. Фикс: `bd117aef` — WAV для iOS + сброс OGG-кэша, build **1.5.50 (105)**.
