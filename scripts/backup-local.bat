@echo off
setlocal
cd /d "%~dp0.."

if not exist "node_modules\pg" (
  echo Instalando driver de PostgreSQL local ^(solo la primera vez^)...
  call npm install --no-save pg --no-audit --no-fund
  if errorlevel 1 (
    echo Error al instalar el paquete pg.
    pause
    exit /b 1
  )
)

node scripts\backup-local.js
if errorlevel 1 (
  echo.
  echo Ocurrio un error durante el respaldo. Revisa el mensaje arriba.
  pause
  exit /b 1
)

if /I not "%1"=="--silent" (
  echo.
  pause
)
