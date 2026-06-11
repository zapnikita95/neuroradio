# Fine-tune LLM — условия и когда имеет смысл

**Статус в проекте:** не делаем как основной путь. Стиль амплуа учится через **few-shot + RAG + лайки** (`docs/STYLE_LEARNING.md`).

Fine-tune рассматриваем только когда выполнены **все** пункты ниже.

## Зачем вообще fine-tune

- Стабильный «голос» персонажа без длинных промптов в каждом запросе.
- Меньше токенов на system/user prompt → дешевле inference.
- Жёстче соблюдение формата (длина, без цифр, без воды).

## Минимальные данные

| Критерий | Порог | Комментарий |
|----------|-------|-------------|
| Пар «семя факт → script» | **≥ 2000** | После ручной/авто-фильтрации, не сырые лайки |
| Gold после quality gate | **≥ 1500** | `validateStoryScript` + якорь к seed |
| Покрытие амплуа | **≥ 6 narrators** | Кроме `auto`, минимум 200 пар на амплуа |
| Языки | RU + EN отдельно | Не смешивать в одной модели без явной multiling модели |
| Разнообразие жанров/десятилетий | ≥ 15 genre buckets | Иначе модель «залипает» на pop 80-х |

## Качество датасета

Каждая строка JSONL:

```json
{
  "messages": [
    { "role": "system", "content": "…system prompt эпохи…" },
    { "role": "user", "content": "…artist, title, seed fact, narrator…" },
    { "role": "assistant", "content": "{\"script\":\"…\",\"word_count\":42,\"voiceId\":\"alena\"}" }
  ],
  "metadata": {
    "narrator": "fan",
    "lang": "ru",
    "seedFact": "…",
    "trackKey": "artist|title",
    "source": "gold_corpus|manual|promoted"
  }
}
```

**Исключить из обучения:**

- скрипты без якоря к seed;
- дубликаты (Jaccard > 0.85 на significant words);
- тексты с `hallucination` / `boring_fact` в dislikes;
- «переобученные» шаблоны — один зачин на >5% датасета.

## Защита от переобучения (обязательна)

1. **Hold-out:** 10% треков (по `trackKey`), не по строкам — ни один трек целиком не в train.
2. **Eval на unseen facts:** новые seed из fact-bank, не из train.
3. **Метрики:** anchor rate ≥ 95%, persona cliché rate ≤ 3%, средняя длина в диапазоне preset.
4. **A/B на production:** shadow 5% трафика, откат если dislike rate ↑ >15% относительно base LLM.
5. **Не fine-tune на TTS** — только текст; озвучка остаётся Yandex/Edge/ElevenLabs на BFF.

## Инфраструктура

- Провайдер: Groq/OpenRouter fine-tune API или отдельный LoRA (если self-host).
- Версионирование: `story-llm-finetune-v{N}` в env, fallback на base router (`story-llm-router.ts`).
- Стоимость re-train: только после +500 новых gold строк или смены quality rules.

## Связь с текущим pipeline

```
Сейчас:  facts → narrator prompt → few-shot/RAG → Groq/Gemini → quality gate → TTS
Fine-tune: facts → короткий prompt → FT-model → quality gate → TTS
```

RAG и few-shot **не выкидываем** даже после fine-tune: они подставляют **стиль**, модель — **содержание из seed**.

## Когда НЕ fine-tune

- Gold corpus < 2000 пар.
- Меняются правила `story-quality.ts` чаще раза в месяц (датасет устаревает).
- Нет стабильного eval harness (см. `backend/src/services/story-quality.ts`).

## Следующий шаг (если пороги достигнуты)

1. Экспорт `style-corpus/gold.jsonl` + ручная разметка → `finetune/train.jsonl`.
2. Скрипт `backend/scripts/export-finetune-dataset.ts` (TODO).
3. Eval notebook / CI job на 50 held-out треков.
4. Feature flag `LLM_FINETUNE_MODEL` на Railway.
