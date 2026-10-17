const SUPABASE_URL = 'https://kwqoowouazoqmneejuxz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Kj1-MRHUe5I8O0rCvU1e_A_0m73hTSg';
const PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  const id = event.queryStringParameters?.id || event.path.match(/\/foto\/([^/]+)/)?.[1];
  if (!id || !PRODUCT_ID_PATTERN.test(id)) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'Enlace de foto no válido.' };
  }

  try {
    const query = new URLSearchParams({
      select: 'image_path',
      id: `eq.${id}`,
      is_active: 'eq.true',
      limit: '1'
    });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/products?${query}`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
      }
    });
    if (!response.ok) {
      console.error('No se pudo buscar la foto del producto:', response.status);
      return { statusCode: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'No se pudo abrir la foto.' };
    }

    const [product] = await response.json();
    if (!product?.image_path) {
      return { statusCode: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'No se encontró la foto del producto.' };
    }

    const safePath = product.image_path.split('/').map(encodeURIComponent).join('/');
    const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/product-images/${safePath}`;
    const pageUrl = `https://ycnicelady.netlify.app/foto/${encodeURIComponent(id)}?v=2`;
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
    const safeImageUrl = escapeHtml(imageUrl);
    const safePageUrl = escapeHtml(pageUrl);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff'
      },
      body: `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Foto del producto | YC NICE LADY</title>
  <meta name="description" content="Mira este producto de YC NICE LADY.">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="YC NICE LADY">
  <meta property="og:title" content="Foto del producto | YC NICE LADY">
  <meta property="og:description" content="Mira este producto de YC NICE LADY.">
  <meta property="og:url" content="${safePageUrl}">
  <meta property="og:image" content="${safeImageUrl}">
  <meta property="og:image:secure_url" content="${safeImageUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Foto del producto | YC NICE LADY">
  <meta name="twitter:image" content="${safeImageUrl}">
  <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff7f9;font-family:Arial,sans-serif;color:#573b49}.photo{max-width:min(92vw,760px);max-height:92vh;border-radius:16px;object-fit:contain;box-shadow:0 8px 32px #573b4922}</style>
</head>
<body><img class="photo" src="${safeImageUrl}" alt="Producto de YC NICE LADY"></body>
</html>`
    };
  } catch (error) {
    console.error('Error al abrir la foto del producto:', error);
    return { statusCode: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'No se pudo abrir la foto.' };
  }
};
