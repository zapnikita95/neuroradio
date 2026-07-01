# YouTube harvest batch — скрытый процесс, лог в backend/logs/youtube-harvest.log
param(
    [ValidateSet('from-queue', 'retry')]
    [string]$Mode = 'from-queue'
)

$ErrorActionPreference = 'Stop'
$Backend = Split-Path $PSScriptRoot -Parent
$LogDir = Join-Path $Backend 'logs'
$LogFile = Join-Path $LogDir 'youtube-harvest.log'
$ErrFile = Join-Path $LogDir 'youtube-harvest.err.log'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Get-YoutubeHarvestProcs {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like '*youtube-harvest-batch.mjs*' }
}

$existing = Get-YoutubeHarvestProcs
if ($existing) {
    Write-Host "youtube-harvest already running: PID $($existing.ProcessId -join ', ')"
    Write-Host "Log: $LogFile"
    exit 0
}

$batchArg = if ($Mode -eq 'retry') { '--retry-only' } else { '--from-queue' }

Push-Location $Backend
try {
    npm run build 2>&1 | Tee-Object -FilePath $LogFile -Append | Out-Null
    $nodeArgs = @('scripts/youtube-harvest-batch.mjs', $batchArg)
    $proc = Start-Process -FilePath 'node' `
        -ArgumentList $nodeArgs `
        -WorkingDirectory $Backend `
        -RedirectStandardOutput $LogFile `
        -RedirectStandardError $ErrFile `
        -PassThru `
        -WindowStyle Hidden
    Write-Host "youtube-harvest started PID $($proc.Id) mode=$Mode"
    Write-Host "Log: $LogFile"
} finally {
    Pop-Location
}
