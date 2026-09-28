@echo off
setlocal
cd /d "%~dp0"
echo.
echo ================================================
echo   TCW HR - Stable Phone + PC Local Test
echo ================================================
echo.
where node >nul 2>nul || (echo Node.js is not installed or not in PATH.& pause & exit /b 1)
if not exist node_modules (
  echo Installing dependencies...
  call npm ci || (echo npm ci failed.& pause & exit /b 1)
)
echo Starting stable local build for PC and phone...
call npm run phone:stable
pause
