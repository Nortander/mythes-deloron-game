@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required.
  echo Install Node.js, then run this launcher again.
  if not defined MYTHES_NO_PAUSE pause
  exit /b 1
)

node tools\dev-server.mjs
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Development server stopped with an error.
  if not defined MYTHES_NO_PAUSE pause
  exit /b %EXIT_CODE%
)

exit /b 0
