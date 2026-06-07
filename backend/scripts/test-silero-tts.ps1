# PowerShell wrapper for Silero TTS smoke test (local Docker on :8001).
# Usage:
#   cd backend
#   .\scripts\test-silero-tts.ps1
#   $env:SILERO_TTS_API = 'legacy'; .\scripts\test-silero-tts.ps1

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not $env:SILERO_TTS_URL) {
  $env:SILERO_TTS_URL = 'http://127.0.0.1:8001'
}
if (-not $env:SILERO_TTS_API) {
  $env:SILERO_TTS_API = 'legacy'
}

Write-Host "[silero-test] SILERO_TTS_URL=$($env:SILERO_TTS_URL) API=$($env:SILERO_TTS_API)"

npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node scripts/test-silero-tts.mjs
exit $LASTEXITCODE
