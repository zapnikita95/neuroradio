# Публичные озвученные факты и SEO на efir-ai.ru

## Главное правило

**Храним и показываем текст ровно в том виде, как его услышал пользователь** — поле `voicedText`.  
Не переписываем LLM, не пересинтезируем для сайта. Один раз озвучили → сохранили → reuse для SEO, шаринга и (позже) автопоста.

Источник `voicedText`:

1. **`tts_transcript`** с сервера (предпочтительно) — текст, который реально ушёл в TTS.
2. Иначе **`displayTranscript`** на клиенте (`tts_transcript ?? script` с нормализацией имён).
3. Fallback: `script` — только если TTS-транскрипта не было (demo / без озвучки).

Клиент отправляет `voiced_text` в `POST /v1/story/complete`. Бэкенд не меняет его.

---

## Схема записи

Файл runtime: `{ACCOUNT_DATA_DIR}/public-voiced-facts.json`  
Сервис: [`backend/src/services/public-voiced-facts.ts`](../backend/src/services/public-voiced-facts.ts)

```json
{
  "id": "uuid",
  "artist": "Queen",
  "title": "Bohemian Rhapsody",
  "voicedText": "Полный текст истории как озвучено…",
  "seedFact": "исходный seed (справочно, не для переозвучки)",
  "narrator": "radio_host",
  "lang": "ru",
  "source": "history",
  "trackKey": "queen|bohemian rhapsody",
  "firstVoicedAt": 1710000000000,
  "publishedOnSite": true
}
```

| Поле | Обязательно | Смысл |
|------|-------------|--------|
| `voicedText` | да | **Единственный текст для публикации** |
| `narrator` | да | Амплуа: `radio_host`, `fan`, … |
| `artist`, `title` | да | Метаданные трека |
| `seedFact` | нет | Справочно, для модерации |
| `source` | да | `history` (из complete) или `gold` (backfill corpus) |

---

## Dedupe

Ключ: `sha256(normalize(voicedText) + "|" + trackKey + "|" + narrator)`  
Повтор того же текста на том же треке и амплуа → skip.  
Разные амплуа на одном треке → разные записи (это фича для SEO).

---

## Поток данных

```
POST /v1/story/full → tts_transcript в ответе
        ↓
Клиент проигрывает audio
        ↓
POST /v1/story/complete { voiced_text, script, seed_fact, story_narrator, … }
        ↓
recordUserStory → story_history.voiced_text (без автопубликации)
        ↓
Triple-like feedback (👍 + все 3 причины) → promoteVoicedFactIfQuality
        ↓
public-voiced-facts.json (+ social queue при SOCIAL_PUBLISH_ENABLED)
        ↓
generate-facts-seo-pages.mjs → website/docs/facts/*.html
```

**В публичный store попадают только:**
- triple-like (like + `interesting_fact` + `good_speech` + `good_persona` за одну историю), прошедшие `validateStoryScript`;
- gold corpus (backfill);
- ручной approve (admin).

Обычный `/complete` **не** добавляет запись в `public-voiced-facts.json`.

---

## SEO-страницы

| URL | Содержимое |
|-----|------------|
| `/docs/facts/index.html` | Hub: секции по 6 амплуа + «факт дня» |
| `/docs/facts/artists/{slug}.html` | Топ артисты (генератор) |

Генератор: [`backend/scripts/generate-facts-seo-pages.mjs`](../backend/scripts/generate-facts-seo-pages.mjs)  
Backfill: [`backend/scripts/backfill-public-voiced-facts.mjs`](../backend/scripts/backfill-public-voiced-facts.mjs)

Обновлять: `website/sitemap.xml`, `website/llms.txt`, ссылка с `index.html`.

---

## API (read-only)

`GET /v1/public/facts?narrator=fan&limit=20&lang=ru`

Без auth. Rate limit как у других public routes.

---

## Env

| Переменная | Когда нужна |
|------------|-------------|
| `ACCOUNT_DATA_DIR` | Railway volume — уже есть для prod |
| `DATABASE_URL` | Backfill из Postgres `story_history` |

Новых переменных для SEO-store **не требуется**.

---

## Ключевые файлы

- `backend/src/services/public-voiced-facts.ts`
- `backend/src/services/voiced-fact-promote.ts` — quality gate + triple-like hook
- `backend/src/routes/story.ts` — `voiced_text` в `/complete` и `/feedback`
- `backend/src/services/db.ts` — колонка `story_history.voiced_text`
- `website/docs/facts/index.html`
