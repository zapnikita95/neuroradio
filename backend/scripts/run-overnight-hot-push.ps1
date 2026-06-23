# Overnight: fact-rich hot-push queue, then continues until --target facts (hot-target is milestone only).
# Survives Cursor close. Logs: backend/logs/hot-push.log, backend/logs/deezer-matrix.log
$ErrorActionPreference = 'Continue'
$Backend = Split-Path $PSScriptRoot -Parent
$LogDir = Join-Path $Backend 'logs'
$HotLog = Join-Path $LogDir 'hot-push.log'
$MatrixLog = Join-Path $LogDir 'deezer-matrix.log'
$HotPid = Join-Path $LogDir 'hot-push.pid'
$MatrixPid = Join-Path $LogDir 'deezer-matrix.pid'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log($path, $msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Add-Content -Path $path -Value $line -Encoding utf8
}

function Stop-ByPattern($pattern) {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like "*$pattern*" } |
        ForEach-Object {
            Log $HotLog "stop PID $($_.ProcessId) ($pattern)"
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

Log $HotLog '=== overnight start ==='
Stop-ByPattern 'bulk-seed-fact-bank.mjs'

Push-Location $Backend
try {
    Log $HotLog 'npm run build'
    npm run build *>> $HotLog 2>&1

    $hotArgs = @(
        'scripts/bulk-seed-fact-bank.mjs',
        '--hot-push',
        '--target=120000',
        '--hot-target=20000',
        '--concurrency=5',
        '--resume',
        '--no-backfill-lastfm'
    )
    Log $HotLog "start hot-push: $($hotArgs -join ' ')"
    $hot = Start-Process -FilePath 'node' `
        -ArgumentList $hotArgs `
        -WorkingDirectory $Backend `
        -RedirectStandardOutput $HotLog `
        -RedirectStandardError (Join-Path $LogDir 'hot-push.err.log') `
        -PassThru `
        -WindowStyle Hidden
    $hot.Id | Set-Content -Path $HotPid -Encoding ascii
    Log $HotLog "hot-push PID $($hot.Id)"

    $matrixRunning = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*build-genre-year-catalog.mjs*' }
    if (-not $matrixRunning) {
        $matrixArgs = @(
            'scripts/build-genre-year-catalog.mjs',
            '--matrix-only',
            '--tracks-per-cell=30',
            '--concurrency=4',
            '--no-proxy'
        )
        Log $MatrixLog "start matrix: $($matrixArgs -join ' ')"
        $mx = Start-Process -FilePath 'node' `
            -ArgumentList $matrixArgs `
            -WorkingDirectory $Backend `
            -RedirectStandardOutput $MatrixLog `
            -RedirectStandardError (Join-Path $LogDir 'deezer-matrix.err.log') `
            -PassThru `
            -WindowStyle Hidden
        $mx.Id | Set-Content -Path $MatrixPid -Encoding ascii
        Log $MatrixLog "matrix PID $($mx.Id)"
    } else {
        Log $MatrixLog "matrix already running PID $($matrixRunning.ProcessId -join ',')"
    }

    Log $HotLog '=== overnight launched ==='
    Write-Host "hot-push PID $($hot.Id) log=$HotLog"
    Write-Host "matrix log=$MatrixLog"
    Write-Host "status: cd backend; npm run seed:status"
} finally {
    Pop-Location
}
