"""Servidor HTTP mínimo para publicar el sitio estático en Render."""

import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent


class SiteHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        requested_path = urlsplit(self.path).path
        if any(part.startswith(".") for part in PurePosixPath(requested_path).parts):
            self.send_error(404)
            return
        if requested_path.rstrip("/") == "/admin":
            self.path = "/admin.html"
        super().do_GET()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), SiteHandler)
    print(f"YC NICE LADY escuchando en el puerto {port}", flush=True)
    server.serve_forever()
