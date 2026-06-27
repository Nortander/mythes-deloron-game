@echo off
setlocal
cd /d "%~dp0"

where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] PowerShell is required for the browser test bootstrap.
  if not defined MYTHES_NO_PAUSE pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\bootstrap-playwright.ps1
set "EXIT_CODE=%ERRORLEVEL%"

if "%EXIT_CODE%"=="0" (
  echo.
  echo [PASS] Browser test bootstrap succeeded.
) else (
  echo.
  echo [FAIL] Browser test bootstrap failed.
  if not defined MYTHES_NO_PAUSE pause
)

exit /b %EXIT_CODE%
