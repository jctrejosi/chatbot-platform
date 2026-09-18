@echo off
REM Lanzador para Windows (doble clic o desde cmd/PowerShell).
REM Instala dependencias si faltan (npm y .venv) y monta los servicios.
REM   dev.cmd            -> monta los servicios (instala deps si faltan)
REM   dev.cmd --install  -> solo valida/instala dependencias y sale
REM   dev.cmd --clean    -> borra node_modules y reinstala desde cero
REM   dev.cmd --stop     -> detiene los servicios
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado. Descargalo en https://nodejs.org/
  pause
  exit /b 1
)

node dev.js %*
set "CODE=%ERRORLEVEL%"
if not "%CODE%"=="0" (
  echo.
  echo [ERROR] dev.js termino con codigo %CODE%. Revisa el mensaje de arriba.
  pause
)
endlocal & exit /b %CODE%
