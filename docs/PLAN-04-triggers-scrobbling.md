# PLAN-04 — Triggers & Scrobbling

## Цель

Гибкие триггеры для автоматических историй, локальный scrobbling (история прослушивания), кэш справок.

## TriggerEngine

| Режим | Логика |
|-------|--------|
| `EVERY_N_TRACKS` | `trackCounter % N == 0` (default N=10) |
| `SPECIFIC_ARTISTS` | artist in whitelist |
| `SPECIFIC_GENRES` | genre match (из enrichment) |
| `ALWAYS` | каждый новый трек |
| `NEVER` | только manual |

### Настройки (DataStore)

- `manualMode` — только по кнопке
- `autoIntercept` — pause + story + resume
- `everyNTracks`, `triggerMode`, `specificArtists`, `specificGenres`

## StoryOrchestrator modes

| Режим | Поведение |
|-------|-----------|
| **Auto** | Триггер → pause → fetch → play → resume |
| **Manual** | Только кнопка «Рассказать историю» / push action |

## State machine

```
IDLE → LISTENING → FETCHING_STORY → PLAYING_STORY → LISTENING
                  ↘ ERROR ↗
```

## Scrobbling (Room)

### Entities

**ScrobbleEntry**
- `artist`, `title`, `album`, `packageName`
- `scrobbledAt`, `storyTriggered`

**CachedStory**
- `trackKey` (artist|title lowercase)
- `script`, `audioUrl`, `year`, `genre`
- `fetchedAt` — TTL 24 ч

### Repository

`ScrobbleRepository` — insert, history Flow, dedup 30 сек.

## Push / Notification actions

- Foreground notification в `MediaMonitorService`
- Action «Рассказать историю» → `StoryActionReceiver`
- `PendingIntent` broadcast → `StoryOrchestrator.requestManualStory()`

## UI

| Экран | Функция |
|-------|---------|
| Settings | trigger mode, N, manual/auto |
| History | список scrobble entries |
| Home | tracks until next, last story preview |

## Чеклист

- [x] TriggerEngine + TriggerMode enum
- [x] SettingsDataStore
- [x] StoryOrchestrator state machine
- [x] Room ScrobbleEntry + CachedStory
- [x] HistoryScreen
- [x] Notification action button
- [ ] UI для whitelist artists/genres
- [ ] Stats (top artists, decades)
- [ ] Export JSON

## Тест-кейсы

| Сценарий | Ожидание |
|----------|----------|
| Every 10 tracks | история на 10-м треке |
| Manual mode | auto не срабатывает |
| Push action | manual story без ожидания N |
| Offline | cached/local story |
| Duplicate skip | 30 сек dedup |
