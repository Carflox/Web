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

## Enlaces cortos de Bitly en WhatsApp

La tienda usa una función de Netlify para crear enlaces `bit.ly` para las fotos de los productos. El token de Bitly se guarda en Netlify y no debe escribirse en `js/` ni en los archivos públicos del sitio.

### Activar Bitly en el sitio publicado

1. En Bitly, abre **Settings → API** y genera un access token.
2. En la configuración del sitio de Netlify, añade una variable de entorno llamada `BITLY_ACCESS_TOKEN` con ese token. Habilítala para las funciones.
3. Vuelve a publicar el sitio para que la función reciba la variable.
4. Haz un pedido desde la tienda publicada. La foto aparecerá en WhatsApp con un enlace `https://bit.ly/...`.

### Probar en una computadora

Abre la carpeta del proyecto en una terminal con Netlify CLI instalado y ejecuta `netlify dev`. Prueba la tienda desde la dirección local que muestre Netlify. Abrir `index.html` directamente con `file://` no ejecuta la función de Netlify.

Si el token no está configurado o Bitly no responde, el pedido no incluirá la URL larga de Supabase; indicará que la foto se compartirá al confirmar la disponibilidad.
