@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Music Story — ALL-IN-ONE
cd /d "%~dp0"

set "ROOT=%~dp0"
set "LOGDIR=%ROOT%logs"
set "SCRIPTS=%ROOT%scripts"
set "PORT=3000"
set "SILERO_PORT=8001"
set "CONTAINER=music-story-silero"
set "CLOUDFLARED=%SCRIPTS%\cloudflared.exe"
set "NGROK=%SCRIPTS%\ngrok.exe"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"
if not exist "%SCRIPTS%" mkdir "%SCRIPTS%"

set LLM_PROVIDER=local
set NODE_ENV=development
set LOCAL_LOG_FILE=%LOGDIR%\local-bff.log
set LOCAL_OLLAMA_BASE_URL=http://127.0.0.1:11435
set LOCAL_OLLAMA_MODEL=qwen3.6:35b-a3b-q4_K_M
set SILERO_TTS_URL=http://127.0.0.1:%SILERO_PORT%
set SILERO_TTS_VOICE=baya
set SILERO_TTS_ENABLED=true
set TTS_PREFER_SILERO=true
set SILERO_TTS_API=legacy

echo.
echo  ============================================
echo   Music Story — один батник, всё сам
echo  ============================================
echo.

rem --- 1) Docker Desktop ---
call :ensure_docker
if errorlevel 1 goto fail

rem --- 2) Silero container ---
call :ensure_silero
if errorlevel 1 goto fail

rem --- 3) Ollama ---
curl.exe -s --max-time 8 "%LOCAL_OLLAMA_BASE_URL%/api/tags" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Ollama не отвечает на %LOCAL_OLLAMA_BASE_URL%
  echo         Запусти Ollama / ollama-queue-proxy и повтори.
  goto fail
)
echo [OK] Ollama

rem --- 4) Backend build ---
cd /d "%ROOT%backend"
if not exist node_modules call npm ci
call npm run build
if errorlevel 1 goto fail
cd /d "%ROOT%"

rem --- 5) Stop old BFF / tunnels ---
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq MusicStory-BFF*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq MusicStory-tunnel*" /F >nul 2>&1
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq cloudflared.exe" /FO LIST 2^>nul ^| findstr PID') do taskkill /PID %%a /F >nul 2>&1

netsh advfirewall firewall add rule name="MusicStory BFF TCP 3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1

rem --- 6) BFF in background ---
echo [..] Starting BFF on port %PORT%...
start "MusicStory-BFF" /min "%ROOT%scripts\run-local-bff.cmd"

set /a BFF_WAIT=0
:wait_bff
timeout /t 2 /nobreak >nul
curl.exe -s --max-time 3 http://127.0.0.1:%PORT%/health >nul 2>&1
if not errorlevel 1 goto bff_up
netstat -ano 2>nul | findstr ":%PORT% " | findstr LISTENING >nul 2>&1
if not errorlevel 1 goto bff_up
set /a BFF_WAIT+=1
if !BFF_WAIT! LSS 45 goto wait_bff
echo [ERROR] BFF не поднялся на :%PORT% — последние строки лога:
powershell -NoProfile -Command "Get-Content -LiteralPath '%LOCAL_LOG_FILE%' -Tail 25 -ErrorAction SilentlyContinue"
goto fail
:bff_up
echo [OK] BFF http://127.0.0.1:%PORT%

rem --- 7) Public tunnels (Railway + телефон с любой сети) ---
call :ensure_cloudflared
if errorlevel 1 (
  echo [WARN] Туннель не поднят — только Wi-Fi IP ниже
  set "SILERO_PUBLIC="
  set "BFF_PUBLIC="
  goto print_urls
)

del "%LOGDIR%\tunnel-silero.log" 2>nul
del "%LOGDIR%\tunnel-bff.log" 2>nul

start "MusicStory-tunnel-silero" /min cmd /c ""%CLOUDFLARED%" tunnel --url http://127.0.0.1:%SILERO_PORT% 1>>"%LOGDIR%\tunnel-silero.log" 2>&1"
start "MusicStory-tunnel-bff" /min cmd /c ""%CLOUDFLARED%" tunnel --url http://127.0.0.1:%PORT% 1>>"%LOGDIR%\tunnel-bff.log" 2>&1"

echo [..] Cloudflare tunnel — жди 15-40 сек...
call :wait_tunnel_url "%LOGDIR%\tunnel-silero.log" SILERO_PUBLIC 90
call :wait_tunnel_url "%LOGDIR%\tunnel-bff.log" BFF_PUBLIC 90

if defined SILERO_PUBLIC (
  echo [OK] Silero public: !SILERO_PUBLIC!
) else (
  echo [WARN] Silero tunnel URL не получен — см. %LOGDIR%\tunnel-silero.log
)
if defined BFF_PUBLIC (
  echo [OK] BFF public: !BFF_PUBLIC!
) else (
  echo [WARN] BFF tunnel URL не получен — см. %LOGDIR%\tunnel-bff.log
)

rem Save Railway env block
(
  echo # Paste into Railway Variables ^(production BFF^)
  echo SILERO_TTS_ENABLED=true
  echo TTS_PREFER_SILERO=true
  echo SILERO_TTS_API=legacy
  echo SILERO_TTS_VOICE=baya
  if defined SILERO_PUBLIC echo SILERO_TTS_URL=!SILERO_PUBLIC!
) > "%LOGDIR%\railway-silero.env.txt"

