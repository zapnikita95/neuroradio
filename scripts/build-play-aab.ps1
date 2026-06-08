# Release AAB для Google Play → корень репо: efir-ai.aab
# Автоматически +1 versionCode и patch в versionName перед каждой сборкой.
#
# Использование (из корня репо):
#   .\scripts\build-play-aab.ps1
# или:
#   powershell -ExecutionPolicy Bypass -File ".\scripts\build-play-aab.ps1"
#
# Пересобрать без смены версии:
#   .\scripts\build-play-aab.ps1 -SkipBump
param(
    [switch]$SkipBump
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$gradle = Join-Path $root "android\app\build.gradle.kts"

if (-not (Test-Path "$root\android\keystore.properties")) {
    Write-Error "Нет android/keystore.properties — см. android/PLAY_SIGNING.local.md"
}

function Get-GradleVersion {
    $text = Get-Content $gradle -Raw -Encoding UTF8
    $code = if ($text -match 'versionCode\s*=\s*(\d+)') { [int]$Matches[1] } else { 0 }
    $name = if ($text -match 'versionName\s*=\s*"([^"]+)"') { $Matches[1] } else { "1.0.0" }
    return @{ Text = $text; Code = $code; Name = $name }
}

function Bump-VersionName([string]$name) {
    if ($name -match '^(\d+)\.(\d+)\.(\d+)$') {
        $patch = [int]$Matches[3] + 1
        return "$($Matches[1]).$($Matches[2]).$patch"
    }
    if ($name -match '^(\d+)\.(\d+)$') {
        $minor = [int]$Matches[2] + 1
        return "$($Matches[1]).$minor"
    }
    return "$name.1"
}

function Set-GradleVersion([string]$text, [int]$code, [string]$name) {
    $text = [regex]::Replace($text, 'versionCode\s*=\s*\d+', "versionCode = $code")
    $text = [regex]::Replace($text, 'versionName\s*=\s*"[^"]*"', "versionName = `"$name`"")
    Set-Content -Path $gradle -Value $text -Encoding UTF8 -NoNewline
}

$ver = Get-GradleVersion
if ($SkipBump) {
    $newCode = $ver.Code
    $newName = $ver.Name
    Write-Host "Сборка без смены версии: versionCode=$newCode versionName=$newName"
} else {
    $newCode = $ver.Code + 1
    $newName = Bump-VersionName $ver.Name
    Set-GradleVersion $ver.Text $newCode $newName
    Write-Host "Версия: $($ver.Code) ($($ver.Name)) -> $newCode ($newName)"
}

Push-Location "$root\android"
try {
    Write-Host "Gradle bundleRelease..."
    .\gradlew bundleRelease --quiet
    if ($LASTEXITCODE -ne 0) {
        throw "gradlew bundleRelease завершился с кодом $LASTEXITCODE"
    }

    $aab = Join-Path $root "efir-ai.aab"
    if (-not (Test-Path $aab)) {
        Write-Error "Сборка прошла, но efir-ai.aab не найден в корне"
    }

    $info = Get-Item $aab
    Write-Host ""
    Write-Host "Готово: $aab"
    Write-Host "  versionCode=$newCode  versionName=$newName"
    Write-Host "  размер: $([math]::Round($info.Length / 1MB, 2)) MB"
    Write-Host ""
    Write-Host "Загружай в Play Console ТОЛЬКО этот файл (versionCode $newCode)."
} finally {
    Pop-Location
}
