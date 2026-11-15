const config = window.YCNiceLadyConfig || {};
const { productsBucket: PRODUCTS_BUCKET, supabaseUrl: SUPABASE_URL } = config;
const storeIsConfigured = true;
const sessionStorageKey = 'yc-nice-lady-python-session-v1';

const loginView = document.querySelector('#loginView');
const adminView = document.querySelector('#adminView');
const loginForm = document.querySelector('#loginForm');
const loginMessage = document.querySelector('#loginMessage');
const passwordToggle = document.querySelector('#toggleAdminPassword');
const passwordInput = loginForm.elements.password;
passwordToggle.addEventListener('click', () => {
  const showPassword = passwordInput.type === 'password';
  passwordInput.type = showPassword ? 'text' : 'password';
  passwordToggle.textContent = showPassword ? 'Ocultar' : 'Ver';
  passwordToggle.setAttribute('aria-label', showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
  passwordToggle.setAttribute('aria-pressed', String(showPassword));
  passwordInput.focus({ preventScroll: true });
});
try {
  const emailFromUnsafeLink = sessionStorage.getItem('yc-nice-lady-login-email');
  const cameFromUnsafeLink = sessionStorage.getItem('yc-nice-lady-login-url-warning') === 'true';
  if (emailFromUnsafeLink) {
    loginForm.elements.email.value = emailFromUnsafeLink;
    sessionStorage.removeItem('yc-nice-lady-login-email');
    loginForm.elements.password.focus();
  }
  if (cameFromUnsafeLink) {
    sessionStorage.removeItem('yc-nice-lady-login-url-warning');
    setMessage(loginMessage, 'Por seguridad, eliminé la contraseña del enlace. Escribe tu contraseña actualizada en este formulario y pulsa Ingresar.');
  }
} catch { /* El inicio de sesión sigue funcionando manualmente. */ }
const productForm = document.querySelector('#productForm');
const productMessage = document.querySelector('#productMessage');
const productList = document.querySelector('#adminProducts');
const summary = document.querySelector('#productsSummary');
const formTitle = document.querySelector('#formTitle');
const resetFormButton = document.querySelector('#resetProductForm');
const saveButton = document.querySelector('#saveProduct');
const adminProductSearch = document.querySelector('#adminProductSearch');
const orderStatus = document.querySelector('#adminOrderStatus');
const imagePreview = document.querySelector('#adminImagePreview');
const previewImage = document.querySelector('#adminPreviewImage');
const previewCaption = document.querySelector('#adminPreviewCaption');

let products = [];
let draggedProductId = null;
let session = readSavedSession();

function readSavedSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(sessionStorageKey));
    if (!saved?.accessToken || (saved.expiresAt && Date.now() >= saved.expiresAt * 1000 - 30_000)) {
      localStorage.removeItem(sessionStorageKey);
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

function saveSession(authResult) {
  session = {
    accessToken: authResult.access_token,
    expiresAt: authResult.expires_at || Math.floor(Date.now() / 1000) + Number(authResult.expires_in || 3600)
  };
  localStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

function clearSession() {
  session = null;
  localStorage.removeItem(sessionStorageKey);
}

function apiUrl(path) {
  return path;
}

function publicStorageUrl(path) {
  if (!path) return '';
  const safePath = String(path).split('/').map(encodeURIComponent).join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(PRODUCTS_BUCKET)}/${safePath}`;
}

async function request(path, options = {}, { useSession = true } = {}) {
  const headers = new Headers(options.headers || {});
  if (useSession && session?.accessToken) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
  }

  const response = await fetch(apiUrl(path), { ...options, headers, credentials: 'same-origin' });
  const responseText = await response.text();
  let payload = null;
  try { payload = responseText ? JSON.parse(responseText) : null; } catch { payload = responseText; }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload ? (payload.message || payload.error || payload.msg) : '';
    throw new Error(message || 'No se pudo completar la operación.');
  }
  return payload;
}

function setMessage(element, message = '', isError = false) {
  element.textContent = message;
  element.classList.toggle('error', isError);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function formatMoney(value) {
  return `S/ ${Number(value || 0).toFixed(2)}`;
}

function categoryLabel(category) {
  return ({ libros: 'Libros', set: 'Set', kits: 'Kits', maquillaje: 'Maquillajes', accesorios: 'Accesorios' })[category] || 'Accesorios';
}

function normalizeSearchText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

function resetProductForm() {
  productForm.reset();
  productForm.elements.id.value = '';
  productForm.elements.existingImagePath.value = '';
  productForm.elements.isActive.checked = true;
  formTitle.textContent = 'Nuevo producto';
  saveButton.textContent = 'Guardar producto';
  resetFormButton.hidden = true;
  setMessage(productMessage);
}

function renderProducts() {
  const query = normalizeSearchText(adminProductSearch.value);
  const visibleProducts = products.filter((product) => !query || normalizeSearchText(`${product.name} ${product.description || ''} ${categoryLabel(product.category)} ${product.category || ''}`).includes(query));
  summary.textContent = query
    ? `${visibleProducts.length} de ${products.length} productos encontrados`
    : `${products.length} producto${products.length === 1 ? '' : 's'} en total`;
  if (!products.length) {
    productList.innerHTML = '<p class="empty-list">Aún no creaste ningún producto.</p>';
    return;
  }

  if (!visibleProducts.length) {
    productList.innerHTML = '<p class="empty-list">No se encontraron productos con esa búsqueda.</p>';
    return;
  }

  productList.innerHTML = visibleProducts.map((product) => {
    const url = publicStorageUrl(product.image_path);
    const photo = url
      ? `<button class="admin-product-image admin-product-image-button" type="button" data-preview-product-image="${product.id}" aria-label="Ampliar foto de ${escapeHtml(product.name)}" title="Haz clic para ampliar la foto"><img src="${url}" alt="" loading="lazy" decoding="async" fetchpriority="low"><span aria-hidden="true">Ampliar</span></button>`
      : '<div class="admin-product-image">♡</div>';
    return `
      <article class="admin-product" draggable="${!adminProductSearch.value.trim()}" data-product-id="${product.id}">
        ${photo}
        <div>
          <h3>${escapeHtml(product.name)}</h3>
          <p>${escapeHtml(product.description || 'Sin descripción')}</p>
          <div class="admin-product-meta"><span>Venta ${formatMoney(product.price)}</span><span>Costo ${formatMoney(product.cost_price)}</span><span>Margen ${formatMoney(Number(product.price)-Number(product.cost_price||0))}</span><span>Stock: ${product.stock}</span><span>${categoryLabel(product.category)}</span><span class="visibility ${product.is_active ? '' : 'hidden'}">${product.is_active ? 'Visible' : 'Oculto'}</span></div>
        </div>
        <div class="row-actions">
          <button type="button" data-action="edit" data-product-id="${product.id}">Editar</button>
          <button class="delete" type="button" data-action="delete" data-product-id="${product.id}">Eliminar</button>
        </div>
      </article>`;
  }).join('');
}

async function isStoreAdmin() {
  const result = await request('/api/session');
  return result.authenticated === true;
}

async function loadProducts({ preserveScroll = false, scrollTop = productList.scrollTop } = {}) {
  summary.textContent = 'Cargando…';
  productList.innerHTML = '<p class="loading">Cargando productos…</p>';
  try {
    const search = new URLSearchParams({ select: '*', order: 'sort_order.asc,created_at.desc' });
    products = await request(`/rest/v1/products?${search}`) || [];
    renderProducts();
    if (preserveScroll) productList.scrollTop = scrollTop;
  } catch (error) {
    summary.textContent = 'No se pudo cargar';
    productList.innerHTML = /sort_order/i.test(error.message)
      ? '<p class="empty-list">Para activar el reordenamiento, ejecuta primero supabase/add-product-sort-order.sql en el SQL Editor de Supabase.</p>'
      : '<p class="empty-list">No se pudo cargar el catálogo. Vuelve a iniciar sesión.</p>';
    console.error('No se pudo cargar el panel:', error);
  }
}

function editProduct(product) {
  productForm.elements.id.value = product.id;
  productForm.elements.existingImagePath.value = product.image_path || '';
  productForm.elements.name.value = product.name;
  productForm.elements.description.value = product.description || '';
  productForm.elements.category.value = product.category || 'accesorios';
  productForm.elements.price.value = product.price;
  productForm.elements.cost_price.value = Number(product.cost_price || 0);
  productForm.elements.stock.value = product.stock;
  productForm.elements.isActive.checked = product.is_active;
  formTitle.textContent = `Editar: ${product.name}`;
  saveButton.textContent = 'Guardar cambios';
  resetFormButton.hidden = false;
  setMessage(productMessage);
  productForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fileExtension(file) {
  const byType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  return byType[file.type] || 'jpg';
}

async function optimizeProductImage(file) {
  if (!('createImageBitmap' in window) || !('toBlob' in document.createElement('canvas'))) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('No se pudo optimizar la foto.')), 'image/webp', 0.8));
    if (blob.type !== 'image/webp') return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp', lastModified: file.lastModified });
  } finally { bitmap.close?.(); }
}

const productImageHashCacheKey = 'yc-nice-lady-product-image-hashes-v1';
function readProductImageHashCache() {
  try { return JSON.parse(localStorage.getItem(productImageHashCacheKey) || '{}'); } catch { return {}; }
}
function saveProductImageHashCache(cache) {
  try { localStorage.setItem(productImageHashCacheKey, JSON.stringify(cache)); } catch { /* El cotejo sigue funcionando sin caché. */ }
}
async function perceptualImageHash(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas'); canvas.width = 9; canvas.height = 8;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, 9, 8);
    const pixels = context.getImageData(0, 0, 9, 8).data;
    const gray = [];
    for (let i = 0; i < pixels.length; i += 4) gray.push(Math.round(pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114));
    let bits = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += gray[y * 9 + x] > gray[y * 9 + x + 1] ? '1' : '0';
    return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
  } finally { bitmap.close?.(); }
}
function imageHashDistance(first, second) {
  let bits = BigInt(`0x${first}`) ^ BigInt(`0x${second}`), count = 0;
  while (bits) { count++; bits &= bits - 1n; }
  return count;
}
function catalogNameSimilarity(first, second) {
  const a = normalizeSearchText(first).replace(/[^a-z0-9]+/g, '');
  const b = normalizeSearchText(second).replace(/[^a-z0-9]+/g, '');
  if (!a || !b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]; previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}
async function loadCatalogImageHashes(onProgress = () => {}) {
  const candidates = products.filter(product => product.is_active !== false && product.image_path);
  const cache = readProductImageHashCache();
  let cursor = 0, checked = 0;
  const hashes = new Map();
  const workers = Array.from({ length: Math.min(6, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      const product = candidates[cursor++];
      const cacheKey = `${product.id}:${product.image_path}`;
      try {
        let hash = cache[cacheKey];
        if (!hash) {
          const response = await fetch(publicStorageUrl(product.image_path), { mode: 'cors', cache: 'force-cache' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          hash = await perceptualImageHash(await response.blob());
          cache[cacheKey] = hash;
        }
        hashes.set(String(product.id), hash);
      } catch { /* Una foto inaccesible se omite; se sigue analizando el resto. */ }
      checked++;
      onProgress(checked, candidates.length, hashes.size);
    }
  });
  await Promise.all(workers);
  saveProductImageHashCache(cache);
  return { hashes, checked, total: candidates.length };
}

function newProductId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function uploadImage(imagePath, file) {
  const safePath = imagePath.split('/').map(encodeURIComponent).join('/');
  await request(`/api/images/${encodeURIComponent(PRODUCTS_BUCKET)}/${safePath}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file
  });
}

