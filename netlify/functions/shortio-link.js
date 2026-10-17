const SITE_ORIGIN = 'https://ycnicelady.netlify.app';
const SHORT_IO_DOMAIN = 'ycnicelady.s.gy';
const PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(payload)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { Allow: 'POST' }, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.SHORT_IO;
  if (!apiKey) {
    return json(503, { error: 'La clave de Short.io todavía no está configurada en Netlify.' });
  }

  let productId;
  try {
    ({ productId } = JSON.parse(event.body || '{}'));
  } catch {
    return json(400, { error: 'Solicitud no válida.' });
  }
  if (!PRODUCT_ID_PATTERN.test(String(productId || ''))) {
    return json(400, { error: 'Identificador de producto no válido.' });
  }

  // La versión de la URL genera un enlace nuevo para evitar que WhatsApp reutilice
  // la vista previa anterior, que seguía mostrando el destino largo de Supabase.
  const originalURL = `${SITE_ORIGIN}/foto/${encodeURIComponent(productId)}?v=2`;
  try {
    const response = await fetch('https://api.short.io/links', {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ originalURL, domain: SHORT_IO_DOMAIN, allowDuplicates: false })
    });
    const result = await response.json();
    const link = result.secureShortURL || result.shortURL;
    if (!response.ok || !link) {
      console.error('Short.io API error:', response.status, result.message || result.error || 'No devolvió un enlace');
      return json(502, { error: 'Short.io no pudo crear el enlace.' });
    }
    return json(200, { link });
  } catch (error) {
    console.error('Short.io request failed:', error);
    return json(502, { error: 'No se pudo contactar a Short.io.' });
  }
};
