"""Start the Python-backed local admin and open it in the default browser."""

import os
import threading
import webbrowser
from http.server import ThreadingHTTPServer
from urllib.error import URLError
from urllib.request import urlopen


HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "3000"))
os.environ["PORT"] = str(PORT)
ADMIN_URL = f"http://{HOST}:{PORT}/admin"
HEALTH_URL = f"http://{HOST}:{PORT}/api/session"


def is_running_python_app():
    try:
        with urlopen(HEALTH_URL, timeout=2) as response:
            return response.status == 200 and b"authenticated" in response.read()
    except (URLError, TimeoutError, OSError):
        return False


def main():
    if is_running_python_app():
        webbrowser.open_new_tab(ADMIN_URL)
        print(f"El panel Python ya está activo: {ADMIN_URL}")
        return

    from app import SiteHandler

    try:
        server = ThreadingHTTPServer((HOST, PORT), SiteHandler)
    except OSError as error:
        print(f"No pude iniciar el servidor en el puerto {PORT}: {error}")
        print("Cierra el servidor anterior del puerto 3000 y vuelve a ejecutar ABRIR_ADMIN.bat.")
        input("Pulsa Enter para cerrar esta ventana...")
        return

    threading.Timer(0.8, lambda: webbrowser.open_new_tab(ADMIN_URL)).start()
    print(f"Abriendo el panel Python: {ADMIN_URL}")
    print("Deja esta ventana abierta. Ctrl+C detiene el servidor.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
