@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required.
  if not defined MYTHES_NO_PAUSE pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required to run the project checks.
  if not defined MYTHES_NO_PAUSE pause
  exit /b 1
)

npm run check
set "EXIT_CODE=%ERRORLEVEL%"

if "%EXIT_CODE%"=="0" (
  echo.
  echo Project check succeeded.
) else (
  echo.
  echo Project check failed.
)

if not defined MYTHES_NO_PAUSE pause
exit /b %EXIT_CODE%
