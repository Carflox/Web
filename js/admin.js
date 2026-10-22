const config = window.YCNiceLadyConfig || {};
const { productsBucket: PRODUCTS_BUCKET, publishableKey: SUPABASE_PUBLISHABLE_KEY, supabaseUrl: SUPABASE_URL } = config;
const storeIsConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && PRODUCTS_BUCKET);
const sessionStorageKey = 'yc-nice-lady-admin-session';

const loginView = document.querySelector('#loginView');
const adminView = document.querySelector('#adminView');
const loginForm = document.querySelector('#loginForm');
const loginMessage = document.querySelector('#loginMessage');
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
  return `${SUPABASE_URL}${path}`;
}

function publicStorageUrl(path) {
  if (!path) return '';
  const safePath = String(path).split('/').map(encodeURIComponent).join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(PRODUCTS_BUCKET)}/${safePath}`;
}

async function request(path, options = {}, { useSession = true } = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('apikey', SUPABASE_PUBLISHABLE_KEY);
  headers.set('Authorization', `Bearer ${useSession && session ? session.accessToken : SUPABASE_PUBLISHABLE_KEY}`);

  const response = await fetch(apiUrl(path), { ...options, headers });
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
  return ({ pestanas: 'Pestañas', libros: 'Libros', racimos: 'Racimos', kits: 'Kits', maquillaje: 'Maquillajes', accesorios: 'Accesorios' })[category] || 'Accesorios';
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
      ? `<button class="admin-product-image admin-product-image-button" type="button" data-preview-product-image="${product.id}" aria-label="Ampliar foto de ${escapeHtml(product.name)}" title="Haz clic para ampliar la foto"><img src="${url}" alt=""><span aria-hidden="true">Ampliar</span></button>`
      : '<div class="admin-product-image">♡</div>';
    return `
      <article class="admin-product" draggable="${!adminProductSearch.value.trim()}" data-product-id="${product.id}">
        ${photo}
        <div>
          <h3>${escapeHtml(product.name)}</h3>
          <p>${escapeHtml(product.description || 'Sin descripción')}</p>
          <div class="admin-product-meta"><span>${formatMoney(product.price)}</span><span>Stock: ${product.stock}</span><span>${categoryLabel(product.category)}</span><span class="visibility ${product.is_active ? '' : 'hidden'}">${product.is_active ? 'Visible' : 'Oculto'}</span></div>
        </div>
        <div class="row-actions">
          <button type="button" data-action="edit" data-product-id="${product.id}">Editar</button>
          <button class="delete" type="button" data-action="delete" data-product-id="${product.id}">Eliminar</button>
        </div>
      </article>`;
  }).join('');
}

async function isStoreAdmin() {
  return (await request('/rest/v1/rpc/is_store_admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })) === true;
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
  await request(`/storage/v1/object/${encodeURIComponent(PRODUCTS_BUCKET)}/${safePath}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type, 'x-upsert': 'false', 'cache-control': '3600' },
    body: file
  });
}

async function removeImage(imagePath) {
  if (!imagePath) return;
  await request(`/storage/v1/object/${encodeURIComponent(PRODUCTS_BUCKET)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [imagePath] })
  });
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
  const stock = Number(form.get('stock'));

  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
    setMessage(productMessage, 'Revisa el precio y el stock.', true);
    return;
  }
  if (file instanceof File && file.size > 5 * 1024 * 1024) {
    setMessage(productMessage, 'La foto debe pesar menos de 5 MB.', true);
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
      uploadedImagePath = `products/${id}/${Date.now()}.${fileExtension(file)}`;
      await uploadImage(uploadedImagePath, file);
      imagePath = uploadedImagePath;
    }

    const productData = {
      id, name, description, category, price, stock, image_path: imagePath,
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
  if (!storeIsConfigured) {
    setMessage(loginMessage, 'Falta la configuración de conexión de la tienda.', true);
    return;
  }
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
    setMessage(loginMessage, error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : `No se pudo iniciar sesión: ${error.message}`, true);
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
