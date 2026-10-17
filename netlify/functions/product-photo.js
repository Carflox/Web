const SUPABASE_URL = 'https://kwqoowouazoqmneejuxz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Kj1-MRHUe5I8O0rCvU1e_A_0m73hTSg';
const CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function response(statusCode, body, contentType = 'text/plain; charset=utf-8') {
  return {
    statusCode,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' },
    body
  };
}

exports.handler = async (event) => {
  const code = event.queryStringParameters?.code || event.path.match(/\/f\/([^/]+)/)?.[1];
  if (!code || !CODE_PATTERN.test(code)) return response(400, 'Enlace de foto no válido.');

  const hex = Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/') + '==', 'base64').toString('hex');
  if (hex.length !== 32) return response(400, 'Enlace de foto no válido.');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  if (!UUID_PATTERN.test(id)) return response(400, 'Enlace de foto no válido.');

  try {
    const query = new URLSearchParams({ select: 'name,price,image_path', id: `eq.${id}`, is_active: 'eq.true', limit: '1' });
    const result = await fetch(`${SUPABASE_URL}/rest/v1/products?${query}`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
      }
    });
    if (!result.ok) {
      console.error('No se pudo buscar la foto del producto:', result.status);
      return response(502, 'No se pudo abrir la foto.');
    }

    const [product] = await result.json();
    if (!product?.image_path) return response(404, 'No se encontró la foto del producto.');

    const safePath = product.image_path.split('/').map(encodeURIComponent).join('/');
    const imageUrl = htmlEscape(`${SUPABASE_URL}/storage/v1/object/public/product-images/${safePath}`);
    const title = htmlEscape(product.name || 'Producto de YC NICE LADY');
    const price = `S/ ${Number(product.price || 0).toFixed(2)}`;
    const host = event.headers?.['x-forwarded-host'] || event.headers?.host || 'ycnicelady.netlify.app';
    const pageUrl = htmlEscape(`https://${host}/f/${code}`);

    return response(200, `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | YC NICE LADY</title>
  <meta name="description" content="${title} · ${price} · YC NICE LADY">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="YC NICE LADY">
  <meta property="og:title" content="${title} | YC NICE LADY">
  <meta property="og:description" content="${price}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:secure_url" content="${imageUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${imageUrl}">
</head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#fff7f9;font:16px Arial,sans-serif;color:#573b49">
  <main style="max-width:760px;padding:16px;text-align:center">
    <img src="${imageUrl}" alt="${title}" style="display:block;max-width:92vw;max-height:78vh;object-fit:contain;border-radius:16px;margin:auto">
    <h1>${title}</h1><p>${price}</p>
  </main>
</body>
</html>`, 'text/html; charset=utf-8');
  } catch (error) {
    console.error('Error al abrir la foto del producto:', error);
    return response(502, 'No se pudo abrir la foto.');
  }
};
