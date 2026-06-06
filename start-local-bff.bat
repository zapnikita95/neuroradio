@echo off
setlocal EnableExtensions
title Music Story local BFF
cd /d "%~dp0"

set LLM_PROVIDER=local
set PORT=3000
set NODE_ENV=development
set LOGDIR=%~dp0logs
set LOG=%LOGDIR%\local-bff.log
set LOCAL_LOG_FILE=%LOG%

if not exist "%LOGDIR%" mkdir "%LOGDIR%"

if not defined LOCAL_OLLAMA_BASE_URL set LOCAL_OLLAMA_BASE_URL=http://127.0.0.1:11435
if not defined LOCAL_OLLAMA_MODEL set LOCAL_OLLAMA_MODEL=qwen3.6:35b-a3b-q4_K_M

rem Local Silero TTS (PC only — not Railway)
if not defined SILERO_TTS_URL set SILERO_TTS_URL=http://127.0.0.1:8001
if not defined SILERO_TTS_VOICE set SILERO_TTS_VOICE=baya
set SILERO_TTS_ENABLED=true
set TTS_PREFER_SILERO=true
set SILERO_TTS_API=legacy

echo.
echo Music Story - local BFF
echo =======================
echo LLM_PROVIDER=%LLM_PROVIDER%
echo OLLAMA_URL=%LOCAL_OLLAMA_BASE_URL%
echo OLLAMA_MODEL=%LOCAL_OLLAMA_MODEL%
echo SILERO_TTS_URL=%SILERO_TTS_URL%  (run start-silero-tts.bat first)
echo PORT=%PORT%
echo LOG=%LOG%
echo.

netsh advfirewall firewall add rule name="MusicStory BFF TCP 3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1

echo === PHONE: set backend URL in app to one of these ===
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -match '^(10\.|192\.168\.|172\.)' } | ForEach-Object { Write-Host ('  http://' + $_.IPAddress + ':3000') }"
echo =====================================================
echo Ollama URL in app: http://127.0.0.1:11435
echo NOT railway.app when using Local provider!
echo.

for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr LISTENING') do (
  echo Stopping PID %%a on port %PORT%
  taskkill /PID %%a /F >nul 2>&1
)

curl.exe -s --max-time 8 "%LOCAL_OLLAMA_BASE_URL%/api/tags" >nul 2>&1
if errorlevel 1 (
  echo ERROR: Ollama not reachable at %LOCAL_OLLAMA_BASE_URL%
  goto fail
)
echo Ollama OK

curl.exe -s --max-time 5 "%SILERO_TTS_URL%/voices" >nul 2>&1
if errorlevel 1 (
  curl.exe -s --max-time 5 "%SILERO_TTS_URL%/tts/model" >nul 2>&1
  if errorlevel 1 (
    echo WARN: Silero not at %SILERO_TTS_URL% — run start-silero-tts.bat first
  ) else (
    echo Silero TTS OK ^(openai API^)
  )
) else (
  echo Silero TTS OK ^(legacy API^) — stories use local Russian voice
)

cd /d "%~dp0backend"
if not exist node_modules (
  call npm ci
  if errorlevel 1 goto fail
)

call npm run build
if errorlevel 1 goto fail

echo.
echo BFF http://0.0.0.0:%PORT%
echo Log file: %LOG%
echo Every phone request logs: [tcp] and [http] --^>
echo Ctrl+C to stop
echo.

echo ===== START %date% %time% =====>>"%LOG%"
node dist\index.js
set EXITCODE=%ERRORLEVEL%
echo ===== EXIT %EXITCODE% %date% %time% =====>>"%LOG%"
echo Server stopped code %EXITCODE%
pause
exit /b %EXITCODE%

:fail
echo START FAILED - see %LOG%
pause
exit /b 1