async function removeImage(imagePath) {
  if (!imagePath) return;
  const safePath = imagePath.split('/').map(encodeURIComponent).join('/');
  await request(`/api/images/${encodeURIComponent(PRODUCTS_BUCKET)}/${safePath}`, { method: 'DELETE' });
}

async function saveProduct(event) {
  event.preventDefault();
  const listScrollTop = productList.scrollTop;
  const form = new FormData(productForm);
  const file = form.get('image');
  const currentId = form.get('id');
  const previousImagePath = form.get('existingImagePath');
  const name = form.get('name').trim();
  const description = form.get('description').trim();
  const category = form.get('category');
  const price = Number(form.get('price'));
  const costPrice = Number(form.get('cost_price'));
  const stock = Number(form.get('stock'));

  const comparableName = normalizeSearchText(name).replace(/[^a-z0-9]+/g, '');
  const duplicateProduct = products.find((product) => String(product.id) !== String(currentId || '') && normalizeSearchText(product.name).replace(/[^a-z0-9]+/g, '') === comparableName);
  if (duplicateProduct) {
    setMessage(productMessage, `No se guardó: ya existe “${duplicateProduct.name}” en el catálogo público. Revisa el producto existente.`, true);
    return;
  }
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(costPrice) || costPrice < 0 || !Number.isInteger(stock) || stock < 0) {
    setMessage(productMessage, 'Revisa el precio y el stock.', true);
    return;
  }
  if (file instanceof File && file.size > 20 * 1024 * 1024) {
    setMessage(productMessage, 'La foto original debe pesar menos de 20 MB para poder optimizarla.', true);
    return;
  }
  if (file instanceof File && file.size && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    setMessage(productMessage, 'Usa una foto JPG, PNG o WEBP.', true);
    return;
  }

  saveButton.disabled = true;
  setMessage(productMessage, 'Guardando…');
  const id = currentId || newProductId();
  let imagePath = previousImagePath || null;
  let uploadedImagePath = null;

  try {
    if (file instanceof File && file.size) {
      const optimizedFile = await optimizeProductImage(file);
      if (optimizedFile.size > 5 * 1024 * 1024) throw new Error('La foto sigue superando 5 MB después de optimizarla. Elige una imagen más pequeña.');
      uploadedImagePath = `products/${id}/${Date.now()}.${fileExtension(optimizedFile)}`;
      await uploadImage(uploadedImagePath, optimizedFile);
      imagePath = uploadedImagePath;
    }

    const productData = {
      id, name, description, category, price, cost_price: costPrice, stock, image_path: imagePath,
      is_active: form.get('isActive') === 'on'
    };
    if (!currentId) {
      const firstOrder = products.length ? Math.min(...products.map((product) => Number(product.sort_order) || 0)) : 0;
      productData.sort_order = firstOrder - 1;
    }

    await request('/rest/v1/products?on_conflict=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(productData)
    });

    if (uploadedImagePath && previousImagePath && previousImagePath !== uploadedImagePath) {
      removeImage(previousImagePath).catch(() => {});
    }
    resetProductForm();
    setMessage(productMessage, 'Producto guardado correctamente.');
    await loadProducts({ preserveScroll: true, scrollTop: listScrollTop });
  } catch (error) {
    if (uploadedImagePath) removeImage(uploadedImagePath).catch(() => {});
    setMessage(productMessage, `No se pudo guardar: ${error.message}`, true);
  } finally {
    saveButton.disabled = false;
  }
}

