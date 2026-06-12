---
name: music-story-fact-pick-tests
description: >-
  Регрессия выбора seed-факта (pickReferenceFact) в Music Story BFF: unit/live/prod
  скрипты в backend/scripts. Use when fixing fact-picker, fact-relevance, dedicated-fetch,
  hallucinations wrong seed, Hypa Hypa, Error37, «фактов не нашли», проверить pick,
  test:fact-pick, prod story/full, после правок фактов.
---

# Music Story — тесты выбора факта (fact pick)

## Когда гонять

После правок в:
- `backend/src/services/fact-picker.ts`
- `backend/src/services/fact-relevance.ts`
- `backend/src/services/fact-sources/dedicated-fetch.ts`
- `backend/src/services/fact-topic.ts`
- `backend/src/services/reference-fact-quality.ts`
- `backend/src/services/fact-aggregator.ts`

Или когда пользователь жалуется: не тот факт, bio 2010 вместо трека, «начало пути», Error37.

## Уровень 1 — юнит (обязательно, ~5 с, без сети)

```powershell
cd "c:\Users\1\OneDrive\Desktop\Music story\backend"
npm run test:fact-pick
```

Ожидание: **`PASS — 0 failed`**.

Проверяет синтетический кейс **Eskimo Callboy — Hypa Hypa**:
- pick = track scope, не «formed in Castrop-Rauxel in 2010»
- seed содержит `first new song` и `2020`
- duration `3:33` не выигрывает у narrative

Если FAIL — чинить код, не деплоить.

## Уровень 2 — live Last.fm (~30 с, нужен `.env`)

```powershell
cd "c:\Users\1\OneDrive\Desktop\Music story\backend"
npm run build
node scripts/test-fact-pick-regression.mjs --live
```

Нужен `LASTFM_API_KEY` в `backend/.env`. Ожидание: `live pick mentions track/2020/Nico`, не formation bio.

Точечная отладка bundle + pick:

```powershell
node scripts/debug-hypa-hypa-facts.mjs
node scripts/debug-dedicated-bundle.mjs
node scripts/debug-split-pool.mjs
```

В `=== PICKED SEED ===` / `pick` — про **2020 / Nico / EP**, не artist bio 2010.

Другой indie-кейс:

```powershell
node scripts/debug-error37-pick.mjs
```

## Уровень 3 — prod e2e (после push / Railway deploy)

```powershell
cd "c:\Users\1\OneDrive\Desktop\Music story\backend"
node scripts/test-prod-hypa-hypa.mjs
node scripts/test-prod-error37.mjs
```

По умолчанию `BFF_URL=https://www.efir-ai.ru`. Смотреть:
- **Hypa Hypa:** `SEED` и `SCRIPT` без «с 2010» / «начало пути»
- **Error37:** HTTP 200, `seed_fact` не пустой, нет «фактов не нашли»

Health перед prod:

```powershell
node scripts/test-prod-error37.mjs
# первый блок === /health === — build должен быть свежее коммита с фиксом
```

## Порядок для агента

1. `npm run test:fact-pick` — зелёный
2. При сомнении в Last.fm: `--live` или `debug-hypa-hypa-facts.mjs`
3. Commit + push
4. После деплоя: `test-prod-hypa-hypa.mjs` (и Error37 если трогали indie path)

## Критерии «плохого» seed (Hypa Hypa)

| Плохо | Хорошо |
|-------|--------|
| `formed in Castrop-Rauxel in 2010` | `first new song` / `2020` / `Nico` |
| scope `artist`, score ~25 formation | scope `track`, score ≥30 narrative |
| только `идёт 3:33` | история релиза EP MMXX |

## Связанные npm-скрипты

| Команда | Назначение |
|---------|------------|
| `npm run test:fact-pick` | Юнит-регрессия pick |
| `npm run test:facts` | topic + live 5 tracks (шире) |
| `npm run test:fact-sources` | benchmark источников |

## Если тесты падают

- **Unit FAIL, live OK** — расхождение синтетики и реального bundle; обновить кейсы в `scripts/test-fact-pick-regression.mjs` только если логика верна.
- **Live FAIL** — смотреть `dedicated bundle merged` в логах aggregator; track facts должны быть >1 для Hypa Hypa.
- **Prod FAIL, local OK** — Railway ещё на старом build; дождаться deploy, проверить `/health`.
