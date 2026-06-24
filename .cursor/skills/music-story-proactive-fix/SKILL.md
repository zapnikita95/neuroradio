---
name: music-story-proactive-fix
description: >-
  Music Story: видишь проблему — сразу чини, не спрашивай «хочешь?». Сначала данные
  (audit, тесты, частота), потом фикс, verify, push. Use when agent notices a bug,
  flaky gate, inconsistent PASS/FAIL, or says «следующим шагом могу» — stop and fix now.
---

# Proactive fix — не «хочешь?», а «сделано»

## Железное правило (дословно от пользователя)

**Видишь проблему — ТЫ СРАЗУ ЕЁ УСТРАНЯЕШЬ.** Не предлагай «хочешь — следующим шагом могу». Не жди «делай / не делай» без данных.

## Цикл (обязательный порядок)

1. **Воспроизвести** — grep, лог, prod verify, audit-скрипт.
2. **Измерить** — сколько кейсов, strict vs prod, до/после (числа в ответе пользователю).
3. **Починить** — минимальный diff в `backend/src/services/`.
4. **Тесты** — `npm run build`, `npm run test:quality`, topic audit (`audit-*.mjs`), `verify:track` для трека из жалобы.
5. **Push** — commit + push на GitHub (railway-deploy-ship для backend).

## Что писать пользователю

- **Не:** «могу смягчить gate, если хочешь».
- **Да:** «gate срабатывал X/Y в audit, причина …, сделал …, после — Z/Y, verify PASS».

## Связанные скиллы

- `music-story-story-verify` — после фикса story/quality gates.
- `music-story-fact-pick-tests` — если трогали picker/seed.
- `railway-deploy-ship` — backend в prod.

## Audit-скрипты (добавляй при новом gate)

| Gate | Скрипт |
|------|--------|
| opening / first sentence anchor | `backend/scripts/audit-first-sentence-anchor.mjs` |
| story quality regression | `npm run test:quality` |
| один трек end-to-end | `npm run verify:track -- "Artist" "Title"` |
