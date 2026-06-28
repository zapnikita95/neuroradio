@echo off
setlocal
REM Music Story — release AAB for Play + RuStore (NOT movieplanner)
cd /d "%~dp0"
if not exist "%~dp0android\app\build.gradle.kts" (
  echo ERROR: run from Music story repo root. android\app\build.gradle.kts missing.
  pause
  exit /b 1
)
if not exist "%~dp0scripts\build-play-aab.ps1" (
  echo ERROR: missing scripts\build-play-aab.ps1
  pause
  exit /b 1
)
echo Building efir-ai.aab + efir-ai-rustore.aab ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-play-aab.ps1" %*
if errorlevel 1 (
  echo.
  echo BUILD FAILED - see errors above.
  pause
  exit /b 1
)
echo.
echo OK:
echo   efir-ai.aab         - Google Play
echo   efir-ai-rustore.aab - RuStore
pause
