def is_running_python_app():
    try:
        with urlopen(HEALTH_URL, timeout=2) as response:
            if response.status != 200 or b"authenticated" not in response.read():
                return False
        with urlopen(ADMIN_URL, timeout=2) as response:
            return response.status == 200 and b"Administrar productos" in response.read()
    except (URLError, TimeoutError, OSError):
        return False
