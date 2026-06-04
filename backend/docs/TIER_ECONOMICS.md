# Экономика тарифов (ориентир)

Цены OpenRouter (DeepSeek V3, февраль 2026): ~$0.20/M input, ~$0.40/M output.  
Nemotron / Liquid `:free` — $0 LLM, лимиты RPM OpenRouter.

## Типичная история (60 с, fact-hunt + текст)

| Этап | Input tokens | Output tokens |
|------|--------------|---------------|
| Fact-hunt | ~2 500 | ~400 |
| Story | ~4 000 | ~500 |
| **Итого** | ~6 500 | ~900 |

**LLM (DeepSeek) на 1 историю:** ~$0.0013 + ~$0.00036 ≈ **$0.0017** (~0.17 ₽).

**Yandex TTS:** ~120–180 слов ≈ 800 символов — отдельно (SpeechKit, не в OpenRouter).

## Free — 10 историй/день

- Fact-hunt LLM: `google/gemma-4-26b-a4b-it:free` → fallback `nvidia/nemotron-3-nano-30b-a3b:free`
- Story: `liquid/lfm-2.5-1.2b-instruct:free`
- Rules picker (interestScore) — основной путь; LLM только если interest ≤5/10
- LLM: **$0** (429 на :free возможен → fallback)

## Trial — Gemma fact + DeepSeek story

- Fact-hunt: `google/gemma-4-26b-a4b-it` (~$0.06/M) — стабильный JSON без 429
- Story: DeepSeek V3
- 10 × fact+story ≈ **$0.008/мес** LLM — ок для воронки 1 ₽

## Premium — 199 ₽/мес, DeepSeek V3

- Fact + story: DeepSeek V3 (~$0.20/M)
- 750 stories/mo max ≈ **$1.28** LLM — ~50% бюджета при полной нагрузке
