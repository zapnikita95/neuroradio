#!/usr/bin/env bash
# Перегенерация MusicStory.xcodeproj из project.yml (обычно не нужно — .xcodeproj уже в git).
set -euo pipefail
cd "$(dirname "$0")"

if command -v xcodegen >/dev/null 2>&1; then
  xcodegen generate
  echo "Generated MusicStory.xcodeproj via XcodeGen"
else
  echo "XcodeGen не установлен. Это нормально — используйте готовый MusicStory.xcodeproj:"
  echo "  open MusicStory.xcodeproj"
  exit 0
fi
