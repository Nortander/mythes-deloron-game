@echo off
setlocal
cd /d "%~dp0"

if not exist ".toolchain\node\node.exe" (
  echo [ERROR] Portable Node was not found.
  echo Run bootstrap-browser-tests.cmd first.
  if not defined MYTHES_NO_PAUSE pause
  exit /b 1
)

if not exist "node_modules\@playwright\test\cli.js" (
  echo [ERROR] Playwright is not installed locally.
  echo Run bootstrap-browser-tests.cmd first.
  if not defined MYTHES_NO_PAUSE pause
  exit /b 1
)

.toolchain\node\node.exe node_modules\@playwright\test\cli.js test %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [FAIL] Browser tests failed.
  if not defined MYTHES_NO_PAUSE pause
  exit /b %EXIT_CODE%
)

echo.
echo [PASS] Browser tests succeeded.
exit /b 0