async function deleteProduct(product) {
  const confirmed = window.confirm(`¿Eliminar “${product.name}”? Esta acción también eliminará su foto.`);
  if (!confirmed) return;
  setMessage(productMessage, 'Eliminando producto…');
  try {
    await request(`/rest/v1/products?id=eq.${encodeURIComponent(product.id)}`, { method: 'DELETE' });
    if (product.image_path) removeImage(product.image_path).catch(() => {});
    if (productForm.elements.id.value === product.id) resetProductForm();
    setMessage(productMessage, 'Producto eliminado.');
    await loadProducts();
  } catch (error) {
    setMessage(productMessage, `No se pudo eliminar: ${error.message}`, true);
  }
}

async function showAdminForCurrentSession() {
  if (!session) {
    loginView.hidden = false;
    adminView.hidden = true;
    return;
  }

  try {
    const isAdmin = await isStoreAdmin();
    if (!isAdmin) throw new Error('Este usuario no tiene permiso para administrar la tienda.');
    loginView.hidden = true;
    adminView.hidden = false;
    setMessage(loginMessage);
    try { await migrateLegacyBrowserData(); } catch (migrationError) { console.warn('No se pudo trasladar el historial local:', migrationError); }
    await loadProducts();
  } catch (error) {
    clearSession();
    loginView.hidden = false;
    adminView.hidden = true;
    setMessage(loginMessage, error.message || 'No se pudo iniciar la sesión.', true);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(loginForm);
  setMessage(loginMessage, 'Ingresando…');
  try {
    const authResult = await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.get('email').trim(), password: form.get('password') })
    }, { useSession: false });
    saveSession(authResult);
    await showAdminForCurrentSession();
  } catch (error) {
    clearSession();
    setMessage(loginMessage, error.message === 'Invalid login credentials'
      ? 'Correo o contraseña incorrectos. Verifica los datos de acceso configurados en el servidor.'
      : `No se pudo iniciar sesión. Revisa la conexión e inténtalo de nuevo. (${error.message})`, true);
  }
});

