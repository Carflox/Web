import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const out = join(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of ['index.html', 'admin.html', 'ads.txt', 'manifest.webmanifest', 'service-worker.js']) {
  await cp(join(root, file), join(out, file));
}
for (const dir of ['css', 'js', 'img']) await cp(join(root, dir), join(out, dir), { recursive: true });
const publicConfig = {
  appwriteEndpoint: process.env.APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1',
  appwriteProjectId: process.env.APPWRITE_PROJECT_ID || '',
  supabaseUrl: process.env.SUPABASE_URL || 'https://kwqoowouazoqmneejuxz.supabase.co',
  productsBucket: process.env.APPWRITE_PRODUCTS_BUCKET_ID || process.env.SUPABASE_PRODUCTS_BUCKET || 'product-images',
  whatsappNumber: process.env.WHATSAPP_NUMBER || '51930197471'
};
await writeFile(join(out, 'js', 'supabase-config.js'), `window.YCNiceLadyConfig = Object.freeze(${JSON.stringify(publicConfig)});\n`, 'utf8');
