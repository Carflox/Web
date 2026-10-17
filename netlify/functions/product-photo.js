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
    return {
      statusCode: 302,
      headers: {
        Location: imageUrl,
        'Cache-Control': 'public, max-age=60'
      },
      body: ''
    };
  } catch (error) {
    console.error('Error al abrir la foto del producto:', error);
    return { statusCode: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'No se pudo abrir la foto.' };
  }
};