productForm.addEventListener('submit', saveProduct);
resetFormButton.addEventListener('click', resetProductForm);
document.querySelector('#refreshProducts').addEventListener('click', loadProducts);
adminProductSearch.addEventListener('input', renderProducts);
productList.addEventListener('dragstart', (event) => {
  const card = event.target.closest('.admin-product');
  if (!card || adminProductSearch.value.trim()) { event.preventDefault(); return; }
  draggedProductId = card.dataset.productId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedProductId);
  requestAnimationFrame(() => card.classList.add('is-dragging'));
});
productList.addEventListener('dragover', (event) => {
  const target = event.target.closest('.admin-product');
  if (!draggedProductId || !target || target.dataset.productId === draggedProductId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  productList.querySelectorAll('.drop-before, .drop-after').forEach((card) => card.classList.remove('drop-before', 'drop-after'));
  const rect = target.getBoundingClientRect();
  target.classList.add(event.clientY < rect.top + rect.height / 2 ? 'drop-before' : 'drop-after');
});
productList.addEventListener('drop', async (event) => {
  const target = event.target.closest('.admin-product');
  const sourceId = draggedProductId || event.dataTransfer.getData('text/plain');
  if (!sourceId || !target || target.dataset.productId === sourceId) return;
  event.preventDefault();
  const rect = target.getBoundingClientRect();
  const insertAfter = event.clientY >= rect.top + rect.height / 2;
  const oldProducts = products.map((product) => ({ ...product }));
  const sourceIndex = products.findIndex((product) => product.id === sourceId);
  const targetIndex = products.findIndex((product) => product.id === target.dataset.productId);
  if (sourceIndex < 0 || targetIndex < 0) return;

  const reordered = products.map((product) => ({ ...product }));
  const [movedProduct] = reordered.splice(sourceIndex, 1);
  let insertIndex = targetIndex + (insertAfter ? 1 : 0);
  if (sourceIndex < insertIndex) insertIndex -= 1;
  reordered.splice(insertIndex, 0, movedProduct);
  if (insertIndex === sourceIndex) return;

  const previousOrder = reordered[insertIndex - 1]?.sort_order;
  const nextOrder = reordered[insertIndex + 1]?.sort_order;
  movedProduct.sort_order = previousOrder == null ? Number(nextOrder ?? 0) - 1
    : nextOrder == null ? Number(previousOrder) + 1
      : (Number(previousOrder) + Number(nextOrder)) / 2;
  const listScrollTop = productList.scrollTop;
  products = reordered;
  renderProducts();
  productList.scrollTop = listScrollTop;
  orderStatus.textContent = 'Guardando el nuevo orden…';

  try {
    await request(`/rest/v1/products?id=eq.${encodeURIComponent(movedProduct.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ sort_order: movedProduct.sort_order })
    });
    orderStatus.textContent = 'Orden actualizado.';
  } catch (error) {
    products = oldProducts;
    renderProducts();
    productList.scrollTop = listScrollTop;
    orderStatus.textContent = `No se pudo guardar el orden: ${error.message}`;
  }
});
productList.addEventListener('dragend', () => {
  draggedProductId = null;
  productList.querySelectorAll('.is-dragging, .drop-before, .drop-after').forEach((card) => card.classList.remove('is-dragging', 'drop-before', 'drop-after'));
});
document.querySelector('#signOut').addEventListener('click', async () => {
  try { await request('/auth/v1/logout', { method: 'POST', body: '{}' }, { useSession: false }); } catch { /* La sesión local igual se limpia. */ }
  clearSession();
  resetProductForm();
  await showAdminForCurrentSession();
});
productList.addEventListener('click', (event) => {
  const previewButton = event.target.closest('[data-preview-product-image]');
  if (previewButton) {
    const product = products.find((item) => item.id === previewButton.dataset.previewProductImage);
    if (!product?.image_path) return;
    previewImage.src = publicStorageUrl(product.image_path);
    previewImage.alt = product.name;
    previewCaption.textContent = product.name;
    imagePreview.showModal();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const product = products.find((item) => item.id === button.dataset.productId);
  if (!product) return;
  if (button.dataset.action === 'edit') editProduct(product);
  if (button.dataset.action === 'delete') deleteProduct(product);
});
document.querySelector('#closeAdminImagePreview').addEventListener('click', () => imagePreview.close());
imagePreview.addEventListener('click', (event) => {
  if (event.target === imagePreview) imagePreview.close();
});

showAdminForCurrentSession();

// Estadísticas de actividad: el historial completo se pagina desde Supabase.
const analyticsDialog = document.querySelector('#adminAnalytics');
const analyticsStatus = document.querySelector('#analyticsStatus');
const analyticsContent = document.querySelector('#analyticsContent');
const limaHour = (iso) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));
function drawEventChart(node, events, type, color) {
  const data = Array.from({ length: 24 }, (_, h) => events.filter((e) => e.event_type === type && limaHour(e.created_at) === h).length);
  const max = Math.max(1, ...data);
  node.innerHTML = `<div class="analytics-bars">${data.map((n,h)=>`<div class="analytics-bar" title="${String(h).padStart(2,'0')}:00 · ${n}"><span>${n || ''}</span><i style="height:${Math.max(n?3:0,Math.round(100*n/max))}%;background:${color}"></i><small>${String(h).padStart(2,'0')}</small></div>`).join('')}</div><p>Hora de Perú · ${data.reduce((a,b)=>a+b,0)} eventos</p>`;
}
function paintAnalytics(events) {
  const adds=events.filter(e=>e.event_type==='add_to_cart'), wa=events.filter(e=>e.event_type==='whatsapp_click');
  const byProduct=new Map();
  adds.forEach(e=>{const k=e.product_id||e.product_name;const s=byProduct.get(k)||{name:e.product_name,id:e.product_id,units:0,actions:0};s.units+=Number(e.quantity||1);s.actions++;byProduct.set(k,s)});
  const top=[...byProduct.values()].sort((a,b)=>b.units-a.units)[0];
  document.querySelector('#analyticsCards').innerHTML=`<article><span>Unidades agregadas</span><strong>${adds.reduce((n,e)=>n+Number(e.quantity||1),0)}</strong></article><article><span>Clics en WhatsApp</span><strong>${wa.length}</strong></article><article><span>Eventos guardados</span><strong>${events.length}</strong></article>`;
  const topNode=document.querySelector('#topProduct');
  if(!top) topNode.innerHTML='<p>Aún no hay productos agregados al carrito.</p>';
  else {const p=products.find(x=>x.id===top.id);const url=p?.image_path?publicStorageUrl(p.image_path):'';topNode.innerHTML=`<div class="analytics-product">${url?`<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt=""></a>`:'<span>Sin foto</span>'}<div><strong>${escapeHtml(top.name)}</strong><p>${top.units} unidades · ${top.actions} veces agregado</p>${url?`<a href="${url}" target="_blank" rel="noopener">Abrir imagen ↗</a>`:''}</div></div>`}
  drawEventChart(document.querySelector('#cartHourChart'),events,'add_to_cart','#9a5872');drawEventChart(document.querySelector('#whatsappHourChart'),events,'whatsapp_click','#57a783');
  document.querySelector('#analyticsHistory').innerHTML=events.map(e=>{const p=products.find(x=>x.id===e.product_id);const url=p?.image_path?publicStorageUrl(p.image_path):'';const when=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',dateStyle:'short',timeStyle:'short',hourCycle:'h23'}).format(new Date(e.created_at));return `<tr><td>${when}</td><td>${e.event_type==='add_to_cart'?'Agregó al carrito':'Clic para pedir por WhatsApp'}</td><td>${url?`<a class="analytics-history-product" href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="">${escapeHtml(e.product_name)}</a>`:escapeHtml(e.product_name)}</td><td>${e.quantity}</td></tr>`}).join('')||'<tr><td colspan="4">No hay actividad registrada todavía.</td></tr>';
  document.querySelector('#analyticsHistorySummary').textContent=`${events.length} eventos; historial completo, del más reciente al más antiguo.`;analyticsContent.hidden=false;
}
async function loadAnalyticsHistory(){analyticsStatus.textContent='Cargando historial de actividad…';analyticsContent.hidden=true;try{await loadDismissedWhatsappIds();let all=[],offset=0,page;do{page=await request(`/rest/v1/store_analytics_events?select=id,event_type,product_id,product_name,quantity,created_at&order=created_at.desc&limit=1000&offset=${offset}`);all.push(...(page||[]));offset+=1000}while(page&&page.length===1000);const dismissedIds=readDismissedWhatsappIds();all=all.filter(item=>!dismissedIds.has(String(item.id)));paintAnalytics(all);analyticsStatus.textContent='Actividad del catálogo · los pedidos descartados se excluyen de los gráficos'}catch(e){analyticsStatus.textContent=`No se pudo cargar: ${e.message}`}}
document.querySelector('#openAnalytics').addEventListener('click',()=>{analyticsDialog.showModal();loadAnalyticsHistory()});
document.querySelector('#closeAnalytics').addEventListener('click',()=>analyticsDialog.close());
analyticsDialog.addEventListener('click',e=>{if(e.target===analyticsDialog)analyticsDialog.close()});

// Finanzas: ingresos confirmados, costo vendido, compras de inventario y gastos operativos.
const financeDialog = document.querySelector('#adminFinance');
const financeStatus = document.querySelector('#financeStatus');
const financeTotals = document.querySelector('#financeTotals');
const financeSalesLedger = document.querySelector('#financeSalesLedger');
const financeExpenseLedger = document.querySelector('#financeExpenseLedger');
const financeSupplierChart = document.querySelector('#financeSupplierChart');
const financePendingWhatsapp = document.querySelector('#financePendingWhatsapp');
const financePendingStatus = document.querySelector('#financePendingStatus');
const financeCategoryLabels = { sale: 'Venta', delivery: 'Delivery pagado', gasolina: 'Gasolina', material_moto: 'Materiales de moto', productos: 'Compra de inventario', empaque: 'Empaques', otros: 'Otros gastos' };
const financeSaleProduct = document.querySelector('#financeSaleProduct');
let latestFinanceEntries = [];
let dismissedWhatsappIds = new Set();
async function migrateLegacyBrowserData() {
  const marker = 'ycNiceLady.pythonMigration.v1';
  if (localStorage.getItem(marker) === 'done') return;
  const oldFinance = JSON.parse(localStorage.getItem('ycNiceLady.financeEntries.v1') || '[]');
  const oldDismissed = JSON.parse(localStorage.getItem('ycNiceLady.dismissedWhatsAppEvents.v1') || '[]');
  if (!Array.isArray(oldFinance) || !Array.isArray(oldDismissed)) throw new Error('El respaldo antiguo del navegador no tiene un formato válido.');
  const current = await request('/api/finance');
  const ids = new Set(current.map(row => String(row.id)));
  const analyticsIds = new Set(current.map(row => String(row.analytics_event_id || '')).filter(Boolean));
  for (const entry of oldFinance) {
    if (ids.has(String(entry.id)) || (entry.analytics_event_id && analyticsIds.has(String(entry.analytics_event_id)))) continue;
    await request('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
  }
  const currentDismissed = new Set((await request('/api/dismissed-whatsapp')).map(String));
  for (const id of oldDismissed) {
    if (!currentDismissed.has(String(id))) await request('/api/dismissed-whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: String(id) }) });
  }
  localStorage.setItem(marker, 'done');
}
async function loadDismissedWhatsappIds() {
  dismissedWhatsappIds = new Set((await request('/api/dismissed-whatsapp')).map(String));
}
function readDismissedWhatsappIds() { return dismissedWhatsappIds; }
async function dismissWhatsapp(id) {
  await request('/api/dismissed-whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: String(id) }) });
  dismissedWhatsappIds.add(String(id));
}
function financeMoney(value) { return `S/ ${Number(value || 0).toFixed(2)}`; }
function financeDate(value) { return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(value)); }
function financeLimaDayKey(value) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = type => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function financeDateInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function setFinanceDateDefaults() {
  document.querySelectorAll('#financeSaleForm [name="created_at"], #financeExpenseForm [name="created_at"]').forEach(input => { if (!input.value) input.value = financeDateInputValue(); });
}
function refreshFinanceSaleProducts() {
  const selected = financeSaleProduct.value;
  financeSaleProduct.innerHTML = '<option value="">Venta general</option>' + products.map(product => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)} · ${financeMoney(product.price)}</option>`).join('');
  if (products.some(product => String(product.id) === selected)) financeSaleProduct.value = selected;
}
function syncFinanceSaleFields({ useCurrentPrices = false } = {}) {
  const form = document.querySelector('#financeSaleForm');
  const product = products.find(item => String(item.id) === financeSaleProduct.value);
  const quantity = Math.max(1, Number(form.elements.quantity.value) || 1);
  if (product && useCurrentPrices) {
    form.elements.unit_price.value = Number(product.price || 0).toFixed(2);
  }
  if (product) form.elements.description.value = `${product.name} × ${quantity}`;
  form.elements.amount.value = (Math.max(0, Number(form.elements.unit_price.value) || 0) * quantity).toFixed(2);
}
function paintFinance(entries) {
  const salesEntries = entries.filter(entry => entry.entry_type === 'sale');
  const expenseEntries = entries.filter(entry => entry.entry_type === 'expense');
  const sales = salesEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const inventoryPurchases = expenseEntries.filter(entry => entry.category === 'productos').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const operatingExpenses = expenseEntries.filter(entry => entry.category !== 'productos').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const totalCosts = inventoryPurchases + operatingExpenses;
  const profit = sales - totalCosts;
  financeTotals.innerHTML = `<article><span>Ventas confirmadas</span><strong>${financeMoney(sales)}</strong></article><article><span>Compras a proveedores</span><strong>${financeMoney(inventoryPurchases)}</strong></article><article><span>Otros gastos</span><strong>${financeMoney(operatingExpenses)}</strong></article><article><span>Total costos y gastos</span><strong>${financeMoney(totalCosts)}</strong></article><article><span>Balance estimado</span><strong>${financeMoney(profit)}</strong></article>`;

  const today = new Date();
  const trend = Array.from({ length: 14 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - 13 + index);
    const key = financeLimaDayKey(day);
    const amount = salesEntries.filter(entry => financeLimaDayKey(entry.created_at) === key).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    return { label: new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium' }).format(day), shortLabel: key.slice(5), dateKey: key, value: amount };
  });
  renderInteractiveChart(document.querySelector('#financeTrendChart'), trend, 'line', 'vertical');
  const costsBySource = new Map();
  expenseEntries.forEach(entry => {
    const source = String(entry.supplier || '').trim() || financeCategoryLabels[entry.category] || entry.category;
    costsBySource.set(source, (costsBySource.get(source) || 0) + Number(entry.amount || 0));
  });
  renderInteractiveChart(financeSupplierChart, [...costsBySource].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })), 'bar', 'horizontal');

  financeSalesLedger.innerHTML = salesEntries.map(entry => {
    const quantity = Math.max(1, Number(entry.quantity || 1));
    const product = entry.product_id ? products.find(item => String(item.id) === String(entry.product_id)) : null;
    return `<tr><td>${financeDate(entry.created_at)}</td><td>${escapeHtml(product?.name || 'Venta general')}</td><td>${quantity} u.</td><td>${financeMoney(Number(entry.amount || 0) / quantity)}</td><td>${financeMoney(entry.amount)}</td><td><button class="finance-delete" type="button" data-finance-delete="${escapeHtml(entry.id)}" aria-label="Eliminar venta">Eliminar</button></td></tr>`;
  }).join('') || '<tr><td colspan="6">Aún no hay ventas confirmadas.</td></tr>';
  financeExpenseLedger.innerHTML = expenseEntries.map(entry => {
    const isInventory = entry.category === 'productos';
    return `<tr><td>${financeDate(entry.created_at)}</td><td>${isInventory ? 'Compra a proveedor' : 'Gasto operativo'}</td><td>${escapeHtml(entry.supplier || '—')}</td><td>${escapeHtml(entry.description)}</td><td>${financeMoney(entry.amount)}</td><td><button class="finance-delete" type="button" data-finance-delete="${escapeHtml(entry.id)}" aria-label="Eliminar costo o gasto">Eliminar</button></td></tr>`;
  }).join('') || '<tr><td colspan="6">Aún no hay costos ni gastos registrados.</td></tr>';
}
async function loadFinanceEntries() {
  const [all] = await Promise.all([request('/api/finance'), loadDismissedWhatsappIds()]);
  latestFinanceEntries = all;
  paintFinance(all);
  financeStatus.textContent = `${all.length} movimientos guardados en el servidor Python`;
  await Promise.all([loadFinanceProductPerformance(), loadPendingWhatsappOrders()]);
}
async function loadPendingWhatsappOrders() {
  if (!financePendingWhatsapp || !financePendingStatus) return;
  try {
    let events = [], offset = 0, page;
    do {
      page = await request(`/rest/v1/store_analytics_events?select=id,event_type,product_id,product_name,quantity,created_at&event_type=eq.whatsapp_click&order=created_at.desc&limit=1000&offset=${offset}`);
      events.push(...(page || [])); offset += 1000;
    } while (page && page.length === 1000);
    const recorded = new Set(latestFinanceEntries.map(row => String(row.analytics_event_id || '')).filter(Boolean));
    const resolved = readDismissedWhatsappIds();
    const pending = events.filter(event => !recorded.has(String(event.id)) && !resolved.has(String(event.id)));
    financePendingWhatsapp.innerHTML = pending.map(event => `<tr><td>${financeDate(event.created_at)}</td><td>${escapeHtml(event.product_name || 'Producto')}</td><td>${Math.max(1, Number(event.quantity || 1))} u.</td><td class="finance-pending-actions"><button class="finance-review" type="button" data-whatsapp-review="${escapeHtml(event.id)}" data-product-id="${escapeHtml(event.product_id || '')}">Confirmar venta</button><button class="finance-delete" type="button" data-whatsapp-dismiss="${escapeHtml(event.id)}">No se concretó</button></td></tr>`).join('') || '<tr><td colspan="4">No hay pedidos pendientes de revisar.</td></tr>';
    financePendingStatus.textContent = `${pending.length} pedidos pendientes · confirma los concretados y descarta los demás.`;
  } catch (error) {
    financePendingWhatsapp.innerHTML = '<tr><td colspan="4">No se pudo leer la actividad de WhatsApp del catálogo.</td></tr>';
    financePendingStatus.textContent = `No se pudieron cargar los pedidos: ${error.message}`;
  }
}
async function submitFinance(form, entryType) {
  const data = new FormData(form);
  const description = String(data.get('description') || '').trim();
  const amount = Number(data.get('amount'));
  const createdAt = new Date(String(data.get('created_at') || ''));
  if (!description || !Number.isFinite(amount) || amount <= 0 || Number.isNaN(createdAt.getTime())) {
    financeStatus.textContent = 'Completa fecha, descripción y un monto mayor que cero.';
    return;
  }
  let payload;
  if (entryType === 'sale') {
    const productId = String(data.get('product_id') || '');
    const product = products.find(item => String(item.id) === productId);
    const quantity = Number(data.get('quantity'));
    const unitPrice = Number(data.get('unit_price'));
    if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      financeStatus.textContent = 'Revisa la cantidad y el precio unitario de venta.';
      return;
    }
    payload = { entry_type: 'sale', category: 'sale', description, amount, product_id: product?.id || null, quantity, cost_amount: 0, created_at: createdAt.toISOString() };
    const analyticsEventId = String(data.get('analytics_event_id') || '');
    if (analyticsEventId) payload.analytics_event_id = analyticsEventId;
  } else {
    payload = { entry_type: 'expense', category: String(data.get('category')), description, supplier: String(data.get('supplier') || '').trim() || null, amount, created_at: createdAt.toISOString() };
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  if (payload.analytics_event_id && latestFinanceEntries.some(row => String(row.analytics_event_id || '') === payload.analytics_event_id)) {
    financeStatus.textContent = 'Este pedido ya se confirmó como venta.';
    button.disabled = false;
    return;
  }
  payload.id = globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    await request('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (error) {
    financeStatus.textContent = `No se pudo guardar en Python: ${error.message}`;
    button.disabled = false;
    return;
  }
  form.reset();
  if (entryType === 'sale') {
    form.elements.quantity.value = '1';
    form.elements.unit_price.value = '';
    financeSaleProduct.value = '';
  }
  setFinanceDateDefaults();
  await loadFinanceEntries();
  financeStatus.textContent = entryType === 'sale'
    ? 'Venta confirmada guardada en el servidor.'
    : payload.category === 'productos' ? 'Compra del proveedor guardada en el servidor.' : 'Gasto guardado en el servidor.';
  button.disabled = false;
}
document.querySelector('#openFinance').addEventListener('click', () => {
  financeDialog.showModal();
  refreshFinanceSaleProducts();
  setFinanceDateDefaults();
  loadFinanceEntries();
});
document.querySelector('#closeFinance').addEventListener('click', () => financeDialog.close());
financeDialog.addEventListener('click', event => { if (event.target === financeDialog) financeDialog.close(); });
financeSaleProduct.addEventListener('change', () => syncFinanceSaleFields({ useCurrentPrices: true }));
document.querySelector('#financeSaleForm').elements.quantity.addEventListener('input', () => syncFinanceSaleFields());
document.querySelector('#financeSaleForm').elements.unit_price.addEventListener('input', () => syncFinanceSaleFields());
financePendingWhatsapp.addEventListener('click', async event => {
  const dismissButton = event.target.closest('[data-whatsapp-dismiss]');
  if (dismissButton) {
    dismissButton.disabled = true;
    try { await dismissWhatsapp(dismissButton.dataset.whatsappDismiss); await loadFinanceEntries(); }
    catch (error) { financeStatus.textContent = `No se pudo descartar el pedido: ${error.message}`; dismissButton.disabled = false; }
    return;
  }
  const button = event.target.closest('[data-whatsapp-review]');
  if (!button) return;
  const row = button.closest('tr');
  const cells = row.querySelectorAll('td');
  const eventId = button.dataset.whatsappReview;
  const productName = cells[1].textContent.trim();
  const quantity = Math.max(1, Number.parseInt(cells[2].textContent, 10) || 1);
  const eventRecord = products.find(product => String(product.id) === String(button.dataset.productId));
  const form = document.querySelector('#financeSaleForm');
  const productId = button.dataset.productId || '';
  financeSaleProduct.value = products.some(product => String(product.id) === productId) ? productId : '';
  form.elements.analytics_event_id.value = eventId;
  form.elements.created_at.value = financeDateInputValue();
  form.elements.quantity.value = String(quantity);
  if (eventRecord) {
    form.elements.unit_price.value = Number(eventRecord.price || 0).toFixed(2);
    form.elements.description.value = `${eventRecord.name} × ${quantity}`;
  } else {
    form.elements.unit_price.value = '';
    form.elements.description.value = `${productName} × ${quantity}`;
  }
  form.elements.amount.value = eventRecord ? (Number(eventRecord.price || 0) * quantity).toFixed(2) : '';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  financeStatus.textContent = 'Pedido cargado para revisión. Confirma el pago y verifica precio y costo antes de guardarlo como venta.';
});
document.querySelector('#financeSaleForm').addEventListener('submit', event => { event.preventDefault(); submitFinance(event.currentTarget, 'sale'); });
document.querySelector('#financeExpenseForm').addEventListener('submit', event => { event.preventDefault(); submitFinance(event.currentTarget, 'expense'); });
const financeExpenseForm = document.querySelector('#financeExpenseForm');
function syncFinanceSupplierRequired() { financeExpenseForm.elements.supplier.required = financeExpenseForm.elements.category.value === 'productos'; }
financeExpenseForm.elements.category.addEventListener('change', syncFinanceSupplierRequired);
syncFinanceSupplierRequired();
document.querySelectorAll('#financeSaleForm, #financeExpenseForm').forEach(form => form.addEventListener('reset', () => setTimeout(() => { setFinanceDateDefaults(); syncFinanceSupplierRequired(); })));
financeDialog.addEventListener('click', async event => {
  const button = event.target.closest('[data-finance-delete]');
  if (!button || !window.confirm('¿Eliminar este movimiento financiero?')) return;
  button.disabled = true;
  const removed = latestFinanceEntries.find(row => String(row.id) === String(button.dataset.financeDelete));
  try {
    await request(`/api/finance?id=${encodeURIComponent(button.dataset.financeDelete)}`, { method: 'DELETE' });
    if (removed?.analytics_event_id) await dismissWhatsapp(removed.analytics_event_id);
    await loadFinanceEntries();
  } catch (error) { financeStatus.textContent = `No se pudo eliminar el movimiento: ${error.message}`; button.disabled = false; }
});

