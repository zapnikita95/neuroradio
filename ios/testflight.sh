#!/usr/bin/env bash
# Сборка для TestFlight: Release archive + export app-store IPA.
set -euo pipefail
cd "$(dirname "$0")"

TEAM_ID="${DEVELOPMENT_TEAM:-Y52BT2N4L8}"
SECRETS_FILE="Config/Secrets.xcconfig"

if [[ ! -f "$SECRETS_FILE" ]]; then
  if [[ -f "../.env" ]] && grep -q '^SPOTIFY_CLIENT_ID=' ../.env; then
    CID=$(grep '^SPOTIFY_CLIENT_ID=' ../.env | cut -d= -f2- | tr -d '\r')
    echo "SPOTIFY_CLIENT_ID = $CID" > "$SECRETS_FILE"
    echo "→ Spotify Client ID взят из ../.env"
  else
    echo "⚠️  $SECRETS_FILE не найден — Spotify не подключится у пользователей."
    echo "   cp Config/Secrets.xcconfig.example Config/Secrets.xcconfig"
    echo "   и вставьте Client ID из https://developer.spotify.com/dashboard"
  fi
fi

ARCHIVE_PATH="build/TestFlight.xcarchive"
EXPORT_PATH="build/testflight"
IPA_PATH="../EfirAI-TestFlight.ipa"

echo "→ Archive (Release, team $TEAM_ID)..."
xcodebuild archive \
  -project MusicStory.xcodeproj \
  -scheme MusicStory \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  -destination 'generic/platform=iOS' \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM_ID"

echo "→ Export IPA (app-store)..."
rm -rf "$EXPORT_PATH"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist ExportOptions-AppStore.plist \
  -allowProvisioningUpdates

IPA=$(find "$EXPORT_PATH" -maxdepth 1 -name '*.ipa' | head -1)
if [[ -z "$IPA" ]]; then
  echo "Ошибка: IPA не найден в $EXPORT_PATH"
  exit 1
fi

cp "$IPA" "$IPA_PATH"
echo ""
echo "✓ IPA: $(cd .. && pwd)/EfirAI-TestFlight.ipa"
