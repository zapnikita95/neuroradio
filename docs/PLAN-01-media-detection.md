# PLAN-01 — Media Detection Layer

## Цель

Определять текущий трек из Spotify и Яндекс Музыки, управлять pause/resume через MediaSession и поддерживать фоновый мониторинг.

## Архитектура

```
NotificationListenerService → MediaControllerManager → MediaMonitorService → StoryOrchestrator
```

## Компоненты

| Файл | Назначение |
|------|------------|
| `MediaNotificationListener.kt` | `NotificationListenerService`, парсинг медиа-уведомлений |
| `MediaControllerManager.kt` | `MediaSessionManager`, callbacks, pause/play |
| `MediaSessionSelector.kt` | Whitelist пакетов и приоритеты |
| `MediaMonitorService.kt` | Foreground service, наблюдение за сменой трека |

## Поддерживаемые пакеты

- `com.spotify.music`
- `ru.yandex.music`
- `com.yandex.music`

Приоритет: Spotify → Яндекс Музыка.

## Разрешения (AndroidManifest)

- `INTERNET`
- `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_SPECIAL_USE`
- `POST_NOTIFICATIONS`
- `RECEIVE_BOOT_COMPLETED`
- `BIND_NOTIFICATION_LISTENER_SERVICE` (на сервисе)

## Onboarding

1. Экран `OnboardingScreen` → Settings → Notification access
2. `MediaNotificationListener.requestRebind()` после выдачи доступа
3. Android 13+ sideload: инструкция «Allow restricted settings» в App info

## Reactive gate (ограничение Android)

Нельзя перехватить Play **до** старта трека. Модель:

1. `STATE_PLAYING` + новый `displayKey`
2. `transportControls.pause()`
3. Генерация и озвучка истории
4. `transportControls.play()`

Первые 0.3–1 сек музыки могут проскочить — норма для MVP.

## Debounce / dedup

- `distinctUntilChanged()` по `displayKey` в `MediaMonitorService`
- `ScrobbleRepository.wasRecentlyScrobbled()` — 30 сек окно

## Чеклист реализации

- [x] NotificationListenerService в манифесте
- [x] MediaSessionManager + active sessions listener
- [x] Выбор controller по whitelist
- [x] `TrackInfo` из metadata
- [x] pause/resume transport controls
- [x] Foreground notification с action «Рассказать историю»
- [x] BootReceiver → автозапуск службы
- [ ] Debounce 300 ms (опционально)
- [ ] Unit-тесты MediaSessionSelector

## Тестирование

| Сценарий | Ожидание |
|----------|----------|
| Spotify play | artist + title на Home |
| Яндекс play | artist + title на Home |
| Оба одновременно | приоритет Spotify |
| Skip next | новый трек, без дублей scrobble |
| Нет notification access | onboarding, служба не стартует |