// Controles compartidos para alternar gráficas de línea, barras y circular.
const chartPalette = ['#e63946','#457b9d','#2a9d8f','#f4a261','#7b2cbf','#f72585','#4361ee','#90be6d'];
function renderInteractiveChart(node, points, initialMode='bar', initialOrientation='vertical') {
  node.chartPoints = points;
  const mode=node.querySelector('[data-chart-mode]')?.value||initialMode;
  const orientation=node.querySelector('[data-chart-orientation]')?.value||initialOrientation;
  const valid=points.filter(point=>Number(point.value)>0);
  const colors=valid.map((point,index)=>point.color||chartPalette[index%chartPalette.length]);
  const total=valid.reduce((sum,point)=>sum+Number(point.value),0);
  let visual='<p class="chart-empty">Aún no hay datos para graficar.</p>';
  if(valid.length&&mode==='pie'){
    let cursor=0;const segments=valid.map((point,index)=>{const start=cursor;cursor+=Number(point.value)/total*100;return `${colors[index]} ${start}% ${cursor}%`}).join(',');
    visual=`<div class="pie-layout"><div class="pie-chart" style="background:conic-gradient(${segments})" role="img" aria-label="Gráfico circular"></div><ul class="pie-legend">${valid.map((point,index)=>`<li><i style="background:${colors[index]}"></i><span>${escapeHtml(point.label)}</span><strong>${Number(point.value).toLocaleString('es-PE',{maximumFractionDigits:2})}</strong></li>`).join('')}</ul></div>`;
  }else if(valid.length&&mode==='line'){
    const max=Math.max(1,...valid.map(point=>Number(point.value))),width=Math.max(520,valid.length*48),height=190,pad=24;
    const coords=valid.map((point,index)=>({x:valid.length===1?width/2:pad+index*(width-pad*2)/(valid.length-1),y:height-pad-Number(point.value)/max*(height-pad*2),...point}));
    const gradientId=`${node.id}-line-gradient`;
    const stops=colors.map((color,index)=>`<stop offset="${colors.length===1?0:index/(colors.length-1)*100}%" stop-color="${color}"/>`).join('');
    visual=`<div class="line-chart-wrap"><svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico lineal"><defs><linearGradient id="${gradientId}" x1="0" x2="1">${stops}</linearGradient></defs><polyline points="${coords.map(point=>`${point.x},${point.y}`).join(' ')}" fill="none" stroke="url(#${gradientId})" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${coords.map((point,index)=>`<circle cx="${point.x}" cy="${point.y}" r="4" fill="${colors[index]}"><title>${escapeHtml(point.label)}: ${Number(point.value).toLocaleString('es-PE')}</title></circle>${index%Math.max(1,Math.ceil(coords.length/10))===0?`<text x="${point.x}" y="${height-3}" text-anchor="middle">${escapeHtml(point.shortLabel||point.label)}</text>`:''}`).join('')}</svg></div>`;
  }else if(valid.length){
    const max=Math.max(1,...valid.map(point=>Number(point.value)));
    visual=`<div class="bar-chart ${orientation==='horizontal'?'horizontal':'vertical'}">${valid.map((point,index)=>`<div class="bar-item" title="${escapeHtml(point.label)} · ${Number(point.value).toLocaleString('es-PE')}"><span>${escapeHtml(point.shortLabel||point.label)}</span><i style="--bar-size:${Math.max(2,Number(point.value)/max*100)}%;--bar-color:${colors[index]}"></i><strong>${Number(point.value).toLocaleString('es-PE',{maximumFractionDigits:2})}</strong></div>`).join('')}</div>`;
  }
  node.innerHTML=`<div class="chart-controls"><label>Tipo<select data-chart-mode><option value="line" ${mode==='line'?'selected':''}>Línea</option><option value="bar" ${mode==='bar'?'selected':''}>Barras</option><option value="pie" ${mode==='pie'?'selected':''}>Circular</option></select></label><label class="chart-orientation" ${mode==='line'||mode==='pie'?'hidden':''}>Orientación<select data-chart-orientation><option value="vertical" ${orientation==='vertical'?'selected':''}>Vertical</option><option value="horizontal" ${orientation==='horizontal'?'selected':''}>Horizontal</option></select></label></div>${visual}`;
}
function drawEventChart(node,events,type,color){const data=Array.from({length:24},(_,hour)=>events.filter(event=>event.event_type===type&&limaHour(event.created_at)===hour).length);renderInteractiveChart(node,data.map((value,hour)=>({label:`${String(hour).padStart(2,'0')}:00`,shortLabel:String(hour).padStart(2,'0'),value,color:chartPalette[(hour+(type==='whatsapp_click'?3:0))%chartPalette.length]})),'bar','vertical')}
const paintAnalyticsWithCharts=paintAnalytics;
paintAnalytics=function(events){paintAnalyticsWithCharts(events);const adds=events.filter(event=>event.event_type==='add_to_cart'),whatsapp=events.filter(event=>event.event_type==='whatsapp_click');renderInteractiveChart(document.querySelector('#interactionChart'),[{label:'Agregados al carrito',value:adds.length,color:'#e63946'},{label:'Clics en WhatsApp',value:whatsapp.length,color:'#2a9d8f'}],'pie','vertical')};
document.addEventListener('change', event => { const chart = event.target.closest('[data-chart-mode], [data-chart-orientation]')?.closest('.analytics-chart'); if (chart?.chartPoints) renderInteractiveChart(chart, chart.chartPoints); });

