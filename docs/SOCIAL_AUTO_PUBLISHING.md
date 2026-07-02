# Автопостинг в соцсети

## Куда именно постится

После **triple-like** → quality gate → (опционально) **кнопки в admin Telegram** → cron tick публует **один и тот же** `voicedText` во **все настроенные** каналы:

| # | Куда | Как настроить | Формат |
|---|------|---------------|--------|
| 1 | **Telegram-канал** | `TELEGRAM_CHANNEL_ID` + бот админ канала | текст или **видео** (ffmpeg) |
| 2 | **VK — стена группы** | `VK_ACCESS_TOKEN` + `VK_GROUP_ID` | текст + ссылка efir-ai.ru |
| 3 | **Bluesky** | `BLUESKY_HANDLE` + `BLUESKY_APP_PASSWORD` | короткий текст (бесплатный API) |
| 4 | **Mastodon** | `MASTODON_INSTANCE_URL` + `MASTODON_ACCESS_TOKEN` | короткий текст (бесплатный API) |
| 5 | **Postiz → X, Threads, LinkedIn, Instagram…** | `POSTIZ_API_KEY` + `POSTIZ_INTEGRATIONS` | один API → все подключённые аккаунты в Postiz |

**Не настроено env → туда не постим.** Хотя бы один канал должен быть настроен, иначе tick пометит `failed`.

### Postiz — «все соцсети под капотом»

- **Self-hosted (Docker)** — бесплатно, open-source: [github.com/gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app)
- **Cloud** — от $29/мес, если не хочешь свой сервер
- В UI Postiz подключаешь аккаунты (X, Threads, LinkedIn, Instagram, Telegram, VK, Bluesky, Mastodon — 30+ платформ)
- В Railway задаёшь API key и ID интеграций — бэкенд шлёт один POST, Postiz разносит по всем

Пример env:
```env
POSTIZ_API_URL=https://api.postiz.com/public/v1
POSTIZ_API_KEY=your-key-from-postiz-settings
POSTIZ_INTEGRATIONS=uuid-threads:threads,uuid-x:x,uuid-linkedin:linkedin
```

ID интеграций: Postiz → Settings → Developers → `GET /integrations` или wizard в доке.

### Почему не Twitter/X напрямую

Официальный API X — **платный** ($100+/мес). Threads/Instagram — только через Meta Business. Поэтому **Postiz** (OAuth в их UI) или **Bluesky + Mastodon** бесплатно напрямую.

---

## Поток

```
Triple-like / gold → promoteVoicedFactIfQuality
        ↓
social-publish-queue (candidate)
        ↓
Admin TG: [✅ Одобрить] [❌ Отклонить] [🚀 Опубликовать сейчас]
        ↓
Cron tick → ffmpeg видео (TTS + субтитры, без трека) → все настроенные каналы
```

---

## Admin Telegram (inline approve)

1. `TELEGRAM_ADMIN_CHAT_ID` — твой numeric chat id (@userinfobot)
2. `TELEGRAM_BOT_TOKEN` — тот же бот
3. `PUBLIC_BFF_URL=https://www.efir-ai.ru` — для webhook
4. Опционально `TELEGRAM_WEBHOOK_SECRET=random-string`

При boot бэкенд вызывает `setWebhook` → `POST /v1/public/telegram/bot-webhook`.

---

## Видео (ffmpeg)

- `SOCIAL_VIDEO_ENABLED=true` (default on)
- Vertical 1080×1920: градиент + persona PNG + TTS (Edge) + субтитры
- **Без** оригинальной записи трека
- Telegram получает `sendVideo`; Postiz — upload + attach

---

## Env (Railway)

| Переменная | Обязательна | Описание |
|------------|-------------|----------|
| `SOCIAL_PUBLISH_ENABLED` | да | `true` |
| `TELEGRAM_BOT_TOKEN` | да | Бот (auth + admin + канал) |
| `TELEGRAM_ADMIN_CHAT_ID` | да | Approve-кнопки |
| `TELEGRAM_CHANNEL_ID` | для TG | `@channel` или `-100…` |
| `VK_ACCESS_TOKEN` | для VK | token с `wall` |
| `VK_GROUP_ID` | для VK | ID группы |
| `BLUESKY_HANDLE` | для Bluesky | `@handle.bsky.social` |
| `BLUESKY_APP_PASSWORD` | для Bluesky | App password из настроек |
| `MASTODON_INSTANCE_URL` | для Mastodon | `https://mastodon.social` |
| `MASTODON_ACCESS_TOKEN` | для Mastodon | Settings → Development |
| `POSTIZ_API_KEY` | для Postiz | Settings → Developers |
| `POSTIZ_INTEGRATIONS` | для Postiz | `id:type,id:type` |
| `SOCIAL_AUTO_APPROVE` | нет | `true` — без кнопок |
| `SOCIAL_PUBLISH_CRON_MINUTES` | нет | default `360` |
| `DATABASE_URL` | для backfill | **Reference** `${{Postgres.DATABASE_URL}}` на Railway |

---

## DATABASE_URL

**Не коммить в git.** На Railway:

1. Postgres service → Connect → Add reference to music-story
2. Или Variables → `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`

Backfill на prod (Railway shell или one-off):
```bash
node backend/scripts/backfill-public-voiced-facts.mjs
node backend/scripts/generate-facts-seo-pages.mjs
```

---

## Ритм

2–3 поста в неделю (`SOCIAL_MIN_PUBLISH_GAP_MS` default 48h между публикациями).

---

## Ключевые файлы

- `backend/src/services/social-publish-queue.ts`
- `backend/src/services/social-publish-tick.ts`
- `backend/src/services/social-video-render.ts`
- `backend/src/services/telegram-admin-bot.ts`
- `backend/src/services/postiz-publish.ts`
- `backend/scripts/social-publish-tick.mjs`
