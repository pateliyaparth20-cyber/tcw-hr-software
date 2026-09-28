@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo   TCW HR Software - Phone/LAN Test
echo ========================================
echo.
call npm run setup
call npm run configure:lan
if errorlevel 1 goto :error
call npm run local:test
exit /b %errorlevel%
:error
echo LAN configuration failed.
pause
exit /b 1
