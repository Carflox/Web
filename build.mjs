import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const out = join(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of ['index.html', 'admin.html', 'ads.txt', 'manifest.webmanifest', 'service-worker.js']) {
  await cp(join(root, file), join(out, file));
}
for (const dir of ['css', 'js', 'img']) await cp(join(root, dir), join(out, dir), { recursive: true });
