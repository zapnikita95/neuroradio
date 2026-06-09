# Release AAB for Google Play -> repo root: efir-ai.aab
# Auto +1 versionCode and patch versionName before each build.
#
# Usage (from repo root):
#   .\scripts\build-play-aab.ps1
# Rebuild without bumping version:
#   .\scripts\build-play-aab.ps1 -SkipBump
param(
    [switch]$SkipBump
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$gradle = Join-Path $root "android\app\build.gradle.kts"

if (-not (Test-Path "$root\android\keystore.properties")) {
    Write-Error "Missing android/keystore.properties - see android/PLAY_SIGNING.local.md"
}

function Get-GradleVersion {
    $text = Get-Content $gradle -Raw -Encoding UTF8
    $code = 0
    if ($text -match 'versionCode\s*=\s*(\d+)') {
        $code = [int]$Matches[1]
    }
    $name = "1.0.0"
    $nameMatch = [regex]::Match($text, 'versionName\s*=\s*"([^"]+)"')
    if ($nameMatch.Success) {
        $name = $nameMatch.Groups[1].Value
    }
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
    Write-Host "Build without version bump: versionCode=$newCode versionName=$newName"
} else {
    $newCode = $ver.Code + 1
    $newName = Bump-VersionName $ver.Name
    Set-GradleVersion $ver.Text $newCode $newName
    Write-Host "Version: $($ver.Code) ($($ver.Name)) -> $newCode ($newName)"
}

Push-Location "$root\android"
try {
    Write-Host "Gradle bundleRelease..."
    .\gradlew bundleRelease --quiet
    if ($LASTEXITCODE -ne 0) {
        throw "gradlew bundleRelease failed with exit code $LASTEXITCODE"
    }

    $aab = Join-Path $root "efir-ai.aab"
    if (-not (Test-Path $aab)) {
        Write-Error "Build finished but efir-ai.aab not found in repo root"
    }

    $info = Get-Item $aab
    Write-Host ""
    Write-Host "Done: $aab"
    Write-Host "  versionCode=$newCode  versionName=$newName"
    Write-Host "  size: $([math]::Round($info.Length / 1MB, 2)) MB"
    Write-Host ""
    Write-Host "Upload ONLY this file to Play Console (versionCode $newCode)."
} finally {
    Pop-Location
}
