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
      ? `<button class="admin-product-image admin-product-image-button" type="button" data-preview-product-image="${product.id}" aria-label="Ampliar foto de ${escapeHtml(product.name)}" title="Haz clic para ampliar la foto"><img src="${url}" alt=""><span aria-hidden="true">Ampliar</span></button>`
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
  const costPrice = Number(form.get('cost_price'));
  const stock = Number(form.get('stock'));

  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(costPrice) || costPrice < 0 || !Number.isInteger(stock) || stock < 0) {
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
async function loadAnalyticsHistory(){analyticsStatus.textContent='Cargando historial completo…';analyticsContent.hidden=true;try{let all=[],offset=0,page;do{page=await request(`/rest/v1/store_analytics_events?select=id,event_type,product_id,product_name,quantity,created_at&order=created_at.desc&limit=1000&offset=${offset}`);all.push(...(page||[]));offset+=1000}while(page&&page.length===1000);paintAnalytics(all);analyticsStatus.textContent='Historial completo · horas de Perú'}catch(e){analyticsStatus.textContent=/store_analytics_events|404|relation/i.test(e.message)?'Primero ejecuta supabase/add-store-analytics.sql en Supabase → SQL Editor.':`No se pudo cargar: ${e.message}`}}
document.querySelector('#openAnalytics').addEventListener('click',()=>{analyticsDialog.showModal();loadAnalyticsHistory()});
document.querySelector('#closeAnalytics').addEventListener('click',()=>analyticsDialog.close());
analyticsDialog.addEventListener('click',e=>{if(e.target===analyticsDialog)analyticsDialog.close()});

// Finanzas: ventas confirmadas y gastos registrados manualmente.
const financeDialog = document.querySelector('#adminFinance');
const financeStatus = document.querySelector('#financeStatus');
const financeTotals = document.querySelector('#financeTotals');
const financeLedger = document.querySelector('#financeLedger');
const expenseBreakdown = document.querySelector('#expenseBreakdown');
const financeCategoryLabels = { sale: 'Venta', delivery: 'Delivery', gasolina: 'Gasolina', material_moto: 'Materiales de moto', productos: 'Compra de productos', empaque: 'Empaques', otros: 'Otros' };
function financeMoney(value) { return `S/ ${Number(value || 0).toFixed(2)}`; }
function financeDate(value) { return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(value)); }
function paintFinance(entries) {
  const sales = entries.filter((entry) => entry.entry_type === 'sale').reduce((sum, entry) => sum + Number(entry.amount), 0);
  const expenses = entries.filter((entry) => entry.entry_type === 'expense').reduce((sum, entry) => sum + Number(entry.amount), 0);
  financeTotals.innerHTML = `<article><span>Ventas confirmadas</span><strong>${financeMoney(sales)}</strong></article><article><span>Gastos registrados</span><strong>${financeMoney(expenses)}</strong></article><article><span>Ganancia neta estimada</span><strong>${financeMoney(sales - expenses)}</strong></article>`;
  const grouped = new Map();
  entries.filter((entry) => entry.entry_type === 'expense').forEach((entry) => grouped.set(entry.category, (grouped.get(entry.category) || 0) + Number(entry.amount)));
  expenseBreakdown.innerHTML = grouped.size ? `<ul class="finance-breakdown">${[...grouped].sort((a, b) => b[1] - a[1]).map(([category, amount]) => `<li><span>${escapeHtml(financeCategoryLabels[category] || category)}</span><strong>${financeMoney(amount)}</strong></li>`).join('')}</ul>` : '<p>Aún no hay gastos registrados.</p>';
  financeLedger.innerHTML = entries.map((entry) => `<tr><td>${financeDate(entry.created_at)}</td><td>${entry.entry_type === 'sale' ? 'Venta' : 'Gasto'}</td><td>${escapeHtml(entry.description)}</td><td>${escapeHtml(financeCategoryLabels[entry.category] || entry.category)}</td><td>${financeMoney(entry.amount)}</td><td><button class="finance-delete" type="button" data-finance-delete="${entry.id}" aria-label="Eliminar movimiento">Eliminar</button></td></tr>`).join('') || '<tr><td colspan="6">Aún no hay movimientos financieros.</td></tr>';
}
async function loadFinanceEntries() {
  financeStatus.textContent = 'Cargando movimientos…';
  try {
    let all = [], offset = 0, page;
    do {
      page = await request(`/rest/v1/store_finance_entries?select=id,entry_type,description,category,amount,product_id,quantity,cost_amount,created_at&order=created_at.desc&limit=1000&offset=${offset}`);
      all.push(...(page || [])); offset += 1000;
    } while (page && page.length === 1000);
    paintFinance(all);
    financeStatus.textContent = `${all.length} movimientos registrados · montos en soles`;
  } catch (error) {
    financeStatus.textContent = /store_finance_entries|404|relation/i.test(error.message) ? 'Primero ejecuta supabase/add-store-finances.sql en Supabase → SQL Editor.' : `No se pudieron cargar las finanzas: ${error.message}`;
  }
}
async function submitFinance(form, entryType) {
  const data = new FormData(form);
  const description = String(data.get('description') || '').trim();
  const amount = Number(data.get('amount'));
  if (!description || !Number.isFinite(amount) || amount <= 0) { financeStatus.textContent = 'Escribe una descripción y un monto mayor que cero.'; return; }
  const category = entryType === 'sale' ? 'sale' : String(data.get('category'));
  const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    await request('/rest/v1/store_finance_entries', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ entry_type: entryType, category, description, amount }) });
    form.reset(); await loadFinanceEntries(); financeStatus.textContent = entryType === 'sale' ? 'Venta confirmada registrada.' : 'Gasto registrado.';
  } catch (error) {
    financeStatus.textContent = /store_finance_entries|404|relation/i.test(error.message) ? 'Ejecuta primero supabase/add-store-finances.sql en Supabase → SQL Editor.' : `No se pudo guardar: ${error.message}`;
  } finally { button.disabled = false; }
}
document.querySelector('#openFinance').addEventListener('click', () => { financeDialog.showModal(); loadFinanceEntries(); });
document.querySelector('#closeFinance').addEventListener('click', () => financeDialog.close());
financeDialog.addEventListener('click', (event) => { if (event.target === financeDialog) financeDialog.close(); });
document.querySelector('#financeSaleForm').addEventListener('submit', (event) => { event.preventDefault(); submitFinance(event.currentTarget, 'sale'); });
document.querySelector('#financeExpenseForm').addEventListener('submit', (event) => { event.preventDefault(); submitFinance(event.currentTarget, 'expense'); });
financeLedger.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-finance-delete]'); if (!button) return;
  if (!window.confirm('¿Eliminar este movimiento financiero?')) return;
  button.disabled = true;
  try { await request(`/rest/v1/store_finance_entries?id=eq.${encodeURIComponent(button.dataset.financeDelete)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); await loadFinanceEntries(); }
  catch (error) { financeStatus.textContent = `No se pudo eliminar: ${error.message}`; button.disabled = false; }
});

// Controles compartidos para alternar gráficas de línea, barras y circular.
const chartPalette = ['#96556e','#54a17c','#d89a55','#7d78bd','#d76b83','#4d91a3','#c27e49','#748d54'];
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
    visual=`<div class="line-chart-wrap"><svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico lineal"><polyline points="${coords.map(point=>`${point.x},${point.y}`).join(' ')}" fill="none" stroke="#96556e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${coords.map((point,index)=>`<circle cx="${point.x}" cy="${point.y}" r="4" fill="#96556e"><title>${escapeHtml(point.label)}: ${Number(point.value).toLocaleString('es-PE')}</title></circle>${index%Math.max(1,Math.ceil(coords.length/10))===0?`<text x="${point.x}" y="${height-3}" text-anchor="middle">${escapeHtml(point.shortLabel||point.label)}</text>`:''}`).join('')}</svg></div>`;
  }else if(valid.length){
    const max=Math.max(1,...valid.map(point=>Number(point.value)));
    visual=`<div class="bar-chart ${orientation==='horizontal'?'horizontal':'vertical'}">${valid.map((point,index)=>`<div class="bar-item" title="${escapeHtml(point.label)} · ${Number(point.value).toLocaleString('es-PE')}"><span>${escapeHtml(point.shortLabel||point.label)}</span><i style="--bar-size:${Math.max(2,Number(point.value)/max*100)}%;--bar-color:${colors[index]}"></i><strong>${Number(point.value).toLocaleString('es-PE',{maximumFractionDigits:2})}</strong></div>`).join('')}</div>`;
  }
  node.innerHTML=`<div class="chart-controls"><label>Tipo<select data-chart-mode><option value="line" ${mode==='line'?'selected':''}>Línea</option><option value="bar" ${mode==='bar'?'selected':''}>Barras</option><option value="pie" ${mode==='pie'?'selected':''}>Circular</option></select></label><label class="chart-orientation" ${mode==='line'||mode==='pie'?'hidden':''}>Orientación<select data-chart-orientation><option value="vertical" ${orientation==='vertical'?'selected':''}>Vertical</option><option value="horizontal" ${orientation==='horizontal'?'selected':''}>Horizontal</option></select></label></div>${visual}`;
}
function drawEventChart(node,events,type,color){const data=Array.from({length:24},(_,hour)=>events.filter(event=>event.event_type===type&&limaHour(event.created_at)===hour).length);renderInteractiveChart(node,data.map((value,hour)=>({label:`${String(hour).padStart(2,'0')}:00`,shortLabel:String(hour).padStart(2,'0'),value,color})),'bar','vertical')}
const paintAnalyticsWithCharts=paintAnalytics;
paintAnalytics=function(events){paintAnalyticsWithCharts(events);const adds=events.filter(event=>event.event_type==='add_to_cart'),whatsapp=events.filter(event=>event.event_type==='whatsapp_click');renderInteractiveChart(document.querySelector('#interactionChart'),[{label:'Agregados al carrito',value:adds.length,color:'#96556e'},{label:'Clics en WhatsApp',value:whatsapp.length,color:'#54a17c'}],'pie','vertical')};
const paintFinanceWithCharts=paintFinance;
paintFinance=function(entries){paintFinanceWithCharts(entries);const dayKey=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));const today=new Date();const days=Array.from({length:14},(_,index)=>{const date=new Date(today);date.setDate(today.getDate()-13+index);const key=dayKey(date);const dayEntries=entries.filter(entry=>dayKey(entry.created_at)===key);return{label:new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit'}).format(date),value:dayEntries.filter(entry=>entry.entry_type==='sale').reduce((sum,entry)=>sum+Number(entry.amount),0)}});renderInteractiveChart(document.querySelector('#financeTrendChart'),days,'line','vertical');const sales=entries.filter(entry=>entry.entry_type==='sale').reduce((sum,entry)=>sum+Number(entry.amount),0),expenses=entries.filter(entry=>entry.entry_type==='expense').reduce((sum,entry)=>sum+Number(entry.amount),0);renderInteractiveChart(document.querySelector('#financeShareChart'),[{label:'Ventas',value:sales,color:'#54a17c'},{label:'Gastos',value:expenses,color:'#d76b83'}],'pie','vertical');const grouped=new Map();entries.filter(entry=>entry.entry_type==='expense').forEach(entry=>grouped.set(entry.category,(grouped.get(entry.category)||0)+Number(entry.amount)));renderInteractiveChart(document.querySelector('#expenseBreakdown'),[...grouped].sort((a,b)=>b[1]-a[1]).map(([category,value])=>({label:financeCategoryLabels[category]||category,value})),'bar','horizontal')};
document.addEventListener('change',event=>{const chart=event.target.closest('[data-chart-mode], [data-chart-orientation]')?.closest('.analytics-chart');if(chart?.chartPoints)renderInteractiveChart(chart,chart.chartPoints)});

// Enlace del costo de cada producto con las ventas confirmadas de Finanzas.
const financeSaleProduct = document.querySelector('#financeSaleProduct');
function refreshFinanceSaleProducts() {
  const selected = financeSaleProduct.value;
  financeSaleProduct.innerHTML = '<option value="">Venta general (sin costo automático)</option>' + products.map(product => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)} · costo ${financeMoney(product.cost_price)}</option>`).join('');
  if (products.some(product => String(product.id) === selected)) financeSaleProduct.value = selected;
}
function syncFinanceSaleProduct() {
  const product = products.find(item => String(item.id) === financeSaleProduct.value);
  if (!product) return;
  const form = document.querySelector('#financeSaleForm');
  const quantity = Math.max(1, Number(form.elements.quantity.value) || 1);
  form.elements.description.value = `${product.name} × ${quantity}`;
  form.elements.amount.value = (Number(product.price) * quantity).toFixed(2);
}
document.querySelector('#openFinance').addEventListener('click', refreshFinanceSaleProducts);
financeSaleProduct.addEventListener('change', syncFinanceSaleProduct);
document.querySelector('#financeSaleForm').elements.quantity.addEventListener('input', syncFinanceSaleProduct);
const submitFinanceWithProductCost = submitFinance;
submitFinance = async function(form, entryType) {
  if (entryType !== 'sale') return submitFinanceWithProductCost(form, entryType);
  const data = new FormData(form);
  const productId = String(data.get('product_id') || '');
  const product = products.find(item => String(item.id) === productId);
  const quantity = Number(data.get('quantity'));
  const description = String(data.get('description') || '').trim();
  const amount = Number(data.get('amount'));
  if (!description || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(amount) || amount <= 0) {
    financeStatus.textContent = 'Revisa el producto, la cantidad y el monto recibido.'; return;
  }
  const costAmount = product ? Number(product.cost_price || 0) * quantity : 0;
  const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    await request('/rest/v1/store_finance_entries', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ entry_type: 'sale', category: 'sale', description, amount, product_id: product?.id || null, quantity, cost_amount: costAmount }) });
    form.reset(); form.elements.quantity.value = '1'; financeSaleProduct.value = ''; await loadFinanceEntries(); financeStatus.textContent = `Venta registrada; costo aplicado: ${financeMoney(costAmount)}.`;
  } catch (error) {
    financeStatus.textContent = /cost_amount|product_id|quantity|schema cache|column/i.test(error.message) ? 'Actualiza Supabase ejecutando supabase/add-product-cost-and-finance.sql en SQL Editor.' : `No se pudo guardar: ${error.message}`;
  } finally { button.disabled = false; }
};
const paintFinanceWithProductCost = paintFinance;
paintFinance = function(entries) {
  paintFinanceWithProductCost(entries);
  const sales=entries.filter(entry=>entry.entry_type==='sale').reduce((sum,entry)=>sum+Number(entry.amount),0);
  const expenses=entries.filter(entry=>entry.entry_type==='expense').reduce((sum,entry)=>sum+Number(entry.amount),0);
  const productCosts=entries.filter(entry=>entry.entry_type==='sale').reduce((sum,entry)=>sum+Number(entry.cost_amount||0),0);
  financeTotals.innerHTML=`<article><span>Ventas confirmadas</span><strong>${financeMoney(sales)}</strong></article><article><span>Gastos registrados</span><strong>${financeMoney(expenses)}</strong></article><article><span>Costo de productos vendidos</span><strong>${financeMoney(productCosts)}</strong></article><article><span>Ganancia neta estimada</span><strong>${financeMoney(sales-expenses-productCosts)}</strong></article>`;
  const grouped=new Map();entries.filter(entry=>entry.entry_type==='expense').forEach(entry=>grouped.set(entry.category,(grouped.get(entry.category)||0)+Number(entry.amount)));
  if(productCosts) grouped.set('costo_productos',productCosts);
  renderInteractiveChart(document.querySelector('#expenseBreakdown'),[...grouped].sort((a,b)=>b[1]-a[1]).map(([category,value])=>({label:category==='costo_productos'?'Costo de productos vendidos':financeCategoryLabels[category]||category,value})),'bar','horizontal');
  financeLedger.innerHTML=entries.map(entry=>`<tr><td>${financeDate(entry.created_at)}</td><td>${entry.entry_type==='sale'?'Venta':'Gasto'}</td><td>${escapeHtml(entry.description)}</td><td>${escapeHtml(entry.entry_type==='sale'&&entry.product_id?(products.find(product=>String(product.id)===String(entry.product_id))?.name||'Producto'):financeCategoryLabels[entry.category]||entry.category)}</td><td>${financeMoney(entry.amount)}</td><td>${entry.entry_type==='sale'?`${Number(entry.quantity||1)} u. · ${financeMoney(entry.cost_amount)}`:'—'}</td><td><button class="finance-delete" type="button" data-finance-delete="${entry.id}" aria-label="Eliminar movimiento">Eliminar</button></td></tr>`).join('')||'<tr><td colspan="7">Aún no hay movimientos financieros.</td></tr>';
};
const paintFinanceChartsWithCosts = paintFinance;
paintFinance = function(entries) {
  paintFinanceChartsWithCosts(entries);
  const sales=entries.filter(entry=>entry.entry_type==='sale').reduce((sum,entry)=>sum+Number(entry.amount),0);
  const expenses=entries.filter(entry=>entry.entry_type==='expense').reduce((sum,entry)=>sum+Number(entry.amount),0);
  const productCosts=entries.filter(entry=>entry.entry_type==='sale').reduce((sum,entry)=>sum+Number(entry.cost_amount||0),0);
  renderInteractiveChart(document.querySelector('#financeShareChart'),[{label:'Ventas',value:sales,color:'#54a17c'},{label:'Gastos operativos',value:expenses,color:'#d76b83'},{label:'Costo de productos vendidos',value:productCosts,color:'#d89a55'}],'pie','vertical');
};
