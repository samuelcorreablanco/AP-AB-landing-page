#!/bin/sh
''''exec python3 "$0" "$@" #'''
__ABBI_WINDOWS_LAUNCH__ = r'''
@echo off
where py >nul 2>nul && (py -3 "%~f0" %* & exit /b)
python "%~f0" %* & exit /b
'''
"""Generado por ABBI. Prende este proyecto en macOS / Windows / Linux.

Uso:  python3 abbi_start.py [--no-browser]
(normalmente no lo corres a mano: usa start.command en Mac o start.bat en Windows)
"""
import json
import os
import signal
import socket
import subprocess
import sys
import time
import traceback
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

BASE = Path(__file__).resolve().parent
SPEC = json.loads('''{"kind": "static", "framework": "static", "port": 8000, "command": [], "install": [], "env": {}, "canonical_ui": "index.html", "entrypoint": "index.html"}''')
PORT_PREFS = (8000, 8080, 8090, 8095)      # el primero es el preferido; se salta los ocupados
PIP_MINIMAL = ""    # fallback si la instalacion completa falla ("" = sin fallback)
_DEVNULL = subprocess.DEVNULL

try:
    # con la salida por PIPE (logs, tests) los print quedarian en buffer: line-buffering
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass


def say(msg):
    print("")
    print("== " + msg)


def fail(msg):
    print("")
    print("XX  " + msg)
    print("    (mira los mensajes de arriba; ayuda en RUN.md)")
    try:
        if sys.stdin is not None and sys.stdin.isatty():
            input("Enter para cerrar... ")
    except Exception:
        pass
    sys.exit(1)


def pick_port():
    """Puerto LIBRE: prueba los preferidos y se salta los ocupados (en macOS el 5000 lo
    usa AirPlay). El server y el navegador usan SIEMPRE el mismo puerto elegido."""
    for p in PORT_PREFS:
        s = socket.socket()
        try:
            s.bind(("127.0.0.1", p))
            s.close()
            return p
        except OSError:
            s.close()
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def venv_python():
    """Python del entorno aislado .abbi_venv (lo crea si falta). En Windows el interno
    vive en Scripts/python.exe; en macOS/Linux en bin/python3."""
    vdir = BASE / ".abbi_venv"
    if not vdir.exists():
        say("Preparando el entorno (la primera vez puede tardar 1-2 minutos)...")
        try:
            subprocess.run([sys.executable, "-m", "venv", str(vdir)],
                           stdout=_DEVNULL, stderr=_DEVNULL)
        except Exception:
            pass
    if os.name == "nt":
        cands = [vdir / "Scripts" / "python.exe"]
    else:
        cands = [vdir / "bin" / "python3", vdir / "bin" / "python"]
    for c in cands:
        if c.exists():
            return str(c)
    print("   (no pude crear el entorno aislado; uso el Python del sistema)")
    print("   (si estas en Linux: sudo apt install python3-venv y volve a intentar)")
    return sys.executable


def _install_reqs_line_by_line(py, reqfile):
    """Instala un requirements.txt LINEA POR LINEA, tolerante a lineas corruptas (p.ej.
    'Flask-SQLAlchemy>=3.0>=3.0.0' que el generador a veces produce): una linea mala no
    tumba a las demas, y si su specifier es invalido se reintenta con solo el nombre."""
    import re as _re
    ok_any = False
    try:
        lines = open(reqfile, encoding="utf-8").read().splitlines()
    except OSError:
        return False
    for ln in lines:
        ln = ln.strip()
        if not ln or ln.startswith("#") or ln.startswith("-"):
            continue
        if subprocess.call([py, "-m", "pip", "install", "-q", ln],
                           stdout=_DEVNULL, stderr=_DEVNULL) == 0:
            ok_any = True
            continue
        name = _re.split(r"[<>=!~; ]", ln, 1)[0].strip()   # solo el nombre del paquete
        if name and subprocess.call([py, "-m", "pip", "install", "-q", name],
                                    stdout=_DEVNULL, stderr=_DEVNULL) == 0:
            print("   (instale '" + name + "' salteando su version rota en requirements)")
            ok_any = True
    return ok_any


def pip_install(py):
    steps = SPEC.get("install") or []
    if not steps and not PIP_MINIMAL:
        return
    subprocess.call([py, "-m", "pip", "install", "-q", "--upgrade", "pip"],
                    stdout=_DEVNULL, stderr=_DEVNULL)
    if steps:
        fallo = False
        for step in steps:
            parts = step.split()
            if subprocess.call([py, "-m", "pip", "install", "-q"] + parts) == 0:
                continue
            # el requirements fallo en bloque (linea corrupta?) -> linea por linea, tolerante
            if parts and parts[0] == "-r" and len(parts) > 1 and _install_reqs_line_by_line(py, parts[1]):
                continue
            fallo = True
        if not fallo:
            return
        if not PIP_MINIMAL:
            fail("no pude instalar las dependencias (revisa tu conexion a internet)")
        print("   (la instalacion completa fallo; instalo lo minimo: " + PIP_MINIMAL + ")")
    if subprocess.call([py, "-m", "pip", "install", "-q", PIP_MINIMAL]) != 0:
        fail("no pude instalar las dependencias (revisa tu conexion a internet)")


