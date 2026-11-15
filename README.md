# NICE LADY — Sitio web

Proyecto organizado como una página web para trabajar cómodamente en **Visual Studio Code**.

## Estructura

```text
NICE_LADY_VSCode/
│
├── index.html
├── README.md
│
├── css/
│   └── style.css
│
├── js/
│   └── script.js
│
└── img/
    └── logo.jpg
```

## Tecnologías

- HTML5 — estructura y contenido.
- CSS3 — diseño, colores, tipografías, tarjetas, responsive y animaciones.
- JavaScript — menú expandible y comportamiento interactivo.
- JPG — logo oficial de NICE LADY.

## Cómo abrirlo en VS Code

1. Descomprime la carpeta.
2. Abre la carpeta `NICE_LADY_VSCode` en Visual Studio Code.
3. Abre `index.html`.
4. Puedes ejecutarlo directamente en el navegador o utilizar una extensión como **Live Server**.

## Dónde modificar cada cosa

### `index.html`
Aquí se modifica:
- Textos.
- Nombres de productos.
- Precios.
- Secciones.
- Enlaces.
- Información de contacto.

### `css/style.css`
Aquí se modifica:
- Colores.
- Tamaños.
- Espaciados.
- Diseño rosado.
- Tarjetas.
- Animaciones.
- Adaptación a celular y computadora.

### `js/script.js`
Aquí se modifica:
- Menú expandible.
- Interacciones y comportamiento dinámico.

### `img/logo.jpg`
Contiene el **logo original proporcionado para NICE LADY**.

## Productos

La sección de productos tiene 10 espacios preparados. Para colocar una fotografía real, se puede cambiar el contenido del bloque de imagen correspondiente por:

```html
<img src="img/nombre-del-producto.jpg" alt="Nombre del producto">
```

y guardar la fotografía dentro de la carpeta `img`.

## Nota

Los números de WhatsApp, Instagram, precios y datos de pago son datos de ejemplo y deben reemplazarse por los datos reales antes de publicar la página.

## Servidor Python y datos del negocio

El servicio `app.py` ejecuta el catálogo, el acceso privado, las estadísticas, los pedidos pendientes y las finanzas en Python con SQLite. Supabase queda para servir, subir y eliminar fotografías. La clave privada de Storage (`SUPABASE_SERVICE_ROLE_KEY`) solo se usa dentro de Python; nunca debe ponerse en archivos JavaScript ni subirse a GitHub.

Para iniciar localmente, completa `.env` con `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` y la URL y bucket de Supabase. `.env.example` muestra los nombres. Ejecuta `python app.py`; el servidor abre el panel en `http://localhost:3000/admin`. Mantén esa terminal abierta mientras uses el panel.

En Render, configura `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_PRODUCTS_BUCKET` y `SUPABASE_SERVICE_ROLE_KEY` en **Environment**. Para conservar la base SQLite entre reinicios y despliegues, conecta un disco persistente y configura `STORE_DB_PATH=/var/data/store.sqlite3` con el punto de montaje `/var/data`. Sin un disco persistente, Render puede borrar los registros locales al reiniciar o volver a desplegar.

### Trasladar el catálogo existente

La base Python comienza vacía. Antes de usar el nuevo sitio público, conserva el catálogo anterior y ejecuta una sola vez `migrate_catalog.py` para copiar productos, rutas de fotos y, si las políticas lo permiten, actividad histórica desde Supabase. Completa temporalmente en `.env` `LEGACY_SUPABASE_URL`, `LEGACY_SUPABASE_PUBLISHABLE_KEY`, `PYTHON_ADMIN_URL`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`; luego ejecuta `python migrate_catalog.py`. La clave publicable se usa solo durante esa copia y se puede borrar de `.env` después. No elimines el proyecto ni las tablas antiguas hasta comprobar el catálogo, las fotos y los registros en Python.

Las finanzas guardadas en el navegador se copian al servidor cuando inicias sesión por primera vez desde ese mismo navegador. Los eventos nuevos se guardan en SQLite.
