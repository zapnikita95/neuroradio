# Deezer genre×year matrix → merge catalog → restart bulk-seed (survives Cursor close).
# Log: backend/logs/deezer-matrix-pipeline.log + backend/logs/bulk-seed.log
param([switch]$MatrixOnly)

$ErrorActionPreference = 'Continue'
$Backend = Split-Path $PSScriptRoot -Parent
$LogDir = Join-Path $Backend 'logs'
$PipelineLog = Join-Path $LogDir 'deezer-matrix-pipeline.log'
$BulkLog = Join-Path $LogDir 'bulk-seed.log'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Add-Content -Path $PipelineLog -Value $line -Encoding utf8
    Write-Host $line
}

function Stop-BulkSeed {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like '*bulk-seed-fact-bank.mjs*' } |
        ForEach-Object {
            Log "Stopping bulk-seed PID $($_.ProcessId)"
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

Log '=== pipeline start ==='
Stop-BulkSeed

Push-Location $Backend
try {
    Log 'Building Deezer genre×year matrix (merge into catalog)…'
    $matrixArgs = @(
        'scripts/build-genre-year-catalog.mjs',
        '--matrix-only',
        '--tracks-per-cell=30',
        '--concurrency=5',
        '--no-proxy'
    )
    & node @matrixArgs 2>&1 | Tee-Object -FilePath $PipelineLog -Append
    if ($LASTEXITCODE -ne 0) {
        Log "MATRIX FAILED exit=$LASTEXITCODE"
        exit $LASTEXITCODE
    }

    Log 'npm run build (copy catalog to dist)…'
    npm run build 2>&1 | Tee-Object -FilePath $PipelineLog -Append

    Log 'Starting bulk-seed…'
    Stop-BulkSeed
    $seedArgs = @(
        'scripts/bulk-seed-fact-bank.mjs',
        '--target=60000',
        '--hot-target=20000',
        '--concurrency=3',
        '--resume',
        '--no-proxy',
        '--backfill-discogs'
    )
    $p = Start-Process -FilePath 'node' `
        -ArgumentList $seedArgs `
        -WorkingDirectory $Backend `
        -RedirectStandardOutput $BulkLog `
        -RedirectStandardError $BulkLog `
        -PassThru `
        -WindowStyle Hidden
    $p.Id | Set-Content -Path (Join-Path $LogDir 'bulk-seed.pid') -Encoding ascii
    Log "bulk-seed started PID $($p.Id) log=$BulkLog"
    Log '=== pipeline done ==='
} finally {
    Pop-Location
}
