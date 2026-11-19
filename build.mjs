import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const out = join(root, 'dist');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const files = [
  'index.html',
  'admin.html',
  'ads.txt',
  'manifest.webmanifest',
  'service-worker.js'
];

await Promise.all(
  files.map(file =>
    cp(join(root, file), join(out, file))
  )
);

await Promise.all(
  ['css', 'js', 'img'].map(dir =>
    cp(join(root, dir), join(out, dir), { recursive: true })
  )
);

// ==========================================
// CONFIGURACIÓN PÚBLICA APPWRITE
// NO COLOCAR API KEY EN EL FRONTEND
// ==========================================

const publicConfig = {
  appwriteEndpoint:
    process.env.APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1',

  appwriteProjectId:
    process.env.APPWRITE_PROJECT_ID || '6afbf48e003dc6106784',

  appwriteDatabaseId:
    process.env.APPWRITE_DATABASE_ID || '6afc0156001d3dd77b2e',

  appwriteProductsTableId:
    process.env.APPWRITE_PRODUCTS_TABLE_ID || '6afc017900116468e591',

  appwriteDataTableId:
    process.env.APPWRITE_DATA_TABLE_ID || '6afcd21b000632adbef4',

  appwriteProductsBucketId:
    process.env.APPWRITE_PRODUCTS_BUCKET_ID || '6afc6a210013e1e1daad',

  appwriteProductsFunctionId:
    process.env.APPWRITE_PRODUCTS_FUNCTION_ID || '',

  whatsappNumber:
    process.env.WHATSAPP_NUMBER || '51930197471'
};

// ==========================================
// GENERAR CONFIGURACIÓN PARA EL FRONTEND
// ==========================================

await writeFile(
  join(out, 'js', 'supabase-config.js'),
  `window.YCNiceLadyConfig = Object.freeze(${JSON.stringify(publicConfig, null, 2)});\n`,
  'utf8'
);

console.log('Build de YC NICE LADY generado.');
console.log('Configuración pública de Appwrite generada.');
console.log('Database ID:', publicConfig.appwriteDatabaseId);
console.log('Products Table:', publicConfig.appwriteProductsTableId);
console.log('Data Table:', publicConfig.appwriteDataTableId);
console.log('Storage Bucket:', publicConfig.appwriteProductsBucketId);