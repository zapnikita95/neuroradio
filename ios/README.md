# Music Story — iOS

Нативное приложение для iPhone (iOS 17+). После клонирования репозитория с GitHub можно сразу открыть в Xcode — **XcodeGen не обязателен**.

## Быстрый старт (Mac)

```bash
# 1. Клонировать репозиторий
git clone https://github.com/zapnikita95/music-story.git
cd music-story/ios

# 2. Открыть проект в Xcode
open MusicStory.xcodeproj
```

В Xcode:

1. **Signing & Capabilities** → Target **MusicStory** → выберите свой **Team** (Apple ID / Developer account)
2. То же для target **MusicStoryWidgetExtension**
3. Симулятор или iPhone → **Product → Run** (⌘R)

Готово — приложение установится на устройство/симулятор.

## Сборка из терминала (без Xcode UI)

```bash
cd ios
chmod +x build.sh setup.sh
./build.sh
```

Или вручную:

```bash
xcodebuild \
  -project MusicStory.xcodeproj \
  -scheme MusicStory \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -configuration Debug \
  build
```

## Archive / TestFlight

1. В Xcode: **Product → Archive**
2. **Distribute App** → TestFlight или Ad Hoc

Для prod-сервера добавьте в Railway / `.env`:

```
ALLOWED_IOS_TEAM_ID=ВАШ_TEAM_ID
```

Team ID смотрите в [Apple Developer](https://developer.apple.com/account) → Membership.

## Если изменили `project.yml`

Проект в git уже содержит `MusicStory.xcodeproj`. Если вы правили структуру папок через `project.yml`, перегенерируйте:

```bash
brew install xcodegen   # один раз
./setup.sh              # или: xcodegen generate
```

## Бэкенд для теста

На симуляторе в приложении укажите URL: `http://127.0.0.1:3000`

На реальном iPhone (тот же Wi‑Fi): `http://<IP_вашего_ПК>:3000`

Запуск BFF на Mac:

```bash
cd ../backend
npm install
cp .env.example .env
npm run dev
```

## Подробнее

- [PLAN-06: iOS — ограничения, Spotify, ShazamKit](../docs/PLAN-06-ios.md)
- [Корневой README](../README.md)
