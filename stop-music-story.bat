@echo off
setlocal EnableExtensions
title Music Story — STOP ALL
cd /d "%~dp0"

echo Stopping Music Story stack...

for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000 " ^| findstr LISTENING') do (
  echo  BFF PID %%a
  taskkill /PID %%a /F >nul 2>&1
)

taskkill /FI "WINDOWTITLE eq MusicStory-BFF*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq MusicStory-tunnel*" /F >nul 2>&1

for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq cloudflared.exe" /FO LIST 2^>nul ^| findstr PID') do (
  echo  cloudflared PID %%a
  taskkill /PID %%a /F >nul 2>&1
)

docker rm -f music-story-silero >nul 2>&1
echo  Silero container removed

echo Done.
pause
