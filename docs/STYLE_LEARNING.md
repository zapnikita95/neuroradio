# Style learning — амплуа без fine-tune

Обучение **подаче** (ритм, лексика, зачин), не фактам. Факты по-прежнему из Wikipedia/MusicBrainz/DDG и `fact-picker`.

## Слои

| Слой | Файл | Когда работает |
|------|------|----------------|
| Narrator fact boost | `reference-fact-quality.ts`, `fact-picker.ts` | Всегда при выборе seed |
| Few-shot примеры | `style-corpus.ts` → `prompts.ts` | ≥ 1 gold на амплуа+язык |
| RAG по стилю | `style-rag.ts` | **≥ 50 gold** в corpus |
| Promote из лайков | `style-feedback-learn.ts` | `good_persona` + пороги |

Fine-tune LLM — см. `docs/LLM_FINETUNE.md` (отложен).

## Narrator fact boost

При `pickReferenceFact` score = `interestScore(fact) + narratorFactBoost(fact, narrator)`:

| Амплуа | Что поднимаем |
|--------|----------------|
| `fan` | коллекционные факты, стримы, издания, чарты |
| `expert` | жанр, аранжировка, структура, продакшн |
| `backstage` | конфликт, скандал, отказ, бан; штраф сухой дискографии |
| `contemporary` | эпоха, СССР/iron curtain, breakthrough |
| `radio_host`, `night_dj`, `auto` | без boost (только prompt) |

## Style corpus

Данные: `backend/src/data/style-corpus-seed.jsonl` (в репо) + runtime `data/style-corpus/gold.jsonl` на Railway volume.

Запись:

```json
{
  "id": "uuid",
  "narrator": "fan",
  "lang": "ru",
  "genreBucket": "pop",
  "decade": "1980s",
  "seedFact": "…",
  "script": "…",
  "status": "gold",
  "source": "seed|promoted|manual"
}
```

**Few-shot:** 1–2 примера того же `narrator` + `lang`, близкий `genreBucket`/`decade`. В prompt блок «ПРИМЕРЫ ПОДАЧИ (не копируй факты)».

**RAG (≥50 gold):** bag-of-words cosine по `narrator + genre + decade + seedFact`; в prompt только **script** как образец стиля, seed из текущего трека не подменяется.

## Обучение на лайках

Feedback: `POST /v1/story/feedback` с опциональными полями:

- `story_narrator` — амплуа рассказа
- `seed_fact`, `genre`, `year`, `lang` — для bucket и promote

Promote в gold когда **один и тот же script** (нормализованный hash):

| Условие | Значение |
|---------|----------|
| Лайки с `good_persona` | **≥ 10** |
| Разные треки (`artist\|title`) | **≥ 5** |
| Quality gate | `anchorsReferenceFact` + `validateStoryScript` |
| Dedupe | Jaccard vs corpus < 0.85 |
| Cap | **≤ 20** active gold на narrator |

**Demote:** ≥ 3 dislikes с `speech_manner` на promoted script → `status: demoted`.

## Защита от переобучения

1. Promote только при **разных trackKey** — один viral трек не наполняет corpus.
2. Quality gate на promote — не сырой текст из LLM.
3. Dedupe похожих script в corpus.
4. Cap 20/narrator — старые demote или lowest likeCount.
5. RAG/few-shot явно: «не копируй факты из примеров».
6. Fine-tune отложен до 2000+ gold (см. LLM_FINETUNE.md).

## На что влияет для пользователя

- **Выбор факта** чуть лучше под амплуа (фанат чаще получает «коллекционные» семена).
- **Тон текста** стабильнее внутри выбранного амплуа за счёт примеров.
- После накопления лайков и **50+ gold** — более релевантные примеры стиля под жанр/эпоху.
- **Не меняется:** источник фактов, TTS, квоты, offline pack.

## Env (опционально)

| Переменная | Default | Смысл |
|------------|---------|-------|
| `STYLE_RAG_MIN_GOLD` | 50 | Порог включения RAG |
| `STYLE_PROMOTE_MIN_LIKES` | 10 | Лайков для promote |
| `STYLE_PROMOTE_MIN_TRACKS` | 5 | Разных треков |
| `STYLE_MAX_GOLD_PER_NARRATOR` | 20 | Cap corpus |

## Ключевые файлы

- `backend/src/services/style-corpus.ts`
- `backend/src/services/style-rag.ts`
- `backend/src/services/style-feedback-learn.ts`
- `backend/src/services/reference-fact-quality.ts` — `narratorFactBoost`
- `backend/src/services/prompts.ts` — injection few-shot/RAG
