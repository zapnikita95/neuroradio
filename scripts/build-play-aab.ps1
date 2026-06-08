# Release AAB для Google Play → корень репо: efir-ai.aab
# Требует android/keystore.properties + upload.keystore
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$gradle = Join-Path $root "android\app\build.gradle.kts"

if (-not (Test-Path "$root\android\keystore.properties")) {
    Write-Error "Нет android/keystore.properties — см. android/PLAY_SIGNING.local.md"
}

function Get-GradleVersion {
    $text = Get-Content $gradle -Raw
    $code = if ($text -match 'versionCode\s*=\s*(\d+)') { [int]$Matches[1] } else { 0 }
    $name = if ($text -match 'versionName\s*=\s*"([^"]+)"') { $Matches[1] } else { "?" }
    return @{ Code = $code; Name = $name }
}

$ver = Get-GradleVersion
Write-Host "Сборка AAB: versionCode=$($ver.Code) versionName=$($ver.Name)"

Push-Location "$root\android"
try {
    .\gradlew bundleRelease --quiet
    $aab = Join-Path $root "efir-ai.aab"
    if (-not (Test-Path $aab)) {
        Write-Error "Сборка прошла, но efir-ai.aab не найден в корне"
    }
    $info = Get-Item $aab
    Write-Host ""
    Write-Host "Готово: $aab"
    Write-Host "  versionCode=$($ver.Code)  versionName=$($ver.Name)"
    Write-Host "  размер: $([math]::Round($info.Length / 1MB, 2)) MB  время: $($info.LastWriteTime)"
    Write-Host ""
    Write-Host "Загружай ТОЛЬКО этот файл в Play Console (не старые копии из Downloads)."
} finally {
    Pop-Location
}
