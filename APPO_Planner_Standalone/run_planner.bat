@echo off
title APPO Planner - Standalone Server
echo Iniciando servidor independiente del Planeador...
cd /d "%~dp0"
if not exist "venv" (
    echo Creando entorno virtual...
    python -m venv venv
)
call "venv\Scripts\activate.bat"
echo Instalando dependencias...
pip install -r requirements.txt --quiet
echo Levantando API del Planeador en el puerto 8080...
start "Planner API" cmd /k "uvicorn main:app --host 0.0.0.0 --port 8080"
timeout /t 3 >NUL
start http://localhost:8080/docs
exit
