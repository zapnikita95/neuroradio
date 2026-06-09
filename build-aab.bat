@echo off
REM Release AAB -> efir-ai.aab in repo root (+1 versionCode)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-play-aab.ps1" %*
if errorlevel 1 (
  echo.
  echo BUILD FAILED - see errors above.
  pause
  exit /b 1
)
echo.
echo OK: efir-ai.aab in repo root
pause
