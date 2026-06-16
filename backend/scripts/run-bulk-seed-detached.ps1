# Запуск bulk-seed ВНЕ Cursor — переживает закрытие IDE и сон ПК (пока Windows не убьёт node).
# Лог: backend/logs/bulk-seed.log
# Статус: backend/data/bulk-seed-progress.json (каждые 10 треков)
param(
    [switch]$StopExisting
)

$ErrorActionPreference = 'Stop'
$Backend = Split-Path $PSScriptRoot -Parent
$LogDir = Join-Path $Backend 'logs'
$LogFile = Join-Path $LogDir 'bulk-seed.log'
$PidFile = Join-Path $LogDir 'bulk-seed.pid'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Get-BulkSeedProcs {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like '*bulk-seed-fact-bank.mjs*' }
}

if ($StopExisting) {
    foreach ($p in Get-BulkSeedProcs) {
        Write-Host "Stopping PID $($p.ProcessId)"
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $PidFile) { Remove-Item $PidFile -Force }
    exit 0
}

$existing = Get-BulkSeedProcs
if ($existing) {
    Write-Host "bulk-seed already running: PID $($existing.ProcessId -join ', ')"
    Write-Host "Log: $LogFile"
    exit 0
}

Push-Location $Backend
try {
    npm run build 2>&1 | Tee-Object -FilePath $LogFile -Append | Out-Null
    $nodeArgs = @(
        'scripts/bulk-seed-fact-bank.mjs',
        '--target=60000',
        '--hot-target=20000',
        '--concurrency=3',
        '--resume',
        '--no-proxy',
        '--backfill-discogs'
    )
    $proc = Start-Process -FilePath 'node' `
        -ArgumentList $nodeArgs `
        -WorkingDirectory $Backend `
        -RedirectStandardOutput $LogFile `
        -RedirectStandardError (Join-Path $LogDir 'bulk-seed.err.log') `
        -PassThru `
        -WindowStyle Hidden
    $proc.Id | Set-Content -Path $PidFile -Encoding ascii
    Write-Host "bulk-seed started PID $($proc.Id)"
    Write-Host "Log: $LogFile"
    Write-Host "Tail: Get-Content '$LogFile' -Wait -Tail 30"
} finally {
    Pop-Location
}
