@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo   TCW HR Software - Local Test v1.2.9
echo ========================================
echo.
if not exist node_modules (
  echo Installing packages for the first run...
  call npm ci
  if errorlevel 1 goto :error
)
echo Preparing local login and starting HR + Admin...
call npm run local:test
exit /b %errorlevel%
:error
echo.
echo Setup failed. Copy the error above and send it for support.
pause
exit /b 1
