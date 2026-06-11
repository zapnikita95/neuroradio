# PLAN-06 — iOS-приложение Music Story

## Цель

Нативное iOS-приложение (SwiftUI) с гибридным определением трека и интерактивными уведомлениями. Бэкенд BFF тот же, что у Android.

## Ограничения iOS vs Android

| Возможность | Android | iOS |
|-------------|---------|-----|
| Чтение уведомлений других приложений | NotificationListenerService | **Невозможно** |
| MediaSession чужих приложений | MediaSessionManager | **Невозможно** |
| Persistent foreground notification | Foreground Service | **Невозможно** (только локальные push) |
| Spotify metadata + pause/resume | MediaSession | Spotify App Remote SDK |
| Apple Music metadata | — | MPMusicPlayerController |
| Яндекс Музыка | MediaSession | ShazamKit (микрофон) или ручной ввод |

## Архитектура

```
SpotifyAppRemoteManager ──┐
AppleMusicNowPlaying   ──┼── NowPlayingCoordinator ── StoryOrchestrator ── BackendClient
ShazamTrackRecognizer  ──┘                              │
NotificationService (action) ───────────────────────────┘
Widget (efirai://tell-story) ───────────────────────┘
```

## Компоненты

| Файл | Назначение |
|------|------------|
| `NowPlayingCoordinator.swift` | Единый источник текущего трека, приоритет Spotify → Apple Music |
| `SpotifyAppRemoteManager.swift` | Spotify App Remote (опционально, нужен SDK) |
| `AppleMusicNowPlaying.swift` | System music player |
| `ShazamTrackRecognizer.swift` | One-shot распознавание (SHManagedSession, AirPods) |
| `OtherAudioShazamWatcher.swift` | Авто-Shazam при `isOtherAudioPlaying` (не non-stop) |
| `StoryOrchestrator.swift` | AUTO/MANUAL, pause → story → resume |
| `NotificationService.swift` | UNNotificationCategory + action «Рассказать историю» |
| `TellStoryWidget.swift` | Виджет → deep link `efirai://tell-story` |

## Сборка (только macOS)

### Быстрый старт после git clone

```bash
git clone https://github.com/zapnikita95/music-story.git
cd music-story/ios
open MusicStory.xcodeproj
```

`MusicStory.xcodeproj` **уже в репозитории** — XcodeGen не обязателен.

1. **Signing & Capabilities** → Target **MusicStory** и **MusicStoryWidgetExtension** → выберите Team
2. **Product → Run** (⌘R)

Сборка из терминала: `./build.sh` (см. [ios/README.md](../ios/README.md)).

### Требования

- macOS 14+
- Xcode 15+
- Apple ID (бесплатный аккаунт подходит для установки на свой iPhone)

### Перегенерация проекта (опционально)

Если меняли `project.yml`:

```bash
brew install xcodegen
./setup.sh
```

### CI

GitHub Actions: `.github/workflows/ios-build.yml` — сборка на `macos-14` runner.

## Spotify SDK (опционально)

1. Скачайте [Spotify iOS SDK](https://github.com/spotify/ios-sdk/releases)
2. Добавьте `SpotifyiOS.xcframework` в проект (Embed & Sign)
3. В [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) создайте приложение
4. Redirect URI: `efirai://spotify-callback`
5. Client ID → **Настройки** в приложении

Подробный чеклист релиза: [ios/RELEASE.md](../ios/RELEASE.md)

**Ограничение SDK:** для первого подключения музыка в Spotify должна уже играть.

Без SDK работают Apple Music, ShazamKit и ручной ввод.

## Авторизация на BFF

iOS отправляет `POST /v1/auth/token`:

```json
{
  "install_id": "uuid",
  "package_name": "com.efirai.myapp",
  "cert_sha256": "sha256(ios:com.efirai.myapp:TEAM_ID)",
  "platform": "ios",
  "team_id": "ABCDE12345"
}
```

На сервере:

- **Dev:** `ALLOW_DEBUG_CERT` не `false` → разрешён `DEVELOPMENT` team hash автоматически
- **Prod:** добавьте `ALLOWED_IOS_TEAM_ID=YOUR_TEAM_ID` в `.env`

## Настройка на устройстве

1. Установите приложение (Xcode / TestFlight)
2. Пройдите онбординг: уведомления → Spotify (опционально) → Shazam
3. **Настройки → URL бэкенда** — адрес BFF (для симулятора: `http://127.0.0.1:3000`, для телефона: `http://<IP>:3000`)
4. Запустите Spotify или Apple Music — трек появится на главном экране
5. Для Яндекс Музыки: **Настройки → Shazam для других плееров** (авто) или кнопка на главном
6. AirPods — распознавание из наушников; обычные наушники — поднести телефон к источнику звука

## Уведомления

При смене трека (AUTO, Spotify/Apple Music) приложение шлёт локальное уведомление с кнопкой **«Рассказать историю»**. Это аналог Android-кнопки в foreground notification, но без persistent notification.

## Виджет

Добавьте виджет Music Story на домашний экран — открывает приложение и запускает запрос истории.

## Чеклист релиза

- [ ] Team ID в Info.plist и `ALLOWED_IOS_TEAM_ID` на сервере
- [ ] Spotify Client ID (если нужен Spotify)
- [ ] App Store: объяснение использования микрофона (ShazamKit only on user action)
- [ ] TestFlight smoke: auth, story fetch, TTS, notification action
