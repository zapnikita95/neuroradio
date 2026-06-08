@echo off
REM Сборка efir-ai.aab с авто +1 versionCode (Windows)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-play-aab.ps1" %*
if errorlevel 1 exit /b 1
pause
