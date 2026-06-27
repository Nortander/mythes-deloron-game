@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js 18 or newer is required but was not found.
  if not defined MYTHES_NO_PAUSE pause
  exit /b 1
)

echo.
echo Mythes d'Eloron project check
echo.

node tools\verify-workspace.mjs
if errorlevel 1 (
  echo.
  echo [FAIL] Workspace verification failed.
  if not defined MYTHES_NO_PAUSE pause
  exit /b 1
)

node tools\smoke-test.mjs
if errorlevel 1 (
  echo.
  echo [FAIL] HTTP smoke test failed.
  if not defined MYTHES_NO_PAUSE pause
  exit /b 1
)

echo.
echo [PASS] All project checks succeeded.
if not defined MYTHES_NO_PAUSE pause
exit /b 0