:print_urls
echo.
echo  ============================================
echo   ГОТОВО
echo  ============================================
echo.
if defined BFF_PUBLIC (
  echo  ТЕЛЕФОН ^(любая сеть^): backend URL в приложении
  echo    !BFF_PUBLIC!
  echo.
) else (
  echo  ТЕЛЕФОН ^(только Wi-Fi^):
  for /f "delims=" %%u in ('powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -match '^(10\\.|192\\.168\\.|172\\.)' } | ForEach-Object { 'http://' + $_.IPAddress + ':%PORT%' }"') do echo    %%u
  echo.
)
if defined SILERO_PUBLIC (
  echo  RAILWAY ^(Variables на production BFF^):
  echo    SILERO_TTS_ENABLED=true
  echo    TTS_PREFER_SILERO=true
  echo    SILERO_TTS_API=legacy
  echo    SILERO_TTS_URL=!SILERO_PUBLIC!
  echo.
  echo  Скопировано в: %LOGDIR%\railway-silero.env.txt
  echo  ^(URL меняется после каждого перезапуска батника^)
  echo.
)
echo  Silero локально: http://127.0.0.1:%SILERO_PORT%
echo  BFF лог: %LOCAL_LOG_FILE%
echo  Тест WAV: cd backend ^&^& set SILERO_TTS_API=legacy ^&^& node scripts/test-silero-tts.mjs
echo.
echo  Остановить всё: stop-music-story.bat
echo  ============================================
echo.
pause
exit /b 0

:fail
echo.
echo FAILED. Лог BFF: %LOCAL_LOG_FILE%
pause
exit /b 1

rem ============ functions ============

:ensure_docker
docker info >nul 2>&1
if not errorlevel 1 (
  echo [OK] Docker
  exit /b 0
)
echo [..] Docker не запущен — стартую Docker Desktop...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
  start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
) else if exist "%LocalAppData%\Docker\Docker Desktop.exe" (
  start "" "%LocalAppData%\Docker\Docker Desktop.exe"
) else (
  echo [ERROR] Docker Desktop не найден. Установи Docker Desktop.
  exit /b 1
)
set /a DW=0
:docker_wait
timeout /t 3 /nobreak >nul
docker info >nul 2>&1
if not errorlevel 1 (
  echo [OK] Docker
  exit /b 0
)
set /a DW+=1
if !DW! LSS 60 goto docker_wait
echo [ERROR] Docker не поднялся за 3 мин
exit /b 1

:ensure_silero
docker ps --filter "name=%CONTAINER%" --filter "status=running" -q 2>nul | findstr /r "." >nul 2>&1
if not errorlevel 1 (
  curl.exe -s --max-time 5 http://127.0.0.1:%SILERO_PORT%/voices >nul 2>&1
  if not errorlevel 1 (
    echo [OK] Silero ^(already running^)
    exit /b 0
  )
)
echo [..] Silero Docker...
docker rm -f %CONTAINER% >nul 2>&1
docker run -d --name %CONTAINER% -p %SILERO_PORT%:9898 -e LANGUAGE=ru -e NUMBER_OF_THREADS=4 -e SAMPLE_RATE=48000 navatusein/silero-tts-service:latest
if errorlevel 1 (
  echo [ERROR] docker run Silero failed
  exit /b 1
)
set /a SW=0
:silero_wait
timeout /t 5 /nobreak >nul
curl.exe -s --max-time 10 http://127.0.0.1:%SILERO_PORT%/voices >nul 2>&1
if not errorlevel 1 (
  echo [OK] Silero
  exit /b 0
)
set /a SW+=1
if !SW! LSS 36 goto silero_wait
echo [ERROR] Silero не ответил за 3 мин — docker logs %CONTAINER%
exit /b 1

:ensure_cloudflared
if exist "%CLOUDFLARED%" goto cf_ok
echo [..] Скачиваю cloudflared ^(туннель для Railway/телефона^)...
curl.exe -fsSL -o "%CLOUDFLARED%.tmp" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
if errorlevel 1 (
  echo [ERROR] Не скачал cloudflared. VPN/интернет?
  exit /b 1
)
move /y "%CLOUDFLARED%.tmp" "%CLOUDFLARED%" >nul
:cf_ok
echo [OK] cloudflared
exit /b 0

:wait_tunnel_url
set "_LOG=%~1"
set "_OUT=%~2"
set "_MAX=%~3"
set /a _TW=0
:_tw_loop
if exist "!_LOG!" (
  for /f "delims=" %%u in ('powershell -NoProfile -Command "$t=Get-Content -LiteralPath '!_LOG!' -ErrorAction SilentlyContinue -Raw; if($t -match '(https://[a-z0-9-]+\.trycloudflare\.com)'){ $matches[1] }"') do (
    set "%_OUT%=%%u"
  )
)
call set "_VAL=%%!_OUT!%%"
if not "!_VAL!"=="" exit /b 0
timeout /t 2 /nobreak >nul
set /a _TW+=1
if !_TW! LSS !_MAX! goto _tw_loop
exit /b 1
