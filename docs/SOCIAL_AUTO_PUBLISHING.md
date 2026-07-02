# Автопостинг в соцсети (фаза 2)

> **Фаза 1 (текущая):** share в приложении + SEO-факты на сайте + юридика.  
> **Фаза 2:** очередь и автопубликация — после стабилизации фазы 1.

## Что не делаем

- Telegram-бот «скинь артиста — получи факт» (отклонено).

## Платформы (приоритет для РФ)

| # | Платформа | Формат |
|---|-----------|--------|
| 1 | Telegram-канал | текст + голосовое/видео |
| 2 | VK | пост на стене + клипы |
| 3 | Дзен | длинный текст (ручной/полуавто) |
| 4 | Threads / X | короткий текст (вторично) |
| — | Facebook | skip |

## Источники кандидатов

1. **Triple-like** — like + все 3 причины (`interesting_fact`, `good_speech`, `good_persona`) на одну историю.
2. **Gold corpus** — `style-corpus/gold.jsonl`.
3. **Ручной approve** — admin Telegram (существующий `TELEGRAM_ADMIN_CHAT_ID`).

Текст поста = **`voicedText`** из [`public-voiced-facts.json`](PUBLIC_FACTS_SEO.md) — без перегенерации.

## Очередь `social_publish_queue`

```
candidate → approved → scheduled → published | failed
```

Dedupe: один `voicedText` + track → max 1 публикация / 6 мес.

## Видео (без фрагмента трека)

Сборка ffmpeg:

- resynth TTS из сохранённого `voicedText` (или архив `.wav` если сохранён в очереди);
- субтитры из `voicedText`;
- обложка/градиент + аватар амплуа;
- **без** оригинальной записи трека.

### Про короткий кусок трека (5–10 сек)

**Не в автопост v1.** Короткий фрагмент не делает использование легальным для промо приложения; ВК/YouTube/TG могут заглушить. Если когда-либо — только ручной approve, ≤5 сек, голос доминирует, риск claim на исполнителя.

## Ритм

2–3 поста в неделю на канал. Не спам.

---

## Env-переменные (вставить на Railway при фазе 2)

| Переменная | Обязательна | Описание |
|------------|-------------|----------|
| `SOCIAL_PUBLISH_ENABLED` | да | `true` — включить cron tick |
| `TELEGRAM_BOT_TOKEN` | да | Уже есть для auth/admin |
| `TELEGRAM_CHANNEL_ID` | да | `@channel` или numeric `-100…` для постов |
| `TELEGRAM_ADMIN_CHAT_ID` | да | Approve flow (уже есть) |
| `VK_ACCESS_TOKEN` | для VK | User/community token с `wall`, `video`, `photos` |
| `VK_GROUP_ID` | для VK | ID группы (без минуса или с — по API) |
| `SOCIAL_PUBLISH_CRON_MINUTES` | нет | default `360` (6 ч) |
| `SOCIAL_TRIPLE_LIKE_WINDOW_MS` | нет | default `300000` (5 мин на 3 like-reasons) |
| `FFMPEG_PATH` | для видео | default `ffmpeg` в PATH на Railway |

**Фаза 1 не требует этих переменных.**

## Ключевые файлы (фаза 2)

- `backend/src/services/social-publish-queue.ts`
- `backend/scripts/social-publish-tick.mjs`
- Adapters: `telegram-channel-publish.ts`, `vk-wall-publish.ts`
