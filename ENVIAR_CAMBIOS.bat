@echo off
setlocal
cd /d "%~dp0"
node scripts\enviar-cambio.js
echo.
pause
