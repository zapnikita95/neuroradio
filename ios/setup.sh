#!/usr/bin/env bash
# Подготовка iOS-проекта на Mac после git clone.
set -euo pipefail
cd "$(dirname "$0")"

echo "=== Music Story iOS setup ==="

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "Ошибка: установите Xcode из App Store и выполните: xcode-select --install"
  exit 1
fi

if [[ -d "MusicStory.xcodeproj" ]]; then
  echo "✓ MusicStory.xcodeproj найден — можно открывать в Xcode"
else
  echo "MusicStory.xcodeproj не найден, генерирую через XcodeGen..."
  if ! command -v xcodegen >/dev/null 2>&1; then
    echo "Установите XcodeGen: brew install xcodegen"
    exit 1
  fi
  xcodegen generate
  echo "✓ Проект сгенерирован"
fi

echo ""
echo "Дальше:"
echo "  open MusicStory.xcodeproj"
echo "  → Signing & Capabilities → выберите Team"
echo "  → Product → Run (⌘R)"
echo ""
echo "Или сборка из терминала:"
echo "  ./build.sh"
