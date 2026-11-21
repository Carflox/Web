// Copia los productos de data/store.sqlite3 a la tabla de productos de Appwrite.
//
//   node migrate-sqlite-products.mjs                       → vista previa (no envía nada)
//   node migrate-sqlite-products.mjs --verify              → lista los productos que faltan en Appwrite
//   node migrate-sqlite-products.mjs --confirm-transfer    → crea o actualiza los productos
//   (opcional) --with-cost  → también envía cost_price (solo si la tabla tiene esa columna)

import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const send = args.has('--confirm-transfer');
const verifyOnly = args.has('--verify');
const withCost = args.has('--with-cost');

// ==========================================
// 1. VARIABLES (appwrite.env, o .env si no existe)
// ==========================================

const exists = path => access(path).then(() => true, () => false);

async function readEnv() {
  for (const name of ['appwrite.env', '.env']) {
    const file = resolve(root, name);

    if (!(await exists(file))) continue;

    const env = {};

    for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
      const text = line.trim();
      const separator = text.indexOf('=');

      if (!text || text.startsWith('#') || separator < 1) continue;

      env[text.slice(0, separator).trim()] = text
        .slice(separator + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
    }

    console.log(`Variables leídas de ${name}`);
    return env;
  }

  throw new Error('No se encontró appwrite.env ni .env en esta carpeta.');
}

const env = await readEnv();

const endpoint = (env.APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1').replace(/\/$/, '');
const project = env.APPWRITE_PROJECT_ID;
const key = env.APPWRITE_API_KEY;
const database = env.APPWRITE_DATABASE_ID;
const table = env.APPWRITE_PRODUCTS_TABLE_ID;

if (!project || !key || !database || !table) {
  throw new Error('Faltan APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID o APPWRITE_PRODUCTS_TABLE_ID.');
}

const tableUrl =
  `${endpoint}/tablesdb/${encodeURIComponent(database)}/tables/${encodeURIComponent(table)}`;

const headers = {
  'X-Appwrite-Project': project,
  'X-Appwrite-Key': key,
  'Content-Type': 'application/json'
};

// ==========================================
// 2. LLAMADAS A APPWRITE (con reintentos)
// ==========================================

const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));

async function api(path, { method = 'GET', body } = {}) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(`${tableUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await sleep(attempt * 800);
      continue;
    }

    const data = await response.json().catch(() => ({}));

    return { status: response.status, ok: response.ok, data };
  }
}

async function listAppwriteIds() {
  const ids = new Set();
  let cursor = null;

  for (;;) {
    const queries = [{ method: 'limit', values: [100] }];

    if (cursor) queries.push({ method: 'cursorAfter', values: [cursor] });

    const query = queries.map(q => `queries[]=${encodeURIComponent(JSON.stringify(q))}`).join('&');
    const { ok, data } = await api(`/rows?${query}`);

    if (!ok) throw new Error(`No se pudo listar la tabla: ${data.message}`);

    const rows = data.rows || [];

    rows.forEach(row => ids.add(row.$id));

    if (rows.length < 100) return ids;

    cursor = rows.at(-1).$id;
  }
}

// ==========================================
// 3. COMPROBAR QUE EL DESTINO EXISTE (evita IDs mal escritos)
// ==========================================

const preflight = await api('');

if (!preflight.ok) {
  throw new Error(
    `No se encontró la tabla en Appwrite (HTTP ${preflight.status}: ${preflight.data.message}). ` +
    'Revisa APPWRITE_DATABASE_ID y APPWRITE_PRODUCTS_TABLE_ID.'
  );
}

console.log(`Destino: tabla "${preflight.data.name}" en ${endpoint}`);

// ==========================================
// 4. LEER SQLITE
// ==========================================

let sqlitePath = resolve(root, 'data', 'store.sqlite3');

if (!(await exists(sqlitePath))) sqlitePath = resolve(root, 'store.sqlite3');

const db = new DatabaseSync(sqlitePath, { readOnly: true });
const products = db.prepare('SELECT * FROM products').all();

db.close();

console.log(`SQLite: ${products.length} productos (${sqlitePath})`);

if (products[0] && !('kit_items' in products[0])) {
  console.log('Aviso: la base SQLite no tiene la columna kit_items; los kits quedarán vacíos.');
}

// ==========================================
// 5. COMPARAR CON APPWRITE
// ==========================================

const existing = await listAppwriteIds();
const missing = products.filter(product => !existing.has(String(product.id)));

console.log(`Appwrite: ${existing.size} filas · faltan ${missing.length} de SQLite`);
missing.forEach(product => console.log(`  falta: ${product.name} (${product.id})`));

if (verifyOnly || !send) {
  console.log(
    send
      ? ''
      : '\nVista previa: no se envió nada. Usa --confirm-transfer para crear o actualizar productos.'
  );
  process.exit(0);
}

// ==========================================
// 6. ENVIAR (5 a la vez)
// ==========================================

const toData = product => ({
  name: product.name ?? '',
  description: product.description ?? '',
  category: product.category ?? '',
  price: Number(product.price ?? 0),
  stock: Number(product.stock ?? 0),
  image_path: product.image_path ?? '',
  is_active: Boolean(product.is_active),
  sort_order: Number(product.sort_order ?? 0),
  created_at: product.created_at ?? '',
  kit_items: product.kit_items ?? '',
  ...(withCost ? { cost_price: Number(product.cost_price ?? 0) } : {})
});

async function migrate(product) {
  const rowId = String(product.id);
  const data = toData(product);
  const update = await api(`/rows/${encodeURIComponent(rowId)}`, { method: 'PUT', body: { data } });

  if (update.ok) return 'actualizado';

  if (update.status !== 404) throw new Error(`HTTP ${update.status}: ${update.data.message}`);

  const create = await api('/rows', { method: 'POST', body: { rowId, data } });

  if (!create.ok) throw new Error(`Al crear, HTTP ${create.status}: ${create.data.message}`);

  return 'creado';
}

let done = 0;
const failures = [];
const queue = [...products];

await Promise.all(
  Array.from({ length: 5 }, async () => {
    for (let product = queue.shift(); product; product = queue.shift()) {
      try {
        const result = await migrate(product);
        done++;
        console.log(`${result}: ${product.name}`);
      } catch (error) {
        failures.push(product.name);
        console.error(`Error con ${product.name}: ${error.message}`);
      }
    }
  })
);

console.log('==========================================');
console.log(`Migrados: ${done} de ${products.length} · fallidos: ${failures.length}`);
console.log('==========================================');

if (failures.length) process.exitCode = 1;
