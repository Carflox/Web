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

## Enlaces cortos de fotos en WhatsApp

Los pedidos comparten las fotos mediante una ruta corta del propio sitio: `https://ycnicelady.netlify.app/foto/ID-DEL-PRODUCTO`. Netlify consulta el producto y redirige a la foto pública en Supabase. Esta solución no usa Bitly ni requiere un token externo.

La ruta se define en `netlify.toml` y la función correspondiente está en `netlify/functions/product-photo.js`. Para que funcione en producción, publica los cambios en Netlify. Abrir `index.html` directamente con `file://` no ejecuta la función.