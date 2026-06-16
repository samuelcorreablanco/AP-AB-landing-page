@echo off
REM ============================================================
REM  PROBAR LA WEB AP-AB LOCALMENTE (igual que en Vercel)
REM  Sirve TODO el sitio por HTTP y abre el navegador.
REM  Necesario porque el juego (modulos ES) NO carga por file://
REM  (doble-click al .html). Esto imita lo que hace Vercel.
REM
REM  Uso: doble-click a este archivo. Deja la ventana abierta.
REM  Para apagar: cierra esta ventana o Ctrl+C.
REM ============================================================
cd /d "%~dp0"

set PORT=8000
where py >nul 2>nul && (
  start "" http://127.0.0.1:%PORT%/index.html
  py -3 -m http.server %PORT%
  exit /b
)
where python >nul 2>nul && (
  start "" http://127.0.0.1:%PORT%/index.html
  python -m http.server %PORT%
  exit /b
)
echo No se encontro Python. Instalalo desde python.org (marca "Add python.exe to PATH").
pause
