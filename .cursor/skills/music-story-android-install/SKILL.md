---
name: music-story-android-install
description: >-
  Сборка и установка Music Story на Android: перед install всегда uninstall
  старой версии, APK в корне репо. Use when building APK, installing on device,
  adb install, deploy to phone, обновить приложение, поставить на телефон.
---

# Music Story — установка на Android

## Обязательный порядок

Перед **каждой** установкой на устройство — **сначала снести старое приложение**, потом ставить новое. Не делать `adb install -r` без uninstall.

```powershell
$adb = "C:\Users\1\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$pkg = "com.musicstory.app"
$apk = "c:\Users\1\OneDrive\Desktop\Music story\efir-ai.apk"

# 1. Устройство
& $adb devices

# 2. Удалить старую версию (Failure = не было установлено — ок)
& $adb uninstall $pkg

# 3. Собрать debug APK (если ещё не собран)
cd "c:\Users\1\OneDrive\Desktop\Music story\android"
.\gradlew assembleDebug

# 4. Чистая установка (без -r)
& $adb install $apk
```

Если несколько устройств — укажи `-s SERIAL` (например `2FK0224B15000211`).

## APK

| Сборка | Файл в корне репо |
|--------|-------------------|
| Debug (для телефона) | `MusicStory.apk` |
| Release | `MusicStory-release.apk` |

Gradle копирует APK в корень автоматически (`android/app/build.gradle.kts`, task `assembleDebug` / `assembleRelease`).

Пользователю указывай только **`MusicStory.apk`** в корне проекта.

## Пакет

- **applicationId:** `com.musicstory.app`

## Release vs debug

- На телефон для разработки — **`assembleDebug`** (подписан debug-ключом).
- `assembleRelease` без keystore не ставится — только debug для adb install.

## После установки

Кратко сообщи: версия из `android/app/build.gradle.kts` (`versionName`), что старое приложение удалено, путь `MusicStory.apk`.
