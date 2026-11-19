// Appwrite Function: catálogo público y reserva de stock de YC NICE LADY.
// Las claves viven solo en las variables de entorno de la Function.

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function getConfig() {
  const config = {
    endpoint: (
      process.env.APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1'
    ).replace(/\/$/, ''),
    project: process.env.APPWRITE_PROJECT_ID,
    key: process.env.APPWRITE_API_KEY,
    database: process.env.APPWRITE_DATABASE_ID,
    table: process.env.APPWRITE_PRODUCTS_TABLE_ID
  };

  if (!config.project || !config.key || !config.database || !config.table) {
    throw new HttpError(500, 'Falta configuración del servidor Appwrite.');
  }

  return config;
}

async function tableApi(config, path, { method = 'GET', body } = {}) {
  const url =
    `${config.endpoint}/tablesdb/${encodeURIComponent(config.database)}` +
    `/tables/${encodeURIComponent(config.table)}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      'X-Appwrite-Project': config.project,
      'X-Appwrite-Key': config.key,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpError(
      response.status,
      data.message || `Appwrite HTTP ${response.status}`
    );
  }

  return data;
}

function readBody(req) {
  try {
    if (req.bodyJson && typeof req.bodyJson === 'object') return req.bodyJson;
  } catch {
    // cuerpo vacío o inválido
  }

  try {
    return JSON.parse(req.bodyText || req.body || '{}');
  } catch {
    return {};
  }
}

function parseKitItems(value) {
  if (Array.isArray(value)) return value;

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

async function loadCatalog(config) {
  const rows = [];
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const queries = [{ method: 'limit', values: [PAGE_SIZE] }];

    if (cursor) queries.push({ method: 'cursorAfter', values: [cursor] });

    const queryString = queries
      .map(query => `queries[]=${encodeURIComponent(JSON.stringify(query))}`)
      .join('&');

    const data = await tableApi(config, `/rows?${queryString}`);
    const batch = Array.isArray(data.rows) ? data.rows : [];

    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;

    cursor = batch[batch.length - 1].$id;
  }

  return rows
    .filter(row => row.is_active !== false)
    .sort(
      (a, b) =>
        Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) ||
        String(a.name || '').localeCompare(String(b.name || ''), 'es')
    )
    .map(row => ({
      id: row.$id,
      name: row.name,
      price: row.price,
      description: row.description || '',
      stock: Number(row.stock) || 0,
      image_path: row.image_path || '',
      category: row.category || '',
      sort_order: row.sort_order ?? 0,
      is_active: row.is_active !== false,
      created_at: row.created_at || row.$createdAt,
      kit_items: parseKitItems(row.kit_items)
    }));
}

async function reserveStock(config, items, report) {
  if (!Array.isArray(items) || !items.length || items.length > 50) {
    throw new HttpError(400, 'Pedido inválido.');
  }

  const wanted = new Map();

  for (const item of items) {
    const id = String(item?.id || '');
    const quantity = Math.trunc(Number(item?.quantity));

    if (!id || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) {
      throw new HttpError(400, 'Pedido inválido.');
    }

    wanted.set(id, (wanted.get(id) || 0) + quantity);
  }

  const entries = [...wanted];

  // 1. Verificar todo antes de descontar nada.
  await Promise.all(
    entries.map(async ([id, quantity]) => {
      const row = await tableApi(config, `/rows/${encodeURIComponent(id)}`);

      if (row.is_active === false || Number(row.stock) < quantity) {
        throw new HttpError(409, `Sin stock suficiente de ${row.name}.`);
      }
    })
  );

  // 2. Descontar. allSettled espera a todos y deja ver cuáles se aplicaron.
  const results = await Promise.allSettled(
    entries.map(([id, quantity]) =>
      tableApi(config, `/rows/${encodeURIComponent(id)}/stock/decrement`, {
        method: 'PATCH',
        body: { value: quantity, min: 0 }
      })
    )
  );

  if (results.every(result => result.status === 'fulfilled')) return;

  // 3. Algo falló: devolver el stock de los que sí se descontaron.
  const applied = entries.filter(
    (_, index) => results[index].status === 'fulfilled'
  );

  const rollback = await Promise.allSettled(
    applied.map(([id, quantity]) =>
      tableApi(config, `/rows/${encodeURIComponent(id)}/stock/increment`, {
        method: 'PATCH',
        body: { value: quantity }
      })
    )
  );

  rollback
    .filter(result => result.status === 'rejected')
    .forEach(result =>
      report?.(`No se pudo devolver el stock: ${result.reason?.message}`)
    );

  throw new HttpError(409, 'El stock cambió antes de confirmar el pedido.');
}

async function catalogHandler({ req, res, log, error }) {
  try {
    const config = getConfig();
    const body = readBody(req);

    if (Array.isArray(body?.order_items)) {
      await reserveStock(config, body.order_items, error);
      log?.('Stock reservado.');
      return res.json({ success: true });
    }

    const products = await loadCatalog(config);
    log?.(`Catálogo cargado: ${products.length} productos`);
    return res.json(products);
  } catch (e) {
    error?.(e.message);

    return res.json(
      { success: false, message: e.message || 'Error en la función.' },
      e instanceof HttpError ? e.status : 500
    );
  }
}

export default catalogHandler;
