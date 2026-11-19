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

## Publicación en Netlify

El sitio público y su backend se despliegan juntos en Netlify. Netlify Functions ejecuta las rutas del catálogo, pedidos, panel, imágenes, finanzas y autenticación en Node.js. El proyecto se ejecuta en Netlify Functions. Para vista previa local, usa Node.js 24 o posterior y ejecuta `npx netlify dev` (también está disponible como tarea de VS Code).

La base de datos y el almacenamiento de imágenes siguen en el proyecto Supabase ya configurado. Las claves privadas se agregan en Netlify bajo **Site configuration > Environment variables**, con ámbito **Functions**; nunca se escriben en `js/supabase-config.js` ni se suben a GitHub.

### Preparar el proyecto

1. En Netlify deja **Base directory** vacío y **Build command** como `npm run build`; **Publish directory** es `dist` y **Functions directory** es `netlify/functions` (también están en `netlify.toml`).
2. En variables de entorno de Netlify configura `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `SESSION_SECRET`. `SUPABASE_URL` es opcional porque el proyecto ya trae su URL pública configurada. Para recuperación de contraseña agrega `SMTP_USER` y `SMTP_APP_PASSWORD`; `SMTP_HOST` y `SMTP_PORT` son opcionales. La URL y bucket de imágenes se leen del archivo público de configuración.
3. Ejecuta una vez `supabase/netlify-backend.sql` en el SQL Editor del proyecto Supabase. Crea las tablas privadas de credenciales/restablecimiento y la función que reserva stock de forma atómica.
4. Para mantener separado el historial de Finanzas del catálogo, ejecuta `supabase/add-finance-product-name-snapshot.sql` después de `supabase/add-product-cost-and-finance.sql`. Los movimientos nuevos guardan el nombre del producto del momento y editar el costo unitario del catálogo no crea ni cambia movimientos financieros.
5. Si Supabase rechaza cambios de categoría, ejecuta `supabase/fix-product-categories.sql`; deja permitidas las mismas cinco categorías del panel y convierte categorías antiguas incompatibles.
6. Sube los cambios a la rama `main` conectada a Netlify para que se compile y publique el sitio y sus funciones.

### Conservar el catálogo local

La base `data/store.sqlite3` local contiene 107 productos y una contraseña de administrador restablecida guardada como hash. `migrate-sqlite-products.mjs` primero muestra una vista previa y no envía nada por defecto. Después de revisar el destino y autorizar el envío, la copia se ejecuta desde la carpeta del proyecto con `node migrate-sqlite-products.mjs --confirm-transfer`. La migración combina productos por identificador y no borra productos existentes en Supabase; también conserva el hash de la contraseña restablecida.

Los productos incluyen costos y proveedores privados, y la fila de credenciales contiene un hash de contraseña. La migración transmite esos datos al proyecto Supabase configurado en `.env`.