async function loadFinanceProductPerformance() {
  const body = document.querySelector('#financeProductPerformance');
  const status = document.querySelector('#financeProductPerformanceStatus');
  if (!body || !status) return;
  try {
    await loadDismissedWhatsappIds();
    let events = [], offset = 0, page;
    do {
      page = await request(`/rest/v1/store_analytics_events?select=id,event_type,product_id,quantity&order=created_at.desc&limit=1000&offset=${offset}`);
      events.push(...(page || [])); offset += 1000;
    } while (page && page.length === 1000);
    const dismissedIds = readDismissedWhatsappIds();
    events = events.filter(event => !dismissedIds.has(String(event.id)));
    const activity = new Map();
    for (const event of events) {
      if (!event.product_id) continue;
      const row = activity.get(String(event.product_id)) || { cart: 0, whatsapp: 0 };
      if (event.event_type === 'add_to_cart') row.cart += Number(event.quantity || 1);
      if (event.event_type === 'whatsapp_click') row.whatsapp++;
      activity.set(String(event.product_id), row);
    }
    const sold = new Map();
    for (const entry of latestFinanceEntries) if (entry.entry_type === 'sale' && entry.product_id) {
      const row = sold.get(String(entry.product_id)) || { quantity: 0, revenue: 0 };
      row.quantity += Number(entry.quantity || 1); row.revenue += Number(entry.amount || 0); sold.set(String(entry.product_id), row);
    }
    body.innerHTML = products.map(product => {
      const engagement = activity.get(String(product.id)) || { cart: 0, whatsapp: 0 };
      const sales = sold.get(String(product.id)) || { quantity: 0, revenue: 0 };
      const src = product.image_path ? `${SUPABASE_URL}/storage/v1/object/public/${PRODUCTS_BUCKET}/${product.image_path.split('/').map(encodeURIComponent).join('/')}` : '';
      return `<tr><td>${src ? `<a href="${escapeHtml(src)}" target="_blank" rel="noopener"><img src="${escapeHtml(src)}" alt="${escapeHtml(product.name)}" loading="lazy" width="44" height="44" style="object-fit:cover;border-radius:8px;vertical-align:middle;margin-right:8px"></a>` : ''}${escapeHtml(product.name)}</td><td>${engagement.cart}</td><td>${engagement.whatsapp}</td><td>${sales.quantity}</td><td>${financeMoney(sales.revenue)}</td></tr>`;
    }).join('');
    status.textContent = 'Actividad del catálogo y ventas confirmadas por producto. Agregar y WhatsApp miden interés, no ventas.';
    await renderSimilarCatalogProducts(activity, sold);
  } catch (error) {
    status.textContent = /store_analytics_events|404|relation/i.test(error.message) ? 'Ejecuta supabase/add-store-analytics.sql para conectar la actividad del catálogo.' : `No se pudieron unir las estadísticas: ${error.message}`;
    const soldFallback = new Map();
    for (const entry of latestFinanceEntries) if (entry.entry_type === 'sale' && entry.product_id) {
      const row = soldFallback.get(String(entry.product_id)) || { quantity: 0, revenue: 0 };
      row.quantity += Number(entry.quantity || 1); row.revenue += Number(entry.amount || 0); soldFallback.set(String(entry.product_id), row);
    }
    await renderSimilarCatalogProducts(new Map(), soldFallback);
  }
}
async function renderSimilarCatalogProducts(activity, sold) {
  const body = document.querySelector('#similarProductsLedger');
  const status = document.querySelector('#similarProductsStatus');
  if (!body || !status) return;
  const candidates = products.filter(product => product.is_active !== false);
  let imageHashes = new Map(), checked = 0, total = 0;
  status.textContent = 'Comparando nombres e imágenes del catálogo público…';
  try {
    const result = await loadCatalogImageHashes((done, count) => { checked = done; total = count; status.textContent = `Comparando fotos del catálogo (${done}/${count})…`; });
    imageHashes = result.hashes;
  } catch { /* El análisis de nombres sigue disponible aunque falle la carga de imágenes. */ }
  const pairs = [];
  for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
    const first = candidates[i], second = candidates[j];
    const nameScore = catalogNameSimilarity(first.name, second.name);
    const firstHash = imageHashes.get(String(first.id)), secondHash = imageHashes.get(String(second.id));
    const photoDistance = firstHash && secondHash ? imageHashDistance(firstHash, secondHash) : null;
    const similarName = nameScore >= 0.78;
    const similarPhoto = photoDistance !== null && photoDistance <= 5;
    if (similarName || similarPhoto) pairs.push({ first, second, nameScore, photoDistance, similarName, similarPhoto });
  }
  const pairActivityScore = product => {
    const engagement = activity.get(String(product.id)) || { cart: 0, whatsapp: 0 };
    const sales = sold.get(String(product.id)) || { quantity: 0, revenue: 0 };
    return sales.quantity * 1000000 + sales.revenue * 1000 + engagement.whatsapp * 10 + engagement.cart;
  };
  pairs.sort((a, b) => pairActivityScore(b.first) + pairActivityScore(b.second) - pairActivityScore(a.first) - pairActivityScore(a.second));
  const metrics = (product, type) => {
    const interactions = activity.get(String(product.id)) || { cart: 0, whatsapp: 0 };
    const sales = sold.get(String(product.id)) || { quantity: 0, revenue: 0 };
    return type === 'cart' ? interactions.cart : type === 'whatsapp' ? interactions.whatsapp : type === 'quantity' ? sales.quantity : financeMoney(sales.revenue);
  };
  const productCell = product => {
    const src = product.image_path ? publicStorageUrl(product.image_path) : '';
    return `<div class="similar-product-cell">${src ? `<a href="${escapeHtml(src)}" target="_blank" rel="noopener"><img src="${escapeHtml(src)}" alt="${escapeHtml(product.name)}" loading="lazy" width="46" height="46"></a>` : ''}<strong>${escapeHtml(product.name)}</strong></div>`;
  };
  body.innerHTML = pairs.map(pair => {
    const labels = [];
    if (pair.similarName) labels.push(`Nombre ${Math.round(pair.nameScore * 100)}%`);
    if (pair.similarPhoto) labels.push(`Foto similar (${pair.photoDistance}/64)`);
    const first = pair.first, second = pair.second;
    return `<tr><td><small>A</small>${productCell(first)}<small>B</small>${productCell(second)}</td><td>${labels.join('<br>')}</td><td>A: ${metrics(first, 'cart')} · B: ${metrics(second, 'cart')}</td><td>A: ${metrics(first, 'whatsapp')} · B: ${metrics(second, 'whatsapp')}</td><td>A: ${metrics(first, 'quantity')} · B: ${metrics(second, 'quantity')}</td><td>A: ${metrics(first, 'revenue')} · B: ${metrics(second, 'revenue')}</td></tr>`;
  }).join('') || '<tr><td colspan="6">No encontramos productos activos con nombres o fotos similares.</td></tr>';
  status.textContent = pairs.length
    ? `${pairs.length} pares parecidos detectados · métricas en orden de producto A / producto B. Revisadas ${checked} de ${total} fotos.`
    : `No encontramos pares similares entre los productos activos. Revisadas ${checked} de ${total} fotos.`;
}
