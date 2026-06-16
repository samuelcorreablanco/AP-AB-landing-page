#!/usr/bin/env python3
"""Servidor estatico de Cafe Racer 93.

Sirve la carpeta del juego (index.html como ENTRY UNICO) leyendo el puerto
desde la variable de entorno PORT y bindeando 127.0.0.1. Solo stdlib.
Garantiza GET / -> 200 con index.html y MIME correctos para ES modules / GLB / audio.

Arranque (UNICO entry point del sitio estatico):
    PORT=8000 python3 server.py        # -> http://127.0.0.1:8000
Alternativa solo-estaticos (sin MIME custom para .glb/.m4a, no recomendada):
    python3 -m http.server "$PORT"
"""
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".wasm": "application/wasm",
        ".m4a": "audio/mp4",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".svg": "image/svg+xml",
        ".png": "image/png",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass


class ReusableServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    # PORT explicito desde el entorno (default 8000; NO 5000: lo ocupa AirPlay en macOS).
    port = int(os.environ.get("PORT", "8000"))
    handler = partial(Handler, directory=ROOT)
    httpd = ReusableServer(("127.0.0.1", port), handler)
    print("Cafe Racer 93 -> http://127.0.0.1:%d" % port)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
