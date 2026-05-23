# PLAN-03 — AI Story Generation & TTS

## Цель

Генерировать ~30-секундную русскую «нейрорадио»-справку от лица современника года выпуска трека и фаната музыки; озвучить через Yandex SpeechKit или Android TTS.

## LLM (GROQ)

**Модель:** `qwen/qwen3-32b` (хороший русский, JSON-режим)

### Системный промпт (суть)

- Ты — **современник года выпуска трека** ({year}), **фанат** исполнителя/жанра
- Формат: живое «нейрорадио», актёрская подача, 1–2 ярких факта
- **60–65 слов**, разговорный русский, без сценических ремарок
- JSON: `{ "script", "word_count", "era_voice_hint" }`

### Duration loop

1. Generate script (~62 words)
2. Synthesize → measure duration
3. If >32s: rewrite «сократи до 28 сек»
4. If <27s: rewrite «добавь 1 факт»
5. Max 2 итерации, затем adjust SpeechKit `speed` 0.9–1.1

## Голоса по эпохам (Yandex SpeechKit)

| Эпоха | Год | Voice | Характер |
|-------|-----|-------|----------|
| GoldenAge | до 1960 | `marina` | Ностальгический |
| SixtiesSeventies | 1960–1979 | `filipp` | Энергичный |
| EightiesNineties | 1980–1999 | `jane` | Радиоведущий |
| TwoThousands | 2000–2014 | `alena` | Современный |
| Recent | 2015+ | `omazh` | Молодой энтузиаст |

## TTS Pipeline

### Сервер (Yandex SpeechKit)

```
POST https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize
Format: oggopus / mp3, sampleRate 48000
→ Upload → audioUrl
```

### Android (fallback)

| Компонент | Файл |
|-----------|------|
| ExoPlayer | `StoryPlayer.kt` — server audio |
| TextToSpeech | `StoryPlayer.kt` — demo/offline |
| Local fallback | `LocalStoryGenerator.kt` |

## LocalStoryGenerator

3 варианта текста (~60 слов), hash-based выбор по artist+title.
Используется когда backend недоступен.

## Playback flow

```
StoryOrchestrator → StoryRepository.fetchStory()
  → audioUrl? → ExoPlayer
  → null?     → TTS (ru-RU)
→ onComplete → resumeMusic()
```

## Чеклист

- [x] `StoryResponse` model
- [x] `StoryPlayer` ExoPlayer + TTS
- [x] `LocalStoryGenerator` offline
- [ ] GROQ prompt templates на backend
- [ ] MusicBrainz year lookup
- [ ] Yandex voice mapping по эпохе
- [ ] Duration validation loop

## Критерии качества

- Длительность озвучки: 27–33 сек
- Язык: русский
- Без Wikipedia-сухости, актёрская подача
- При ошибке TTS — resume музыки, toast ошибки
