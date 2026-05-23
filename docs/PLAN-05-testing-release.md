# PLAN-05 — Testing & Release

## Цель

Стабильный MVP для Spotify + Яндекс Музыка, готовый debug APK, подготовка к Play Store.

## Device matrix

| Android | Приоритет |
|---------|-----------|
| 11 (API 30) | Smoke |
| 13 (API 33) | Restricted settings |
| 14–15 (API 34–35) | Primary target |

## Streaming apps (MVP)

- [x] Spotify (`com.spotify.music`)
- [x] Яндекс Музыка (`ru.yandex.music`, `com.yandex.music`)
- [ ] YouTube Music (v1.1)
- [ ] Apple Music (v1.1)

## Test cases

### Media detection
- [ ] Metadata при play/skip/next
- [ ] Приоритет Spotify над Яндекс
- [ ] Без notification access → onboarding

### Story playback
- [ ] Pause/resume roundtrip
- [ ] Story duration ~27–33 сек (server) или TTS fallback
- [ ] Manual via UI button
- [ ] Manual via notification action
- [ ] Stop story → resume music

### Triggers
- [ ] Every N tracks (N=3 для теста)
- [ ] Manual mode — auto отключён
- [ ] Offline cache fallback

### Backend
- [ ] Demo mode (no keys) → TTS
- [ ] Full mode → ExoPlayer audio
- [ ] Wrong URL → local fallback, no crash

## Сборка APK

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"
cd android
.\gradlew.bat assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

```powershell
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Логи

```bash
adb logcat -s MusicStory
```

## Play Store prep (v1)

- [ ] Privacy Policy (notification access justification)
- [ ] Data Safety form
- [ ] App Check
- [ ] Foreground service `specialUse` declaration
- [ ] Скриншоты, описание «нейрорадио о вашей музыке»

## Известные риски

| Риск | Митигация |
|------|-----------|
| YT Music не pause | Manual mode; retry |
| Год не найден | LLM fallback decade |
| GROQ 429 | Backend queue + backoff |
| Play Store rejection | Чёткий UX onboarding |
| APK Restricted Settings | Пошаговая инструкция |

## Regression loop

1. `./gradlew assembleDebug`
2. `adb install -r`
3. Spotify play → metadata
4. Manual story → TTS/audio
5. Every N auto trigger
6. Fix → repeat

## Release checklist

- [ ] `assembleDebug` green
- [ ] Smoke on emulator (10.0.2.2 backend)
- [ ] Smoke on real device (Wi‑Fi IP)
- [ ] Spotify + Яндекс verified
- [ ] README/docs updated
