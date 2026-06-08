# Эфир AI — iOS release checklist (Mac)

Подготовка отдельного релиза для iPhone / TestFlight / App Store. Android (`com.efirai.myapp`) и iOS используют **один bundle ID** и один BFF на Railway.

## Что уже в репозитории

- `ios/MusicStory.xcodeproj` — открывается сразу в Xcode
- SwiftUI-приложение + виджет + ShazamKit / Apple Music / Spotify (SDK опционально)
- План архитектуры: [docs/PLAN-06-ios.md](../docs/PLAN-06-ios.md)

## 1. Открыть проект на Mac

```bash
git clone https://github.com/zapnikita95/music-story.git
cd music-story/ios
open MusicStory.xcodeproj
```

Если меняли `project.yml`:

```bash
brew install xcodegen
./setup.sh
```

## 2. Signing (Apple Developer)

1. [developer.apple.com](https://developer.apple.com/account) → **Membership** → скопируйте **Team ID** (10 символов, например `ABCDE12345`)
2. Xcode → Target **MusicStory** → **Signing & Capabilities** → Team = ваш аккаунт
3. То же для **MusicStoryWidgetExtension**
4. Bundle ID (уже в проекте):
   - App: `com.efirai.myapp`
   - Widget: `com.efirai.myapp.widget`

## 3. Railway / BFF

В переменных окружения production-сервера:

```env
ALLOWED_IOS_TEAM_ID=ВАШ_TEAM_ID
# при нескольких командах через запятую
```

Опционально для локальной отладки с Xcode (симулятор / dev-сборка):

```env
ALLOW_DEBUG_CERT=true
```

Dev-сборка отправляет attestation `ios:com.efirai.myapp:DEVELOPMENT` — сервер принимает при `ALLOW_DEBUG_CERT != false`.

Проверка auth с Mac (после первого запуска приложения):

```bash
curl -s https://ВАШ-RAILWAY-URL/health
```

## 4. Spotify Developer Dashboard

Создайте приложение на [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard):

| Поле | Значение |
|------|----------|
| App name | **Efir AI** |
| App description | Neuro radio person for your favorite music |
| Website | `https://www.efir-ai.ru` |
| **Redirect URI** | **`efirai://spotify-callback`** |
| Which API/SDKs | **iOS** (при необходимости Android) |

> Spotify принимает custom URL scheme вида `efirai://…` — **не** `https://example.org/callback`.

После создания:

1. Скопируйте **Client ID**
2. В приложении: **Настройки → Spotify Client ID** (или в коде `SettingsStore`)
3. Redirect URI в приложении по умолчанию: `efirai://spotify-callback` (должен совпадать с Dashboard)

### Spotify iOS SDK (опционально, для метаданных Spotify)

1. Скачайте [Spotify iOS SDK](https://github.com/spotify/ios-sdk/releases)
2. Добавьте `SpotifyiOS.xcframework` в Xcode → Target MusicStory → **Frameworks, Embed & Sign**
3. Без SDK работают Apple Music, ShazamKit и ручной ввод

**Ограничение SDK:** для первого подключения музыка в Spotify должна уже играть.

## 5. Info.plist / разрешения

Уже настроено в `MusicStory/Info.plist`:

- **NSMicrophoneUsageDescription** — ShazamKit (только по действию пользователя)
- **NSAppleMusicUsageDescription** — текущий трек Apple Music
- URL scheme **`efirai`** — Spotify callback и deep link виджета `efirai://tell-story`
- **LSApplicationQueriesSchemes**: `spotify`

Display name: **Эфир AI**

## 6. Бэкенд в приложении

На симуляторе: `http://127.0.0.1:3000`  
На iPhone (тот же Wi‑Fi): `http://<IP_Mac>:3000`  
Production: URL Railway из Android-сборки (например `https://….up.railway.app`)

Запуск BFF локально:

```bash
cd ../backend
npm ci && npm run build && node dist/index.js
```

## 7. Сборка и TestFlight

### Debug на устройство

Xcode → выберите iPhone → **Product → Run** (⌘R)

### Archive

1. **Product → Archive**
2. **Distribute App → App Store Connect**
3. TestFlight → внутреннее тестирование

### Терминал

```bash
cd ios
chmod +x build.sh
./build.sh
```

## 8. Smoke-test перед релизом

- [ ] `POST /v1/auth/token` — JWT без 403 (Team ID на Railway)
- [ ] Трек из Apple Music / Spotify / Shazam на главном экране
- [ ] **Рассказать историю** — текст + `audioUrl` (Yandex TTS с BFF)
- [ ] Локальное уведомление с action «Рассказать историю»
- [ ] Виджет → deep link `efirai://tell-story`
- [ ] Spotify connect (если SDK + Client ID)

## 9. App Store Connect

- Название: **Эфир AI**
- Bundle ID: `com.efirai.myapp`
- Privacy: микрофон — «распознавание трека по запросу пользователя (ShazamKit)»
- Отдельный релиз от Google Play; общий аккаунт/история через BFF sync

## Быстрая шпаргалка

| Что | Значение |
|-----|----------|
| Bundle ID | `com.efirai.myapp` |
| Spotify Redirect URI | `efirai://spotify-callback` |
| Deep link виджета | `efirai://tell-story` |
| Railway | `ALLOWED_IOS_TEAM_ID=<Team ID>` |
| Xcode project | `ios/MusicStory.xcodeproj` |
