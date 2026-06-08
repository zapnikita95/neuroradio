# Spotify Developer Dashboard — что указать

## Обязательно для iOS

| Поле | Значение |
|------|----------|
| App name | **Efir AI** |
| Website | `https://www.efir-ai.ru` |
| Redirect URI | **`efirai://spotify-callback`** |
| Which API/SDKs | **iOS** ✓ |

## iOS app bundles

| Поле | Значение |
|------|----------|
| Bundle ID | **`com.efirai.myapp`** |

(тот же, что Android / Play Store)

## Android packages — нужен только если включили Android SDK

Если в Spotify отмечен только **iOS**, блок **Android packages можно не заполнять**.

Если Android SDK включён:

| Поле | Значение |
|------|----------|
| Package name | **`com.efirai.myapp`** |
| Package SHA1 fingerprint | см. ниже |

### Почему «Enter a valid fingerprint»?

Spotify ждёт **SHA-1** (20 байт, формат `AA:BB:CC:…`), **не SHA-256** и не случайную строку.

**Debug-сборка** (локальный APK):

```
F0:B0:FE:A8:A4:4C:CC:8C:AA:A5:94:51:91:57:74:CD:2B:49:42:1E
```

**Upload-ключ** (release AAB, подписанный upload.keystore):

```
B6:05:07:AB:28:3A:20:2E:3B:A7:5B:79:F1:4B:C2:F3:04:1E:74:76
```

**После публикации в Play** Google может переподписывать AAB своим ключом. Тогда добавьте **ещё один** SHA-1:

Play Console → **Настройка → Целостность приложения → Подписание приложений** → **Сертификат ключа подписи приложения** → SHA-1.

Можно добавить **несколько** отпечатков (debug + upload + Google Play).

### Как получить SHA-1 самому

```powershell
keytool -list -v -keystore android\app\keystore\debug.keystore -storepass android
```

Для upload-ключа — пароль из локального `android/keystore.properties` (не в git).
