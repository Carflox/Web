// Appwrite Function: read-only public catalog for YC NICE LADY.
// Server-side API key must be stored in Function environment variables only.
export default async ({ req, res, log, error }) => {
  try {
    const endpoint = (process.env.APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1').replace(/\/+$/, '');
    const project = process.env.APPWRITE_PROJECT_ID;
    const key = process.env.APPWRITE_API_KEY;
    const db = process.env.APPWRITE_DATABASE_ID;
    const table = process.env.APPWRITE_PRODUCTS_TABLE_ID;
    if (!project || !key || !db || !table) throw new Error('Falta configuración del servidor Appwrite.');

    const queries = [
      'limit(100)',
      'orderAsc("sort_order")',
      'equal("is_active",[true])'
    ];
    const queryString = queries.map(q => `queries[]=${encodeURIComponent(q)}`).join('&');
    const url = `${endpoint}/tablesdb/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}/rows?${queryString}`;
    const response = await fetch(url, {
      headers: { 'X-Appwrite-Project': project, 'X-Appwrite-Key': key, 'Content-Type': 'application/json' }
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || `Appwrite HTTP ${response.status}`);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const products = rows.map(row => ({
      id: row.$id, name: row.name, price: row.price, description: row.description || '',
      stock: row.stock, image_path: row.image_path || '', category: row.category || '',
      sort_order: row.sort_order || 0, is_active: row.is_active,
      created_at: row.created_at || row.$createdAt, kit_items: row.kit_items || ''
    }));
    return res.json(products);
  } catch (e) {
    error?.(e.message);
    return res.json({ message: e.message }, 500);
  }
};
