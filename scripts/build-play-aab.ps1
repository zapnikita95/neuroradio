# Release AAB для Google Play → корень репо: efir-ai.aab
# Требует android/keystore.properties + upload.keystore
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path "$root\android\keystore.properties")) {
    Write-Error "Нет android/keystore.properties — см. android/PLAY_SIGNING.local.md"
}
Push-Location "$root\android"
try {
    .\gradlew bundleRelease
    if (-not (Test-Path "$root\efir-ai.aab")) {
        Write-Error "Сборка прошла, но efir-ai.aab не найден в корне"
    }
    Write-Host "Готово: $root\efir-ai.aab"
} finally {
    Pop-Location
}
