import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();

// ==========================================
// 1. LEER VARIABLES DE APPWRITE
// ==========================================

const env = {};
const envFile = await readFile(resolve(root, 'appwrite.env'), 'utf8');

for (const line of envFile.split(/\r?\n/)) {
  const trimmedLine = line.trim();

  if (!trimmedLine || trimmedLine.startsWith('#')) {
    continue;
  }

  const separator = trimmedLine.indexOf('=');

  if (separator < 1) {
    continue;
  }

  const name = trimmedLine.slice(0, separator).trim();
  const value = trimmedLine.slice(separator + 1).trim();

  env[name] = value.replace(/^["']|["']$/g, '');
}

// ==========================================
// 2. VALIDAR CONFIGURACIÓN
// ==========================================

const endpoint = (env.APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1')
  .replace(/\/$/, '');

const project = env.APPWRITE_PROJECT_ID;
const key = env.APPWRITE_API_KEY;
const database = env.APPWRITE_DATABASE_ID;
const table = env.APPWRITE_PRODUCTS_TABLE_ID;

if (!project || !key || !database || !table) {
  throw new Error('Falta configuración de Appwrite en appwrite.env.');
}

const baseUrl =
  `${endpoint}/tablesdb/${encodeURIComponent(database)}` +
  `/tables/${encodeURIComponent(table)}/rows`;

// ==========================================
// 3. LEER PRODUCTOS SQLITE
// ==========================================

const db = new DatabaseSync(resolve(root, 'data/store.sqlite3'), {
  readOnly: true
});

const products = db.prepare(`
  SELECT
    id,
    name,
    description,
    category,
    price,
    cost_price,
    stock,
    image_path,
    is_active,
    sort_order,
    created_at,
    kit_items
  FROM products
`).all();

db.close();

// ==========================================
// 4. PREPARAR MIGRACIÓN
// ==========================================

let migrated = 0;
let failed = 0;

const headers = {
  'X-Appwrite-Project': project,
  'X-Appwrite-Key': key,
  'Content-Type': 'application/json'
};

const migrationTasks = products.map(async (product) => {
  const rowId = String(product.id);

  const data = {
    name: product.name ?? '',
    description: product.description ?? '',
    category: product.category ?? '',
    price: Number(product.price ?? 0),
    stock: Number(product.stock ?? 0),
    image_path: product.image_path ?? '',
    is_active: Boolean(product.is_active),
    sort_order: Number(product.sort_order ?? 0),
    created_at: product.created_at ?? '',
    kit_items: product.kit_items ?? ''
  };

  try {
    const requestUrl = `${baseUrl}/${encodeURIComponent(rowId)}`;

    const response = await fetch(requestUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ data })
    });

    if (response.ok) {
      migrated++;
      console.log(`Actualizado: ${product.name}`);
      return;
    }

    if (response.status !== 404) {
      const errorText = await response.text();

      throw new Error(
        `HTTP ${response.status}: ${errorText}`
      );
    }

    const createResponse = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        rowId,
        data
      })
    });

    if (!createResponse.ok) {
      const createError = await createResponse.text();

      throw new Error(
        `Error al crear (${createResponse.status}): ${createError}`
      );
    }

    migrated++;
    console.log(`Creado: ${product.name}`);
  } catch (migrationError) {
    failed++;

    console.error(
      `Error con ${product.name}: ${migrationError.message}`
    );
  }
});

// ==========================================
// 5. EJECUTAR MIGRACIÓN
// ==========================================

await Promise.all(migrationTasks);

// ==========================================
// 6. RESULTADO
// ==========================================

console.log('==========================================');
console.log('RESULTADO DE MIGRACIÓN');
console.log('==========================================');
console.log(`Total de productos: ${products.length}`);
console.log(`Migrados: ${migrated}`);
console.log(`Fallidos: ${failed}`);
console.log('==========================================');

if (failed > 0) {
  throw new Error(`La migración terminó con ${failed} errores.`);
}

console.log('Migración completada correctamente.');