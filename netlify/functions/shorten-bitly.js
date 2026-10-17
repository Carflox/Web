exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { Allow: 'POST' }, body: 'Method Not Allowed' };
  }

  const token = process.env.BITLY_ACCESS_TOKEN;
  if (!token) {
    return { statusCode: 503, body: JSON.stringify({ error: 'Bitly is not configured.' }) };
  }

  let url;
  try {
    ({ url } = JSON.parse(event.body || '{}'));
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'kwqoowouazoqmneejuxz.supabase.co'
      || !parsed.pathname.startsWith('/storage/v1/object/public/product-images/')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid product image URL.' }) };
    }
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request.' }) };
  }

  try {
    const response = await fetch('https://api-ssl.bitly.com/v4/shorten', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ long_url: url, domain: 'bit.ly' })
    });
    const result = await response.json();
    if (!response.ok || !result.link) {
      console.error('Bitly API error:', response.status, result.message || result.description || 'Unknown error');
      return { statusCode: 502, body: JSON.stringify({ error: 'Bitly could not shorten this link.' }) };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
      body: JSON.stringify({ link: result.link })
    };
  } catch (error) {
    console.error('Bitly request failed:', error);
    return { statusCode: 502, body: JSON.stringify({ error: 'Bitly request failed.' }) };
  }
};
