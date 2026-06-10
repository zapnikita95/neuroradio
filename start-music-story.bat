@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Music Story — ALL-IN-ONE
cd /d "%~dp0"

set "ROOT=%~dp0"
set "LOGDIR=%ROOT%logs"
set "SCRIPTS=%ROOT%scripts"
set "PORT=3000"
set "CLOUDFLARED=%SCRIPTS%\cloudflared.exe"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"
if not exist "%SCRIPTS%" mkdir "%SCRIPTS%"

set LLM_PROVIDER=local
set NODE_ENV=development
set LOCAL_LOG_FILE=%LOGDIR%\local-bff.log
set LOCAL_OLLAMA_BASE_URL=http://127.0.0.1:11435
set LOCAL_OLLAMA_MODEL=qwen3.6:35b-a3b-q4_K_M

echo.
echo  ============================================
echo   Music Story — один батник, всё сам
echo  ============================================
echo.

rem --- 1) Ollama ---
curl.exe -s --max-time 8 "%LOCAL_OLLAMA_BASE_URL%/api/tags" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Ollama не отвечает на %LOCAL_OLLAMA_BASE_URL%
  echo         Запусти Ollama / ollama-queue-proxy и повтори.
  goto fail
)
echo [OK] Ollama

rem --- 2) Backend build ---
cd /d "%ROOT%backend"
if not exist node_modules call npm ci
call npm run build
if errorlevel 1 goto fail
cd /d "%ROOT%"

rem --- 3) Stop old BFF / tunnels ---
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq MusicStory-BFF*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq MusicStory-tunnel*" /F >nul 2>&1
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq cloudflared.exe" /FO LIST 2^>nul ^| findstr PID') do taskkill /PID %%a /F >nul 2>&1

netsh advfirewall firewall add rule name="MusicStory BFF TCP 3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1

rem --- 4) BFF in background ---
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

rem --- 5) Public tunnel (Railway + телефон с любой сети) ---
call :ensure_cloudflared
if errorlevel 1 (
  echo [WARN] Туннель не поднят — только Wi-Fi IP ниже
  set "BFF_PUBLIC="
  goto print_urls
)

del "%LOGDIR%\tunnel-bff.log" 2>nul

start "MusicStory-tunnel-bff" /min cmd /c ""%CLOUDFLARED%" tunnel --url http://127.0.0.1:%PORT% 1>>"%LOGDIR%\tunnel-bff.log" 2>&1"

echo [..] Cloudflare tunnel — жди 15-40 сек...
call :wait_tunnel_url "%LOGDIR%\tunnel-bff.log" BFF_PUBLIC 90

if defined BFF_PUBLIC (
  echo [OK] BFF public: !BFF_PUBLIC!
) else (
  echo [WARN] BFF tunnel URL не получен — см. %LOGDIR%\tunnel-bff.log
)

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
echo  BFF локально: http://127.0.0.1:%PORT%
echo  BFF лог: %LOCAL_LOG_FILE%
echo  Озвучка free tier: Edge TTS на BFF ^(без отдельного сервиса^)
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