def wait_up(port, proc):
    """Espera a que el server RESPONDA antes de abrir el navegador. Una respuesta HTTP
    de error (4xx/5xx) tambien cuenta como VIVO."""
    url = "http://127.0.0.1:%d/" % port
    for _ in range(40):
        if proc.poll() is not None:
            fail("la app se cerro al arrancar (el error esta arriba)")
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except urllib.error.HTTPError as e:
            # vivo (el server responde), pero la pagina principal no carga: AVISAR
            print("   OJO: la app respondio " + str(e.code) + " en / "
                  "(la pagina principal no carga; revisa que esten todos los archivos)")
            return True
        except Exception:
            time.sleep(1)
    print("   (sigue arrancando: proba " + url + " en el navegador)")
    return False


def main():
    if sys.version_info < (3, 8):
        fail("este proyecto necesita Python 3.8 o mas nuevo (instala desde python.org)")
    os.chdir(str(BASE))
    kind = SPEC.get("kind") or "static"
    port = pick_port()
    env = os.environ.copy()
    for k, v in (SPEC.get("env") or {}).items():
        if k != "PORT":
            env[k] = str(v)
    env["PORT"] = str(port)

    if kind == "python":
        py = venv_python()
        pip_install(py)
        cmd = list(SPEC.get("command") or [])
        if cmd and cmd[0] in ("python", "python3"):
            cmd[0] = py
        # algunos comandos hornean el puerto adentro (Django: runserver 127.0.0.1:PUERTO)
        viejo = "127.0.0.1:%d" % int(SPEC.get("port") or 0)
        cmd = [a.replace(viejo, "127.0.0.1:%d" % port) for a in cmd]
        say("Levantando la app (%s) en http://127.0.0.1:%d ..." % (SPEC.get("framework") or "python", port))
        proc = subprocess.Popen(cmd, cwd=str(BASE), env=env)
    elif kind == "node":
        import shutil
        npm = shutil.which("npm")
        if not npm:
            fail("no encontre npm/node (instala Node.js de nodejs.org)")
        base_cmd = ["cmd", "/c", npm] if os.name == "nt" else [npm]
        say("Instalando dependencias (npm install; la primera vez tarda)...")
        if subprocess.call(base_cmd + ["install"], cwd=str(BASE), env=env) != 0:
            fail("npm install fallo (revisa tu conexion a internet)")
        spec_cmd = list(SPEC.get("command") or [])
        npm_args = spec_cmd[1:] if (spec_cmd and spec_cmd[0] == "npm") else ["start"]
        say("Levantando la app (node) en http://127.0.0.1:%d ..." % port)
        proc = subprocess.Popen(base_cmd + npm_args, cwd=str(BASE), env=env)
    else:  # static
        ui = SPEC.get("canonical_ui") or "index.html"
        ui_dir = str(Path(ui).parent) if "/" in ui else "."
        say("Sirviendo la UI en http://127.0.0.1:%d ..." % port)
        # NO-CACHE: con `python -m http.server` pelado el navegador CACHEA index.html/JS y al
        # reabrir la app en el MISMO puerto mostraba la version VIEJA aunque el disco ya tuviera
        # la nueva (caso 2026-06-15: la descarga estaba bien, lo viejo era el cache del browser).
        # Server propio que manda Cache-Control: no-store -> el navegador SIEMPRE re-baja.
        nocache = (
            "import functools,http.server,socketserver,sys\n"
            "class H(http.server.SimpleHTTPRequestHandler):\n"
            " def end_headers(self):\n"
            "  self.send_header('Cache-Control','no-cache, no-store, must-revalidate')\n"
            "  self.send_header('Pragma','no-cache'); self.send_header('Expires','0')\n"
            "  http.server.SimpleHTTPRequestHandler.end_headers(self)\n"
            "socketserver.TCPServer.allow_reuse_address=True\n"
            "httpd=socketserver.TCPServer(('127.0.0.1',int(sys.argv[2])),"
            "functools.partial(H,directory=sys.argv[1]))\n"
            "httpd.serve_forever()\n"
        )
        proc = subprocess.Popen([sys.executable, "-c", nocache, ui_dir, str(port)],
                                cwd=str(BASE), env=env)

    # SIGTERM (kill, tests, cierre de sesion) NO dispara KeyboardInterrupt: sin esto el
    # server HIJO quedaba huerfano ocupando el puerto para siempre (caso real: cuatro
    # http.server zombis acumulados terminaron pisando el puerto del panel de ABBI).
    def _bye(signum, frame):
        try:
            proc.terminate()
        except Exception:
            pass
        sys.exit(0)
    try:
        signal.signal(signal.SIGTERM, _bye)
    except Exception:
        pass

    wait_up(port, proc)
    url = "http://127.0.0.1:%d/" % port
    say("LISTO: la app esta corriendo en  " + url)
    print("   (deja esta ventana abierta mientras la uses; para apagar: Ctrl+C o cerrala)")
    if "--no-browser" not in sys.argv:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        fail("error inesperado al prender el proyecto")
