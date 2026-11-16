import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const env = {};
for (const line of (await readFile(resolve(root, '.env'), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (match && !match[1].startsWith('#')) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
const db = new DatabaseSync(resolve(root, 'data/store.sqlite3'), { readOnly: true });
const products = db.prepare(`select id,name,description,category,price,cost_price,stock,image_path,is_active,sort_order,created_at from products`).all()
  .map(row => ({ ...row, is_active: Boolean(row.is_active) }));
const savedAdmin = db.prepare(`select salt,password_hash,updated_at from admin_credentials where id=1`).get() || null;
db.close();

const target = String(env.SUPABASE_URL || '').replace(/\/$/, '');
console.log(`Productos locales encontrados: ${products.length}`);
console.log(`Contraseña de administrador restablecida guardada: ${savedAdmin ? 'sí (solo se copia su hash)' : 'no'}`);
console.log(`Destino configurado: ${target || '(falta SUPABASE_URL)'}`);
if (!process.argv.includes('--confirm-transfer')) {
  console.log('Vista previa solamente. Tras autorizar el envío, ejecuta: node migrate-sqlite-products.mjs --confirm-transfer');
  process.exit(0);
}
if (!target || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.');

for (let offset = 0; offset < products.length; offset += 100) {
  const batch = products.slice(offset, offset + 100);
  const response = await fetch(`${target}/rest/v1/products?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(batch)
  });
  if (!response.ok) throw new Error(`Supabase rechazó la migración (HTTP ${response.status}). No se borró ningún producto existente.`);
}
if (savedAdmin) {
  const updatedAt = new Date(Number(savedAdmin.updated_at) * 1000).toISOString();
  const response = await fetch(`${target}/rest/v1/store_admin_credentials?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({ id: 1, salt: savedAdmin.salt, password_hash: savedAdmin.password_hash, updated_at: updatedAt })
  });
  if (!response.ok) throw new Error(`No se pudo copiar el hash guardado de la contraseña (HTTP ${response.status}).`);
}
console.log(`Migración completada: ${products.length} productos copiados${savedAdmin ? ' y el hash de la contraseña guardada' : ''}. Los registros que no estaban en SQLite no se eliminaron.`);
