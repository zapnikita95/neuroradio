# Создаёт upload.keystore для Google Play (подпись AAB при загрузке).
# Google Play App Signing: в консоли выбери «Разрешите Google защищать ключ» (рекомендуется).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$ksDir = Join-Path $root "android\app\keystore"
$ksPath = Join-Path $ksDir "upload.keystore"
$propsPath = Join-Path $root "android\keystore.properties"

if (Test-Path $ksPath) {
  Write-Host "Keystore уже есть: $ksPath"
  exit 0
}

New-Item -ItemType Directory -Force -Path $ksDir | Out-Null

$storePass = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
$keyPass = $storePass

$dname = "CN=Efir AI, OU=Mobile, O=Efir AI, L=Moscow, ST=Moscow, C=RU"
$keytool = "keytool"
if ($env:JAVA_HOME) {
  $candidate = Join-Path $env:JAVA_HOME "bin\keytool.exe"
  if (Test-Path $candidate) { $keytool = $candidate }
}

& $keytool -genkeypair -v -storetype PKCS12 -keystore $ksPath -alias efir-upload `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -storepass $storePass -keypass $keyPass -dname $dname

@"
storeFile=keystore/upload.keystore
storePassword=$storePass
keyAlias=efir-upload
keyPassword=$keyPass
"@ | Set-Content -Path $propsPath -Encoding UTF8

$localDoc = Join-Path $root "android\PLAY_SIGNING.local.md"
@"
# Upload keystore (локально, не в git)

| Поле | Значение |
|------|----------|
| Файл | android/app/keystore/upload.keystore |
| Alias | efir-upload |
| Store password | $storePass |
| Key password | $keyPass |

**Сохрани этот файл в надёжное место** (менеджер паролей / облако). Без keystore нельзя обновлять приложение в Play.

Fingerprint SHA-256 (для Railway ALLOWED_CERT_SHA256 — upload cert, после первой загрузки смотри также App signing в Play Console):

``````
$( & $keytool -list -v -keystore $ksPath -alias efir-upload -storepass $storePass 2>$null | Select-String "SHA256:" | ForEach-Object { $_.Line.Trim() } )
``````
"@ | Set-Content -Path $localDoc -Encoding UTF8

Write-Host "OK: $ksPath"
Write-Host "Пароли записаны в android/keystore.properties и android/PLAY_SIGNING.local.md"
