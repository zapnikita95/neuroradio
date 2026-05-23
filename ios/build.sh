#!/usr/bin/env bash
# Сборка iOS-приложения из терминала (симулятор).
set -euo pipefail
cd "$(dirname "$0")"

SCHEME="MusicStory"
PROJECT="MusicStory.xcodeproj"
CONFIG="${1:-Debug}"

if [[ ! -d "$PROJECT" ]]; then
  echo "Нет $PROJECT — запустите сначала: ./setup.sh"
  exit 1
fi

# Первый доступный iPhone Simulator
DEST=$(xcodebuild -project "$PROJECT" -scheme "$SCHEME" -showdestinations 2>/dev/null \
  | grep "platform:iOS Simulator" | grep "iPhone" | head -1 \
  | sed -n 's/.*id:\([^,]*\).*/\1/p' | tr -d ' ')

if [[ -z "$DEST" ]]; then
  DEST="platform=iOS Simulator,name=iPhone 16"
  echo "Использую destination: $DEST"
else
  DEST="id=$DEST"
  echo "Simulator: $DEST"
fi

echo "Сборка $SCHEME ($CONFIG)..."
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -destination "$DEST" \
  -configuration "$CONFIG" \
  -derivedDataPath build/DerivedData \
  build

APP="build/DerivedData/Build/Products/${CONFIG}-iphonesimulator/MusicStory.app"
if [[ -d "$APP" ]]; then
  echo ""
  echo "✓ Собрано: $APP"
  echo "  Установка в booted simulator:"
  echo "  xcrun simctl install booted \"$APP\""
  echo "  xcrun simctl launch booted com.musicstory.app"
fi
