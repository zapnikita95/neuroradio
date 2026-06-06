@echo off
setlocal EnableExtensions
title Music Story - Silero TTS
cd /d "%~dp0"

set SILERO_PORT=8001
set CONTAINER=music-story-silero

echo.
echo Silero TTS (local Russian v5_ru)
echo =================================
echo API: http://127.0.0.1:%SILERO_PORT%
echo.

docker info >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker Desktop not running.
  echo Or: pip install silero-api-server ^&^& python -m silero_api_server --port %SILERO_PORT%
  goto fail
)

docker rm -f %CONTAINER% >nul 2>&1

echo Starting navatusein/silero-tts-service ...
docker run -d --name %CONTAINER% -p %SILERO_PORT%:9898 ^
  -e LANGUAGE=ru -e NUMBER_OF_THREADS=4 -e SAMPLE_RATE=48000 ^
  --restart unless-stopped navatusein/silero-tts-service:latest
if errorlevel 1 goto fail

echo Waiting for model load (30-90 sec first time)...
set /a N=0
:wait_loop
timeout /t 5 /nobreak >nul
curl.exe -s --max-time 10 http://127.0.0.1:%SILERO_PORT%/voices >nul 2>&1
if not errorlevel 1 goto ok
set /a N+=1
if %N% LSS 24 goto wait_loop
echo WARN: still loading — check docker logs %CONTAINER%

:ok
echo.
echo Silero ready (legacy API). Set in BFF:
echo   SILERO_TTS_URL=http://127.0.0.1:%SILERO_PORT%
echo   SILERO_TTS_API=legacy
echo.
echo Test: cd backend ^&^& set SILERO_TTS_API=legacy^&^& node scripts/test-silero-tts.mjs
echo.
pause
exit /b 0

:fail
pause
exit /b 1
