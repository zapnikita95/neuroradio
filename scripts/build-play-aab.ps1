# Release AAB for Google Play + RuStore -> repo root:
#   efir-ai.aab         (Play Console)
#   efir-ai-rustore.aab (RuStore, same signed bundle)
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

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$gradle = Join-Path $root "android\app\build.gradle.kts"
$androidDir = Join-Path $root "android"

if ($PSScriptRoot -match "movieplanner") {
    throw "Wrong script folder (movieplanner). Use Music story\scripts\build-play-aab.ps1"
}

if (-not (Test-Path $gradle)) {
    throw "Not Music Story repo: missing $gradle"
}

$gradleText = Get-Content $gradle -Raw -Encoding UTF8
if ($gradleText -notmatch "com\.efirai\.myapp") {
    throw "Not Music Story android project (expected com.efirai.myapp)"
}

if (-not (Test-Path (Join-Path $androidDir "keystore.properties"))) {
    throw "Missing android/keystore.properties - see android/PLAY_SIGNING.local.md"
}

function Ensure-AndroidSdk {
    param([string]$ProjectRoot)
    $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    if (-not (Test-Path $sdk)) {
        throw "Android SDK not found: $sdk"
    }
    $localProps = Join-Path $ProjectRoot "android\local.properties"
    $line = "sdk.dir=" + ($sdk -replace "\\", "/")
    Set-Content -Path $localProps -Value $line -Encoding ASCII
}

function Get-GradleVersion {
    param([string]$Path)
    $text = Get-Content $Path -Raw -Encoding UTF8
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

function Bump-VersionName {
    param([string]$Name)
    if ($Name -match '^(\d+)\.(\d+)\.(\d+)$') {
        $patch = [int]$Matches[3] + 1
        return "$($Matches[1]).$($Matches[2]).$patch"
    }
    if ($Name -match '^(\d+)\.(\d+)$') {
        $minor = [int]$Matches[2] + 1
        return "$($Matches[1]).$minor"
    }
    return "$Name.1"
}

function Set-GradleVersion {
    param([string]$Path, [string]$Text, [int]$Code, [string]$Name)
    $Text = [regex]::Replace($Text, 'versionCode\s*=\s*\d+', "versionCode = $Code")
    $Text = [regex]::Replace($Text, 'versionName\s*=\s*"[^"]*"', "versionName = `"$Name`"")
    Set-Content -Path $Path -Value $Text -Encoding UTF8 -NoNewline
}

function Sync-ToStaging {
    param([string]$Src, [string]$Dst)
    Write-Host "OneDrive detected - staging build to $Dst"
    New-Item -ItemType Directory -Force -Path $Dst | Out-Null
    & robocopy $Src $Dst /MIR /XJ /XD ".git" ".gradle" "android\.gradle" /XF "*.aab" "*.apk" /NFL /NDL /NJH /NJS /NP /R:2 /W:2 | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy staging failed with exit code $LASTEXITCODE"
    }
}

function Stop-GradleDaemons {
    param([string]$AndroidRoot)
    Push-Location $AndroidRoot
    try {
        if (Test-Path ".\gradlew.bat") {
            & .\gradlew.bat --stop 2>$null | Out-Null
        }
    } catch {
        # ignore
    } finally {
        Pop-Location
    }
    Start-Sleep -Seconds 2
}

function Invoke-GradleBundle {
    param([string]$AndroidRoot, [string]$BuildDir)
    $env:MUSIC_STORY_BUILD_DIR = $BuildDir
    Stop-GradleDaemons $AndroidRoot
    if (Test-Path $BuildDir) {
        Remove-Item -Recurse -Force $BuildDir -ErrorAction SilentlyContinue
    }
    Push-Location $AndroidRoot
    try {
        if (-not (Test-Path ".\gradlew.bat")) {
            throw "gradlew.bat not found in $AndroidRoot"
        }
        Write-Host "Gradle bundleRelease (Music Story)..."
        Write-Host "  build dir: $BuildDir"
        & .\gradlew.bat bundleRelease --no-daemon
        if ($LASTEXITCODE -ne 0) {
            Write-Host ""
            Write-Host "bundleRelease failed - stopping daemons and retrying once..." -ForegroundColor Yellow
            Stop-GradleDaemons $AndroidRoot
            if (Test-Path $BuildDir) {
                Remove-Item -Recurse -Force $BuildDir -ErrorAction SilentlyContinue
            }
            Start-Sleep -Seconds 2
            & .\gradlew.bat bundleRelease --no-daemon --stacktrace
            if ($LASTEXITCODE -ne 0) {
                throw "gradlew bundleRelease failed with exit code $LASTEXITCODE"
            }
        }
    } finally {
        Pop-Location
    }
}

$ver = Get-GradleVersion $gradle
if ($SkipBump) {
    $newCode = $ver.Code
    $newName = $ver.Name
    Write-Host "Build without version bump: versionCode=$newCode versionName=$newName"
} else {
    $newCode = $ver.Code + 1
    $newName = Bump-VersionName $ver.Name
    Set-GradleVersion $gradle $ver.Text $newCode $newName
    Write-Host "Version: $($ver.Code) ($($ver.Name)) -> $newCode ($newName)"
}

$stagingDefault = "C:\efir-ai-aab-build"
$useStaging = $root -match "OneDrive"
$buildRoot = $root

if ($useStaging) {
    Sync-ToStaging $root $stagingDefault
    $buildRoot = $stagingDefault
}

Ensure-AndroidSdk $buildRoot
$env:GRADLE_USER_HOME = Join-Path $env:LOCALAPPDATA "MusicStoryGradle"
$buildDir = Join-Path $buildRoot ".gradle-build\app"

Invoke-GradleBundle (Join-Path $buildRoot "android") $buildDir

$builtAab = Join-Path $buildRoot "efir-ai.aab"
if (-not (Test-Path $builtAab)) {
    throw "Build finished but efir-ai.aab not found at $builtAab"
}

$playOut = Join-Path $root "efir-ai.aab"
$rustoreOut = Join-Path $root "efir-ai-rustore.aab"
Copy-Item -Force $builtAab $playOut
Copy-Item -Force $builtAab $rustoreOut

$info = Get-Item $playOut
Write-Host ""
Write-Host "Done (Music Story / Efir AI):"
Write-Host "  Play:    $playOut"
Write-Host "  RuStore: $rustoreOut"
Write-Host "  versionCode=$newCode  versionName=$newName"
Write-Host "  size: $([math]::Round($info.Length / 1MB, 2)) MB"
Write-Host ""
Write-Host "Upload efir-ai.aab to Google Play (versionCode $newCode)."
Write-Host "Upload efir-ai-rustore.aab to RuStore (same bundle, same signing)."
