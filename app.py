"""YC NICE LADY: static site, local authentication and SQLite API."""

import hashlib
import hmac
import base64
import binascii
import html
import json
import os
import secrets
import sqlite3
import time
import threading
import webbrowser
from contextlib import contextmanager
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import parse_qs, urlsplit
from urllib.parse import unquote, quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from uuid import UUID, uuid4

ROOT = Path(__file__).resolve().parent


def running_on_render():
    return os.environ.get("RENDER", "").strip().lower() == "true"


def load_local_env():
    """Load .env for local use. Render variables are provided by its dashboard."""
    is_render = running_on_render()
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for raw in env_file.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        # On a local run, .env is the source of truth for the Python login;
        # stale Windows/Git Bash variables must not silently override it.
        if not is_render:
            os.environ[key] = value
        else:
            os.environ.setdefault(key, value)


load_local_env()
DB_PATH = Path(os.environ.get("STORE_DB_PATH", str(ROOT / "data" / "store.sqlite3")))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
SESSION_SECRET = os.environ.get("SESSION_SECRET", "")
SESSION_COOKIE = "yc_nice_lady_session"
SESSION_TTL = 60 * 60 * 24 * 14


@contextmanager
def db():
    connection = sqlite3.connect(DB_PATH, timeout=20)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_db():
    with db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT 'accesorios', price REAL NOT NULL DEFAULT 0,
                cost_price REAL NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0,
                image_path TEXT, is_active INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS store_analytics_events (
                id TEXT PRIMARY KEY, event_type TEXT NOT NULL, product_id TEXT,
                product_name TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS events_created_idx ON store_analytics_events(created_at);
            CREATE TABLE IF NOT EXISTS finance_entries (
                id TEXT PRIMARY KEY, entry_type TEXT NOT NULL, category TEXT NOT NULL,
                description TEXT NOT NULL, supplier TEXT, amount REAL NOT NULL,
                product_id TEXT, quantity INTEGER NOT NULL DEFAULT 1,
                cost_amount REAL NOT NULL DEFAULT 0, analytics_event_id TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS dismissed_whatsapp (
                event_id TEXT PRIMARY KEY, created_at TEXT NOT NULL
            );
        """)


initialize_db()


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def make_session(email):
    expires = int(time.time()) + SESSION_TTL
    payload = f"{email.lower()}:{expires}"
    signature = hmac.new(SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{signature}"


def valid_session(token):
    if not token or not SESSION_SECRET:
        return False
    try:
        email, expires_text, signature = token.rsplit(":", 2)
        payload = f"{email}:{expires_text}"
        expected = hmac.new(SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        return (hmac.compare_digest(signature, expected)
                and int(expires_text) > int(time.time())
                and email.lower() == os.environ.get("ADMIN_EMAIL", "").lower())
    except (ValueError, TypeError):
        return False


class SiteHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        # Never write query parameters (which may contain credentials) to logs.
        safe_args = tuple(
            value.split("?", 1)[0] + "?[redacted]" if isinstance(value, str) and "?" in value else value
            for value in args
        )
        super().log_message(fmt, *safe_args)

    def send_json(self, status, payload, headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def send_site_page(self, filename):
        """Serve the main HTML pages from the app folder, independent of cwd."""
        page = ROOT / filename
        try:
            body = page.read_bytes()
        except OSError:
            return self.send_error(404, f"No se encontró {filename} en {ROOT}")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_product_share_page(self, compact_id):
        """Render social preview metadata for a product stored in local SQLite."""
        if (len(compact_id) != 22
                or any(char not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-" for char in compact_id)):
            return self.send_error(404, "Enlace de producto no válido")
        try:
            product_id = str(UUID(bytes=base64.b64decode(compact_id + "==", altchars=b"-_", validate=True)))
        except (ValueError, binascii.Error):
            return self.send_error(404, "Enlace de producto no válido")

        with db() as conn:
            product = conn.execute(
                "SELECT id, name, price, image_path FROM products WHERE id=? AND is_active=1 LIMIT 1",
                (product_id,),
            ).fetchone()
        if not product or not product["image_path"]:
            return self.send_error(404, "No se encontró la foto del producto")

        supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        bucket = os.environ.get("SUPABASE_PRODUCTS_BUCKET", "product-images")
        if not supabase_url:
            return self.send_error(503, "Falta configurar el almacenamiento de fotos")
        safe_path = "/".join(quote(part, safe="") for part in str(product["image_path"]).split("/"))
        image_url = html.escape(
            f"{supabase_url}/storage/v1/object/public/{quote(bucket, safe='')}/{safe_path}",
            quote=True,
        )
        title_text = str(product["name"] or "Producto YC NICE LADY")
        title = html.escape(title_text, quote=True)
        try:
            price = f"S/ {float(product['price'] or 0):.2f}"
        except (TypeError, ValueError):
            price = ""
        description = html.escape(f"{title_text} · {price} · YC NICE LADY", quote=True)

        forwarded_host = self.headers.get("X-Forwarded-Host", "").split(",", 1)[0].strip()
        host = forwarded_host or self.headers.get("Host", "127.0.0.1:3000")
        forwarded_proto = self.headers.get("X-Forwarded-Proto", "").split(",", 1)[0].strip().lower()
        scheme = forwarded_proto if forwarded_proto in ("http", "https") else ("https" if running_on_render() else "http")
        page_url = html.escape(f"{scheme}://{host}/f/{compact_id}", quote=True)
        body = f'''<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} | YC NICE LADY</title>
  <meta name="description" content="{description}">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="YC NICE LADY">
  <meta property="og:title" content="{title} | YC NICE LADY">
  <meta property="og:description" content="{html.escape(price, quote=True)}">
  <meta property="og:url" content="{page_url}">
  <meta property="og:image" content="{image_url}">
  <meta property="og:image:secure_url" content="{image_url}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title} | YC NICE LADY">
  <meta name="twitter:description" content="{html.escape(price, quote=True)}">
  <meta name="twitter:image" content="{image_url}">
</head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#fff7f9;font:16px Arial,sans-serif;color:#573b49">
  <main style="max-width:760px;padding:16px;text-align:center">
    <img src="{image_url}" alt="{title}" style="display:block;max-width:92vw;max-height:78vh;object-fit:contain;border-radius:16px;margin:auto">
    <h1>{title}</h1><p>{html.escape(price)}</p>
  </main>
</body>
</html>'''.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "public, max-age=300")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def body_json(self):
        length = min(int(self.headers.get("Content-Length", "0") or 0), 25_000_000)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError("El contenido enviado no es JSON válido.")

    def is_admin(self):
        token = ""
        auth = self.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
        if not token:
            cookie = SimpleCookie(self.headers.get("Cookie", ""))
            token = cookie.get(SESSION_COOKIE).value if cookie.get(SESSION_COOKIE) else ""
        return valid_session(token)

    def require_admin(self):
        if not self.is_admin():
            self.send_json(401, {"message": "Sesión vencida. Ingresa nuevamente al panel."})
            return False
        return True

    def do_GET(self):
        parsed = urlsplit(self.path)
        path = parsed.path
        if (any(part.startswith(".") for part in PurePosixPath(path).parts)
                or path.lower().endswith((".py", ".sqlite", ".sqlite3", ".db"))):
            self.send_error(404)
            return
        if path in ("/", "/index.html"):
            return self.send_site_page("index.html")
        if path.rstrip("/") == "/admin":
            return self.send_site_page("admin.html")
        if path.startswith("/f/"):
            return self.send_product_share_page(path.removeprefix("/f/"))
        if path == "/api/session":
            return self.send_json(200, {"authenticated": self.is_admin()})
        if path in ("/rest/v1/products", "/api/products"):
            return self.get_products(parse_qs(parsed.query))
        if path == "/rest/v1/store_analytics_events":
            if not self.require_admin(): return
            return self.get_events(parse_qs(parsed.query))
        if path == "/api/finance":
            if not self.require_admin(): return
            with db() as conn:
                rows = conn.execute("SELECT * FROM finance_entries ORDER BY created_at DESC").fetchall()
            return self.send_json(200, [dict(row) for row in rows])
        if path == "/api/dismissed-whatsapp":
            if not self.require_admin(): return
            with db() as conn:
                rows = conn.execute("SELECT event_id FROM dismissed_whatsapp").fetchall()
            return self.send_json(200, [row[0] for row in rows])
        return super().do_GET()

    def get_products(self, query):
        sql = "SELECT * FROM products"
        params = []
        if query.get("is_active") == ["eq.true"] or query.get("is_active") == ["true"]:
            sql += " WHERE is_active = 1"
        sql += " ORDER BY sort_order ASC, created_at DESC"
        with db() as conn:
            rows = [dict(row) for row in conn.execute(sql, params).fetchall()]
        for row in rows:
            row["is_active"] = bool(row["is_active"])
            if not self.is_admin():
                row.pop("cost_price", None)
                row.pop("sort_order", None)
        return self.send_json(200, rows)

    def get_events(self, query):
        sql = "SELECT * FROM store_analytics_events"
        params = []
        event_filter = query.get("event_type", [""])[0]
        if event_filter.startswith("eq."):
            sql += " WHERE event_type = ?"
            params.append(event_filter[3:])
        sql += " ORDER BY created_at DESC"
        try:
            limit = min(5000, max(1, int(query.get("limit", ["1000"])[0])))
            offset = max(0, int(query.get("offset", ["0"])[0]))
        except ValueError:
            limit, offset = 1000, 0
        sql += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        with db() as conn:
            rows = [dict(row) for row in conn.execute(sql, params).fetchall()]
        return self.send_json(200, rows)

    def do_POST(self):
        path = urlsplit(self.path).path
        if path.startswith("/api/images/"):
            return self.image_proxy("POST")
        try:
            data = self.body_json()
        except ValueError as error:
            return self.send_json(400, {"message": str(error)})
        if path == "/auth/v1/token":
            email = str(data.get("email", "")).strip().lower()
            password = str(data.get("password", ""))
            expected_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
            expected_password = os.environ.get("ADMIN_PASSWORD", "")
            if not SESSION_SECRET or not expected_email or not expected_password:
                return self.send_json(503, {"message": "Configura ADMIN_EMAIL, ADMIN_PASSWORD y SESSION_SECRET en .env o Render."})
            if not hmac.compare_digest(email, expected_email) or not hmac.compare_digest(password, expected_password):
                return self.send_json(400, {"message": "Invalid login credentials"})
            token = make_session(email)
            is_https = (self.headers.get("X-Forwarded-Proto", "").lower() == "https"
                        or os.environ.get("RENDER", "").lower() == "true")
            secure = "; Secure" if is_https else ""
            cookie = f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_TTL}{secure}"
            return self.send_json(200, {"access_token": token, "expires_in": SESSION_TTL}, {"Set-Cookie": cookie})
        if path == "/auth/v1/logout":
            return self.send_json(200, {"ok": True}, {"Set-Cookie": f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"})
        if path == "/rest/v1/rpc/is_store_admin":
            return self.send_json(200, self.is_admin())
        if path in ("/rest/v1/products", "/api/products"):
            if not self.require_admin(): return
            items = data if isinstance(data, list) else [data]
            with db() as conn:
                for item in items:
                    if not item.get("id") or not item.get("name"):
                        return self.send_json(400, {"message": "Falta el identificador o nombre del producto."})
                    conn.execute("""INSERT INTO products
                      (id,name,description,category,price,cost_price,stock,image_path,is_active,sort_order,created_at)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                      name=excluded.name,description=excluded.description,category=excluded.category,
                      price=excluded.price,cost_price=excluded.cost_price,stock=excluded.stock,
                      image_path=excluded.image_path,is_active=excluded.is_active,
                      sort_order=excluded.sort_order""", (
                        str(item["id"]), str(item["name"]), str(item.get("description") or ""),
                        str(item.get("category") or "accesorios"), float(item.get("price") or 0),
                        float(item.get("cost_price") or 0), int(item.get("stock") or 0),
                        item.get("image_path"), int(bool(item.get("is_active", True))),
                        int(item.get("sort_order") or 0), item.get("created_at") or now_iso()))
            return self.send_json(201, {"ok": True})
        if path in ("/rest/v1/store_analytics_events", "/api/events"):
            event_type = str(data.get("event_type", ""))
            if event_type not in ("add_to_cart", "whatsapp_click"):
                return self.send_json(400, {"message": "Tipo de actividad no válido."})
            with db() as conn:
                conn.execute("INSERT INTO store_analytics_events VALUES (?,?,?,?,?,?)", (
                    str(uuid4()), event_type, data.get("product_id"),
                    str(data.get("product_name") or "Producto")[:200],
                    min(1000, max(1, int(data.get("quantity") or 1))), now_iso()))
            return self.send_json(201, {"ok": True})
        if path == "/api/events/import":
            if not self.require_admin(): return
            items = data.get("events") if isinstance(data, dict) else None
            if not isinstance(items, list):
                return self.send_json(400, {"message": "La importación de actividad debe ser una lista."})
            with db() as conn:
                for item in items:
                    if item.get("event_type") not in ("add_to_cart", "whatsapp_click"):
                        continue
                    conn.execute("INSERT OR IGNORE INTO store_analytics_events VALUES (?,?,?,?,?,?)", (
                        str(item.get("id") or uuid4()), item["event_type"], item.get("product_id"),
                        str(item.get("product_name") or "Producto")[:200],
                        min(1000, max(1, int(item.get("quantity") or 1))),
                        item.get("created_at") or now_iso()))
            return self.send_json(201, {"ok": True, "imported": len(items)})
        if path == "/api/finance":
            if not self.require_admin(): return
            entry_id = str(data.get("id") or uuid4())
            with db() as conn:
                conn.execute("""INSERT INTO finance_entries
                  (id,entry_type,category,description,supplier,amount,product_id,quantity,cost_amount,analytics_event_id,created_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?)""", (
                    entry_id, data.get("entry_type", "expense"), data.get("category", "otros"),
                    str(data.get("description") or "")[:300], data.get("supplier"),
                    float(data.get("amount") or 0), data.get("product_id"),
                    max(1, int(data.get("quantity") or 1)), float(data.get("cost_amount") or 0),
                    data.get("analytics_event_id"), data.get("created_at") or now_iso()))
            return self.send_json(201, {"id": entry_id})
        if path == "/api/dismissed-whatsapp":
            if not self.require_admin(): return
            event_id = str(data.get("event_id", ""))
            if not event_id: return self.send_json(400, {"message": "Falta event_id."})
            with db() as conn:
                conn.execute("INSERT OR IGNORE INTO dismissed_whatsapp VALUES (?,?)", (event_id, now_iso()))
            return self.send_json(201, {"ok": True})
        if path == "/api/orders":
            items = data.get("order_items") or []
            with db() as conn:
                try:
                    conn.execute("BEGIN IMMEDIATE")
                    for item in items:
                        quantity = max(1, int(item.get("quantity") or 1))
                        cur = conn.execute("UPDATE products SET stock=stock-? WHERE id=? AND is_active=1 AND stock>=?",
                                           (quantity, str(item.get("id")), quantity))
                        if cur.rowcount != 1:
                            conn.rollback()
                            return self.send_json(409, {"message": "Stock insuficiente para completar el pedido."})
                    conn.commit()
                except (ValueError, sqlite3.Error):
                    conn.rollback()
                    return self.send_json(400, {"message": "No se pudo reservar el stock del pedido."})
            return self.send_json(200, {"ok": True})
        return self.send_json(404, {"message": "Ruta API no encontrada."})

    def do_PATCH(self):
        path, query = urlsplit(self.path).path, parse_qs(urlsplit(self.path).query)
        if path != "/rest/v1/products" or not self.require_admin():
            if path != "/rest/v1/products": return self.send_json(404, {"message": "Ruta no encontrada."})
            return
        try: data = self.body_json()
        except ValueError as error: return self.send_json(400, {"message": str(error)})
        product_id = query.get("id", [""])[0].removeprefix("eq.")
        with db() as conn:
            conn.execute("UPDATE products SET sort_order=? WHERE id=?", (int(data.get("sort_order") or 0), product_id))
        return self.send_json(200, {"ok": True})

    def do_DELETE(self):
        parsed = urlsplit(self.path)
        query = parse_qs(parsed.query)
        if parsed.path.startswith("/api/images/"):
            return self.image_proxy("DELETE")
        if parsed.path == "/rest/v1/products":
            if not self.require_admin(): return
            product_id = query.get("id", [""])[0].removeprefix("eq.")
            with db() as conn: conn.execute("DELETE FROM products WHERE id=?", (product_id,))
            return self.send_json(200, {"ok": True})
        if parsed.path == "/api/finance":
            if not self.require_admin(): return
            entry_id = query.get("id", [""])[0]
            with db() as conn: conn.execute("DELETE FROM finance_entries WHERE id=?", (entry_id,))
            return self.send_json(200, {"ok": True})
        if parsed.path == "/api/dismissed-whatsapp":
            if not self.require_admin(): return
            event_id = query.get("event_id", [""])[0]
            with db() as conn: conn.execute("DELETE FROM dismissed_whatsapp WHERE event_id=?", (event_id,))
            return self.send_json(200, {"ok": True})
        return self.send_json(404, {"message": "Ruta API no encontrada."})

    def image_proxy(self, method):
        if not self.require_admin(): return
        pieces = [unquote(part) for part in urlsplit(self.path).path.split("/")[3:]]
        if len(pieces) < 2 or any(part in ("", ".", "..") for part in pieces) or pieces[1] != "products":
            return self.send_json(400, {"message": "Ruta de imagen no válida."})
        bucket, image_path = pieces[0], "/".join(pieces[1:])
        expected_bucket = os.environ.get("SUPABASE_PRODUCTS_BUCKET", "product-images")
        base_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if bucket != expected_bucket or not base_url or not service_key:
            return self.send_json(503, {"message": "Configura en el servidor la URL, el bucket y la clave privada de Storage de Supabase."})
        target = f"{base_url}/storage/v1/object/{quote(bucket, safe='')}/{quote(image_path, safe='/')}"
        headers = {"apikey": service_key}
        # New Supabase sb_secret_* keys are API keys, not JWTs. Only the legacy
        # service_role key (JWT format) belongs in Authorization: Bearer.
        if service_key.startswith("eyJ"):
            headers["Authorization"] = f"Bearer {service_key}"
        if method == "POST":
            size = int(self.headers.get("Content-Length", "0") or 0)
            if size < 1 or size > 5 * 1024 * 1024:
                return self.send_json(400, {"message": "La imagen debe pesar entre 1 byte y 5 MB."})
            content_type = self.headers.get("Content-Type", "")
            if content_type not in ("image/jpeg", "image/png", "image/webp"):
                return self.send_json(415, {"message": "Solo se aceptan imágenes JPG, PNG o WEBP."})
            headers.update({"Content-Type": content_type, "x-upsert": "false", "cache-control": "3600"})
            data = self.rfile.read(size)
        else:
            data = None
        request = Request(target, data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=30) as response:
                result = response.read()
                try: payload = json.loads(result) if result else {"ok": True}
                except json.JSONDecodeError: payload = {"ok": True}
                return self.send_json(response.status, payload)
        except HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            try: detail = json.loads(detail)
            except json.JSONDecodeError: detail = {"message": "Storage rechazó la solicitud."}
            return self.send_json(error.code, detail)
        except (URLError, TimeoutError):
            return self.send_json(502, {"message": "No se pudo conectar con el almacenamiento de imágenes."})


if __name__ == "__main__":
    required_pages = (ROOT / "index.html", ROOT / "admin.html")
    missing_pages = [str(page) for page in required_pages if not page.is_file()]
    if missing_pages:
        raise SystemExit("Faltan páginas necesarias: " + ", ".join(missing_pages))
    is_render = running_on_render()
    host = "0.0.0.0" if is_render else "127.0.0.1"
    configured_port = os.environ.get("PORT", "").strip()
    first_port = int(configured_port) if configured_port else 3001
    ports = [first_port] if configured_port or is_render else range(first_port, first_port + 20)
    server = None
    port = first_port
    for candidate in ports:
        try:
            server = ThreadingHTTPServer((host, candidate), SiteHandler)
            port = candidate
            break
        except OSError:
            if configured_port or is_render:
                raise
    if server is None:
        raise SystemExit(f"No hay puertos locales disponibles entre {first_port} y {first_port + 19}.")
    print(f"YC NICE LADY escuchando en el puerto {port}; páginas: {ROOT / 'index.html'} y {ROOT / 'admin.html'}; SQLite: {DB_PATH}", flush=True)
    if not is_render:
        def open_local_pages():
            base_url = f"http://127.0.0.1:{port}"
            webbrowser.open_new_tab(f"{base_url}/")
            webbrowser.open_new_tab(f"{base_url}/admin")
        threading.Timer(1, open_local_pages).start()
    server.serve_forever()
