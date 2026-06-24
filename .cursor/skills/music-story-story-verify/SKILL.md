---
name: music-story-story-verify
description: >-
  Обязательная проверка после правок фактов/seed/story/quality на Music Story BFF:
  build, regression, local seed, prod POST /v1/story/full, seed+script quality.
  Use when user reports bad track story, wrong fact, LLM garbage, after fact-picker
  or story-quality fixes, before saying "готово"/"на Railway", verify, проверь модель,
  прогони пайплайн, Lonely No More, seed bleed.
---

# Music Story — verify после фикса трека

## Железное правило

**Нельзя** писать пользователю «исправлено» / «на Railway» / «деплой готов», пока не прогнан **verify для затронутого трека** (и регрессия, если менялся общий gate).

Цикл: **фикс → build → verify → если FAIL → ещё фикс → verify снова**, пока PASS.

---

## Быстрый чек одного трека (главная команда)

```powershell
cd "c:\Users\1\OneDrive\Desktop\Music story\backend"
npm run build
node scripts/verify-story-track.mjs --artist "Rob Thomas" --title "Lonely No More"
# или (PowerShell надёжнее):
$env:VERIFY_ARTIST="Rob Thomas"; $env:VERIFY_TITLE="Lonely No More"; npm run verify:track -- --prod-only
```

Скрипт: `backend/scripts/verify-story-track.mjs`

Делает:
1. **Local seed** — fetch facts → `pickReferenceFact` / salvage → `isRejectedStorySeed`, `isWeakSelectedFact`, дефолтные bad-паттерны.
2. **Prod full** — `GET /health` (build) → JWT → `POST /v1/story/full` → печатает **SEED + SCRIPT** → `validateStoryScript` с **`qualityOptionsForProductionAttempt`** (как OpenRouter loop, `skipFirstSentenceAnchor: true`).

Флаги:
- `--local-only` — только seed, без prod (быстро, без квоты).
- `--prod-only` — только prod (после деплоя).
- `--bad-seed "regex"` — доп. паттерн мусора в seed (из бага пользователя).
- `--bad-script "regex"` — доп. паттерн мусора в script.

**install_id для prod:** `00000000-0000-4000-8000-0000000000ab` (UUID v4, см. `scripts/lib/prod-auth.mjs`).  
**URL:** `https://www.efir-ai.ru` или `BFF_URL` из env.

**429 «5 историй в день»** — это **серверный лимит free-tier на Railway**, не ограничение Cursor. Verify передаёт `OPENROUTER_API_KEY` из `backend/.env` → `shouldSkipDailyStoryQuota` = true. Не слать 10 prod-запросов подряд без паузы.

---

## Полный чеклист агента (backend fact/story fix)

```
- [ ] npm run build
- [ ] npm run test:fact-pick          (если трогали picker/anchor/quality gates)
- [ ] npm run verify:track -- "Artist" "Title"   (каждый трек из жалобы)
- [ ] prod SEED не содержит известный мусор (band bleed, label, YouTube citation, Last.fm album line)
- [ ] prod SCRIPT проходит validateStoryScript с referenceFacts=[seed]
- [ ] в ответе пользователю — цитата реального SEED и SCRIPT с prod (или local seed если prod 429/503)
- [ ] push + deploy (railway-deploy-ship) если менялся backend
- [ ] npm run verify:track -- ... --prod-only   (повтор после деплоя)
```

---

## Регрессия (системные gates)

```powershell
cd backend
npm run test:fact-pick
npm run test:quality
```

Добавляй кейс в `scripts/test-fact-pick-regression.mjs`, если пользователь принёс **новый класс** бага (не one-off строка в curated).

---

## Несколько треков подряд

**Не** слать 10× `story/full` подряд на один install_id — prod квота **5 историй/день** на free tier + 503 при перегрузе.

```powershell
# Пачка с паузой 90s между треками:
npm run verify:batch -- --file scripts/user-tracks-batch.txt --delay 90000
```

Или по одному треку вручную. Список типичных жалоб: `backend/scripts/user-tracks-batch.txt`.

---

## Что считать PASS / FAIL

| Проверка | FAIL если |
|----------|-----------|
| Local seed | null, `isRejectedStorySeed`, `isWeakSelectedFact`, bad-seed regex |
| Prod HTTP | не 200 (кроме явной 429 квоты — тогда хотя бы local PASS + отдельный prod один трек) |
| Prod seed | пустой, band bleed, catalog junk, чужой трек |
| Prod script | cliché без seed, Dani на Can't Stop, «стала хитом» без seed, LLM garbage |
| Quality | `validateStoryScript` → `ok: false` |

---

## Отчёт пользователю (обязательный формат)

```markdown
## Verify: Artist — Title
- build prod: `d5a8781`
- **SEED** (scope, interest): «…»
- **SCRIPT** (фрагмент): «…»
- Gates: rejected/weak/bad patterns — pass/fail
- Итог: PASS / FAIL → что ещё чинить
```

Без реального SEED/SCRIPT из прогона — **не закрывать задачу**.

---

## Связанные скрипты

| Скрипт | Когда |
|--------|-------|
| `verify-story-track.mjs` | **основной** после каждого фикса трека |
| `test-fact-pick-regression.mjs` | системные gates |
| `test-story-quality.mjs` | quality/cliché/ungrounded |
| `test-local-seeds-user-tracks.mjs` | только local seed, список треков |
| `test-prod-user-tracks.mjs` | prod пачка (осторожно с квотой) |
| `test-story-e2e-openrouter.mjs` | только LLM текст без facts fetch |

---

## Anti-patterns (запрещено)

- «Исправил в fact-picker» без `npm run verify:track`.
- Только unit-тест без prod `--prod-only` после deploy.
- Патч под один artist в curated без gate в `fact-seed-pick` / `fact-track-anchor`.
- 10 prod запросов подряд и вывод «503 — значит ок».
- Говорить «модель отдаёт норм» без вывода SCRIPT из прогона.
