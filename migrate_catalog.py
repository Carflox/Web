"""One-time copy of existing Supabase product rows into the Python catalog."""

import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app import load_local_env, running_on_render

load_local_env()


def api_json(url, method="GET", headers=None, payload=None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urlopen(request, timeout=45) as response:
            text = response.read().decode("utf-8")
            return json.loads(text) if text else None
    except HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"No se pudo conectar: {error.reason}") from error


def main():
    legacy_url = os.environ.get("LEGACY_SUPABASE_URL", "").rstrip("/")
    legacy_key = os.environ.get("LEGACY_SUPABASE_PUBLISHABLE_KEY", "")
    admin_url = os.environ.get("PYTHON_ADMIN_URL", "").rstrip("/")
    if not admin_url and not running_on_render():
        admin_url = f"http://127.0.0.1:{os.environ.get('PORT', '3000')}"
    email = os.environ.get("ADMIN_EMAIL", "")
    password = os.environ.get("ADMIN_PASSWORD", "")
    missing = [name for name, value in (
        ("LEGACY_SUPABASE_URL", legacy_url),
        ("LEGACY_SUPABASE_PUBLISHABLE_KEY", legacy_key),
        ("PYTHON_ADMIN_URL", admin_url), ("ADMIN_EMAIL", email),
        ("ADMIN_PASSWORD", password)) if not value]
    if missing:
        print("Completa estas variables en .env: " + ", ".join(missing), file=sys.stderr)
        return 2

    login = api_json(f"{admin_url}/auth/v1/token?grant_type=password", "POST",
                     {"Content-Type": "application/json"}, {"email": email, "password": password})
    token = login["access_token"]
    query = urlencode({"select": "*"})
    products = api_json(f"{legacy_url}/rest/v1/products?{query}", headers={
        "apikey": legacy_key, "Authorization": f"Bearer {legacy_key}"}) or []
    if not isinstance(products, list):
        raise RuntimeError("Supabase no devolvió una lista de productos.")
    api_json(f"{admin_url}/rest/v1/products?on_conflict=id", "POST", {
        "Authorization": f"Bearer {token}", "Content-Type": "application/json"}, products)
    print(f"Catálogo copiado al servidor Python: {len(products)} productos.")
    print("Las rutas de foto se conservaron; las imágenes siguen en Supabase Storage.")
    try:
        offset = total_events = 0
        while True:
            events_query = urlencode({"select": "id,event_type,product_id,product_name,quantity,created_at", "limit": 500, "offset": offset})
            events = api_json(f"{legacy_url}/rest/v1/store_analytics_events?{events_query}", headers={
                "apikey": legacy_key, "Authorization": f"Bearer {legacy_key}"}) or []
            if not events: break
            api_json(f"{admin_url}/api/events/import", "POST", {
                "Authorization": f"Bearer {token}", "Content-Type": "application/json"}, {"events": events})
            total_events += len(events)
            offset += len(events)
            if len(events) < 500: break
        print(f"Actividad histórica copiada: {total_events} eventos.")
    except RuntimeError as error:
        print(f"El catálogo sí se copió; Supabase no permitió exportar los eventos históricos: {error}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (KeyError, RuntimeError) as error:
        print(f"No se completó la migración: {error}", file=sys.stderr)
        raise SystemExit(1)
