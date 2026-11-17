const trimEnd = value => String(value || '').replace(/\/+$/, '');

export const appwriteEndpoint = trimEnd(process.env.APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1');
export const appwriteProjectId = process.env.APPWRITE_PROJECT_ID || '';
export const appwriteDatabaseId = process.env.APPWRITE_DATABASE_ID || '';
export const appwriteProductsTableId = process.env.APPWRITE_PRODUCTS_TABLE_ID || '';
export const appwriteProductsBucketId = process.env.APPWRITE_PRODUCTS_BUCKET_ID || '';
export const appwriteApiKey = process.env.APPWRITE_API_KEY || '';
export const appwriteConfigured = Boolean(
  appwriteEndpoint && appwriteProjectId && appwriteDatabaseId
  && appwriteProductsTableId && appwriteProductsBucketId && appwriteApiKey
);

export function assertAppwriteConfigured() {
  if (!appwriteConfigured) {
    throw Object.assign(new Error('Configura APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_DATABASE_ID, APPWRITE_PRODUCTS_TABLE_ID, APPWRITE_PRODUCTS_BUCKET_ID y APPWRITE_API_KEY en el entorno de Netlify.'), { status: 503 });
  }
}

export async function appwrite(path, options = {}) {
  assertAppwriteConfigured();
  const headers = new Headers(options.headers || {});
  headers.set('X-Appwrite-Project', appwriteProjectId);
  headers.set('X-Appwrite-Key', appwriteApiKey);
  if (options.body && !(options.body instanceof FormData) && !(options.body instanceof ArrayBuffer) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${appwriteEndpoint}${path}`, { ...options, headers });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const message = body && typeof body === 'object'
      ? (body.message || body.error || body.type)
      : body;
    throw Object.assign(new Error(message || `Appwrite respondió ${response.status}.`), { status: response.status });
  }
  return { body, response };
}

const tableRowsPath = `/tablesdb/${encodeURIComponent(appwriteDatabaseId)}/tables/${encodeURIComponent(appwriteProductsTableId)}/rows`;
const storageFilesPath = `/storage/buckets/${encodeURIComponent(appwriteProductsBucketId)}/files`;
const queryEqual = (key, value) => `equal(${JSON.stringify(key)},${JSON.stringify([value])})`;
const queryLimit = value => `limit(${Math.max(1, Math.min(100, Math.trunc(value)))})`;
const queryOffset = value => `offset(${Math.max(0, Math.trunc(value))})`;

export async function listAppwriteRows(queries = []) {
  const rows = [];
  let offset = 0;
  while (true) {
    const params = new URLSearchParams();
    for (const query of queries) params.append('queries[]', query);
    params.append('queries[]', queryLimit(100));
    params.append('queries[]', queryOffset(offset));
    const { body } = await appwrite(`${tableRowsPath}?${params.toString()}`);
    const page = Array.isArray(body?.rows) ? body.rows : [];
    rows.push(...page);
    if (page.length < 100 || rows.length >= Number(body?.total || 0)) break;
    offset += page.length;
  }
  return rows;
}

export async function listAppwriteFiles() {
  const files = [];
  let offset = 0;
  while (true) {
    const params = new URLSearchParams();
    params.append('queries[]', queryLimit(100));
    params.append('queries[]', queryOffset(offset));
    const { body } = await appwrite(`${storageFilesPath}?${params.toString()}`);
    const page = Array.isArray(body?.files) ? body.files : [];
    files.push(...page);
    if (page.length < 100 || files.length >= Number(body?.total || 0)) break;
    offset += page.length;
  }
  return files;
}

export async function resolveAppwriteFileId(imagePath, files) {
  const value = String(imagePath || '');
  if (!value) return '';
  const direct = files.find(file => String(file.$id) === value);
  if (direct) return String(direct.$id);
  const filename = value.split(/[\\/]/).pop();
  return String(files.find(file => String(file.name).toLowerCase() === filename.toLowerCase())?.$id || value);
}

export function appwriteImageUrl(fileId) {
  if (!fileId || !appwriteEndpoint || !appwriteProjectId || !appwriteProductsBucketId) return '';
  const params = new URLSearchParams({ project: appwriteProjectId });
  return `${appwriteEndpoint}/storage/buckets/${encodeURIComponent(appwriteProductsBucketId)}/files/${encodeURIComponent(fileId)}/view?${params.toString()}`;
}

export async function getAppwriteProducts(searchParams = new URLSearchParams()) {
  const queries = [];
  const activeFilter = searchParams.get('is_active');
  if (activeFilter?.startsWith('eq.')) queries.push(queryEqual('is_active', activeFilter.slice(3) === 'true'));
  const idFilter = searchParams.get('id');
  if (idFilter?.startsWith('eq.')) queries.push(queryEqual('id', decodeURIComponent(idFilter.slice(3))));
  const ordering = searchParams.get('order');
  for (const part of String(ordering || '').split(',').filter(Boolean)) {
    const [field, direction = 'asc'] = part.split('.');
    if (/^[a-zA-Z][\w]*$/.test(field)) queries.push(`${direction.toLowerCase() === 'desc' ? 'orderDesc' : 'orderAsc'}(${JSON.stringify(field)})`);
  }
  const rows = await listAppwriteRows(queries);
  const files = await listAppwriteFiles();
  return Promise.all(rows.map(async row => {
    let kitItems = row.kit_items;
    if (typeof kitItems === 'string') {
      try { kitItems = JSON.parse(kitItems); } catch { kitItems = []; }
    }
    return {
      ...row,
      id: String(row.id || row.$id),
      kit_items: Array.isArray(kitItems) ? kitItems : [],
      image_path: await resolveAppwriteFileId(row.image_path, files)
    };
  }));
}

export async function findAppwriteProductRow(productId) {
  const rows = await listAppwriteRows([queryEqual('id', String(productId))]);
  return rows.find(row => String(row.id || row.$id) === String(productId))
    || rows.find(row => String(row.$id) === String(productId))
    || null;
}

export async function saveAppwriteProduct(product) {
  const id = String(product.id || '');
  if (!id) throw Object.assign(new Error('Falta el identificador del producto.'), { status: 400 });
  const data = { ...product };
  delete data.$id;
  delete data.$sequence;
  delete data.$createdAt;
  delete data.$updatedAt;
  if (Array.isArray(data.kit_items)) data.kit_items = JSON.stringify(data.kit_items);
  const existing = await findAppwriteProductRow(id);
  if (existing) {
    await appwrite(`${tableRowsPath}/${encodeURIComponent(existing.$id)}`, {
      method: 'PATCH', body: JSON.stringify({ data })
    });
    return { ...existing, ...data, id };
  }
  const { body } = await appwrite(tableRowsPath, {
    method: 'POST', body: JSON.stringify({ rowId: id, data })
  });
  return { ...body, id };
}

export async function updateAppwriteProduct(productId, data) {
  const existing = await findAppwriteProductRow(productId);
  if (!existing) throw Object.assign(new Error('No se encontró el producto.'), { status: 404 });
  const payload = { ...data };
  if (Array.isArray(payload.kit_items)) payload.kit_items = JSON.stringify(payload.kit_items);
  const { body } = await appwrite(`${tableRowsPath}/${encodeURIComponent(existing.$id)}`, {
    method: 'PATCH', body: JSON.stringify({ data: payload })
  });
  return body;
}

export async function deleteAppwriteProduct(productId) {
  const existing = await findAppwriteProductRow(productId);
  if (!existing) return false;
  await appwrite(`${tableRowsPath}/${encodeURIComponent(existing.$id)}`, { method: 'DELETE' });
  return true;
}

export async function findAppwriteFileId(imagePath) {
  const files = await listAppwriteFiles();
  return resolveAppwriteFileId(imagePath, files);
}

export async function createAppwriteFile(fileName, bytes, mimeType) {
  const form = new FormData();
  form.append('fileId', crypto.randomUUID());
  form.append('file', new Blob([bytes], { type: mimeType }), fileName);
  const { body } = await appwrite(storageFilesPath, { method: 'POST', body: form });
  return body;
}

export async function deleteAppwriteFile(fileId) {
  if (!fileId) return;
  await appwrite(`${storageFilesPath}/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
}
