const config = window.YCNiceLadyConfig || {};
const { productsBucket: PRODUCTS_BUCKET, supabaseUrl: SUPABASE_URL, whatsappNumber: WHATSAPP_NUMBER = '' } = config;
const storeIsConfigured = true;
const grid = document.querySelector('#productGrid');
const status = document.querySelector('#productStatus');
const dialog = document.querySelector('#cartDialog');
const cartItemsEl = document.querySelector('#cartItems');
const cartCount = document.querySelector('#cartCount');
const cartTotal = document.querySelector('#cartTotal');
const cartMessage = document.querySelector('#cartMessage');
const checkoutButton = document.querySelector('#checkoutButton');
const preview = document.querySelector('#productPreview');
const priceMax = document.querySelector('#priceMax');
const productSearch = document.querySelector('#productSearch');
const networkNotice = document.querySelector('#networkNotice');
let activeCategory = 'all';
const cartStorageKey = 'yc-nice-lady-cart';
const productsCacheKey = 'yc-nice-lady-public-products-v1';

let products = [];
let cart = loadCart();
let catalogIsFresh = false;
const kitSelections = new Map();
let pendingKitClickTimer = null;

function loadCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(cartStorageKey));
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
}

function saveCart() {
  localStorage.setItem(cartStorageKey, JSON.stringify(cart));
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function formatMoney(value) {
  return `S/ ${Number(value || 0).toFixed(2)}`;
}

function imageUrl(path) {
  if (!path || !SUPABASE_URL || !PRODUCTS_BUCKET) return '';
  const safePath = String(path).split('/').map(encodeURIComponent).join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(PRODUCTS_BUCKET)}/${safePath}`;
}

function shortProductPhotoUrl(product) {
  if (!product?.id || !product.image_path) return '';
  const hex = String(product.id).replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) return '';
  const bytes = hex.match(/.{2}/g).map((byte) => parseInt(byte, 16));
  const compactId = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${window.location.origin}/f/${compactId}`;
}

function showCatalogueProblem(title, message) {
  status.textContent = title;
  grid.innerHTML = `
    <div class="catalogue-empty catalogue-problem">
      <p>${message}</p>
      <button class="add-cart catalogue-retry" type="button">Reintentar</button>
    </div>`;
  grid.querySelector('.catalogue-retry').addEventListener('click', () => loadProducts());
}

function stockLabel(stock) {
  if (stock <= 0) return '<span class="stock-badge out">Agotado</span>';
  if (stock === 1) return '<span class="stock-badge low">Última unidad</span>';
  if (stock <= 5) return `<span class="stock-badge low">Quedan ${stock}</span>`;
  return `<span class="stock-badge">Stock: ${stock}</span>`;
}

function getCartQuantity(id) {
  return Number(cart[id] || 0);
}

function trackStoreEvent(eventType, { product = null, quantity = 1 } = {}) {
  if (!['add_to_cart', 'whatsapp_click'].includes(eventType)) return;
  const payload = {
    event_type: eventType,
    product_id: product?.id || null,
    product_name: product?.name || (eventType === 'whatsapp_click' ? 'Pedido por WhatsApp' : 'Producto'),
    quantity: Math.max(1, Math.min(1000, Math.trunc(Number(quantity) || 1)))
  };
  fetch('/rest/v1/store_analytics_events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch((error) => console.warn('No se pudo registrar la actividad de la tienda:', error));
}

function syncCartWithStock() {
  const available = new Map(products.map((product) => [product.id, product.stock]));
  Object.keys(cart).forEach((key) => {
    const line = getCartLine(key, cart[key]);
    const stock = available.get(line.productId);
    if (!stock || line.quantity <= 0) { delete cart[key]; return; }
    line.quantity = Math.min(line.quantity, stock);
    for (const selection of line.kitSelections) {
      if (!selection.accessory_product_id) continue;
      const componentStock = available.get(selection.accessory_product_id);
      const perKit = Math.max(1, Number(selection.quantity) || 0);
      line.quantity = Math.min(line.quantity, Math.floor((Number(componentStock) || 0) / perKit));
    }
    if (line.quantity <= 0) delete cart[key]; else cart[key] = line.legacy ? line.quantity : line;
  });
  saveCart();
}

function getCartLine(key, value) {
  if (typeof value === 'number') return { productId: key, quantity: value, kitSelections: [], legacy: true };
  return { productId: value?.productId || key, quantity: Number(value?.quantity) || 0, kitSelections: Array.isArray(value?.kitSelections) ? value.kitSelections : [], legacy: false };
}

function categoryFor(product) {
  const category = normalizeSearchText(product.category || '');
  if (category === 'kits') return 'set';
  if (['libros', 'set', 'maquillaje', 'accesorios'].includes(category)) return category;
  const text = normalizeSearchText(`${product.name} ${product.description || ''}`);
  if (/\blibro\b/.test(text)) return 'libros';
  if (/\bkit\b/.test(text)) return 'set';
  if (/racimo|cluster|wispy|volumen|efecto rimel|efecto rímel/.test(text)) return 'set';
  if (/pestañ|lash|rimel|ceja|eyelash/.test(text)) return 'accesorios';
  if (/maquill|labial|base |corrector|rubor|sombra|delineador|polvo/.test(text)) return 'maquillaje';
  return 'accesorios';
}

function normalizeSearchText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

function renderProducts() {
  if (!products.length) {
    grid.innerHTML = '<p class="catalogue-empty">Aún no hay productos disponibles. Vuelve pronto ♡</p>';
    return;
  }

  const query = normalizeSearchText(productSearch?.value);
  const visibleProducts = products.filter((product) => {
    const matchesSearch = !query || normalizeSearchText(`${product.name} ${product.description || ''} ${categoryFor(product)}`).includes(query);
    return matchesSearch && Number(product.price) <= Number(priceMax?.value || 500) && (activeCategory === 'all' || categoryFor(product) === activeCategory);
  });
  if (status) status.textContent = query || activeCategory !== 'all' || Number(priceMax?.value || 500) < 500
    ? `${visibleProducts.length} de ${products.length} productos disponibles`
    : `${products.length} producto${products.length === 1 ? '' : 's'} disponible${products.length === 1 ? '' : 's'}`;
  if (!visibleProducts.length) { grid.innerHTML = `<p class="catalogue-empty">${query ? 'No encontramos productos que coincidan con tu búsqueda.' : 'No hay productos con estos filtros.'}</p>`; return; }
  grid.innerHTML = visibleProducts.map((product) => {
    const image = imageUrl(product.image_path);
    const imageMarkup = image
      ? `<img src="${image}" alt="${escapeHtml(product.name)}" loading="lazy">`
      : '<span class="product-placeholder" aria-hidden="true">♡</span>';
    const isOut = product.stock <= 0;
    const kitItems = Array.isArray(product.kit_items) ? product.kit_items.filter(item => item?.name) : [];
    const hasKitPanel = kitItems.length > 0 || ['libros', 'set'].includes(categoryFor(product));
    if (!kitSelections.has(product.id)) kitSelections.set(product.id, new Map());
    const selected = kitSelections.get(product.id);
    const kitMarkup = hasKitPanel ? `<section class="kit-panel" aria-label="Complementos para ${escapeHtml(product.name)}"><h4>Kit</h4>${kitItems.length ? kitItems.map(item => {
      const accessory = products.find(candidate => String(candidate.id) === String(item.accessory_product_id))
        || products.find(candidate => categoryFor(candidate) === 'accesorios' && normalizeSearchText(candidate.name) === normalizeSearchText(item.name));
      const quantity = Number(selected.get(String(item.id)) || 0);
      const outOfStock = Boolean(accessory && Number(accessory.stock) <= 0);
      return `<div class="kit-option"><button class="kit-item-button ${quantity > 0 ? 'is-selected' : ''}" type="button" data-kit-item data-product-id="${product.id}" data-kit-id="${escapeHtml(item.id)}" aria-pressed="${quantity > 0}" ${outOfStock ? 'disabled' : ''}>${escapeHtml(item.name)}</button></div>`;
    }).join('') : '<p class="kit-empty">Complementos disponibles próximamente.</p>'}</section>` : '';
    const kitTotal = kitItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(selected.get(String(item.id)) || 0), 0);
    return `
      <article class="product product-card">
        <button class="product-img" type="button" data-preview-product="${product.id}" aria-label="Ver ${escapeHtml(product.name)}">${imageMarkup}<span class="zoom-hint">Ver foto</span></button>
        <div class="product-info">
          ${stockLabel(product.stock)}
          <h3>${escapeHtml(product.name)}</h3>
          <p class="product-description">${escapeHtml(product.description || 'Sin descripción.')}</p>
          ${kitMarkup}
          <div class="product-bottom">
            <span class="price" data-product-total="${product.id}">${formatMoney(Number(product.price) + kitTotal)}</span>
            <button class="add-cart" type="button" data-add-product="${product.id}" ${isOut ? 'disabled' : ''}>
              ${isOut ? 'Sin stock' : 'Agregar'}
            </button>
          </div>
        </div>
      </article>`;
  }).join('');
}

function cartEntries() {
  return Object.entries(cart)
    .map(([key, value]) => {
      const line = getCartLine(key, value);
      const product = products.find((item) => String(item.id) === String(line.productId));
      const kitTotal = line.kitSelections.reduce((sum, selected) => {
        const component = (product?.kit_items || []).find(item => String(item.id) === String(selected.id));
        return sum + Number(component?.price || selected.price || 0) * Number(selected.quantity || 0);
      }, 0);
      return { key, product, quantity: line.quantity, kitSelections: line.kitSelections, unitPrice: Number(product?.price || 0) + kitTotal };
    }).filter(({ product, quantity }) => product && quantity > 0);
}

function renderCart() {
  const entries = cartEntries();
  const itemCount = entries.reduce((total, entry) => total + entry.quantity, 0);
  const total = entries.reduce((sum, entry) => sum + entry.unitPrice * entry.quantity, 0);
  cartCount.textContent = itemCount;
  cartTotal.textContent = formatMoney(total);
  checkoutButton.disabled = entries.length === 0 || !navigator.onLine || !catalogIsFresh;
  if (!navigator.onLine) cartMessage.textContent = 'Sin internet. Tu carrito está guardado; podrás pedir por WhatsApp cuando vuelva la conexión.';
  else if (!catalogIsFresh && entries.length) cartMessage.textContent = 'Conectando para confirmar el catálogo y el stock antes del pedido…';
  else if (catalogIsFresh && /Sin internet|Conectando para confirmar/.test(cartMessage.textContent)) cartMessage.textContent = '';

  if (!entries.length) {
    cartItemsEl.innerHTML = '<p class="cart-empty">Aún no agregaste productos a tu carrito.</p>';
    return;
  }

  cartItemsEl.innerHTML = entries.map(({ key, product, quantity, kitSelections, unitPrice }) => {
    const selectedNames = kitSelections.filter(item => Number(item.quantity) > 0).map(item => `${item.name}${Number(item.quantity) > 1 ? ` ×${item.quantity}` : ''}`).join(' + ');
    return `
    <article class="cart-line">
      <div><h3>${escapeHtml(product.name)}${selectedNames ? ` + ${escapeHtml(selectedNames)}` : ''}</h3><p>${formatMoney(unitPrice)} c/u · Disponible: ${product.stock}</p></div>
      <div>
        <div class="cart-line-total">${formatMoney(unitPrice * quantity)}</div>
        <div class="quantity-actions">
          <button type="button" data-cart-action="decrease" data-cart-key="${escapeHtml(key)}" aria-label="Restar una unidad de ${escapeHtml(product.name)}" ${quantity <= 1 ? 'disabled' : ''}>−</button>
          <strong>${quantity}</strong>
          <button type="button" data-cart-action="increase" data-cart-key="${escapeHtml(key)}" aria-label="Sumar una unidad de ${escapeHtml(product.name)}" ${quantity >= product.stock ? 'disabled' : ''}>+</button>
          <button class="remove-line" type="button" data-cart-action="remove" data-cart-key="${escapeHtml(key)}">Quitar</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function updateCart() {
  syncCartWithStock();
  renderCart();
  renderProducts();
}

function addToCart(id, selections = []) {
  const product = products.find((item) => item.id === id);
  if (!product || product.stock <= 0) return false;
  const kitSelections = selections.filter(item => Number(item.quantity) > 0).map(item => ({ id: String(item.id), name: item.name, price: Number(item.price) || 0, quantity: Number(item.quantity) || 0, accessory_product_id: item.accessory_product_id || null }));
  const signature = kitSelections.map(item => `${item.id}:${item.quantity}`).join(',');
  const key = kitSelections.length ? `${id}::${signature}` : id;
  const line = getCartLine(key, cart[key] || { productId: id, quantity: 0, kitSelections });
  if (line.quantity >= product.stock) return false;
  line.quantity += 1;
  line.kitSelections = kitSelections;
  cart[key] = line;
  cartMessage.textContent = '';
  updateCart();
  trackStoreEvent('add_to_cart', { product, quantity: 1 });
  return true;
}

function loadCachedCatalog() {
  try {
    const cachedProducts = JSON.parse(localStorage.getItem(productsCacheKey) || 'null');
    if (!Array.isArray(cachedProducts) || !cachedProducts.length) return false;
    products = cachedProducts;
    catalogIsFresh = false;
    status.textContent = `Sin conexión · ${products.length} productos guardados (stock por confirmar)`;
    if (networkNotice) { networkNotice.hidden = false; networkNotice.textContent = 'Estás sin internet. Puedes explorar el catálogo guardado y preparar el carrito; WhatsApp se habilitará al reconectarte.'; }
    updateCart();
    return true;
  } catch { return false; }
}

async function loadProducts({ loading = true } = {}) {
  if (loading) {
    status.textContent = 'Cargando catálogo…';
    grid.innerHTML = '<p class="catalogue-loading">Cargando productos…</p>';
  }

  if (!storeIsConfigured) {
    showCatalogueProblem(
      'No se inició la conexión del catálogo.',
      'Recarga la página. Si la abriste con doble clic, publícala primero en Netlify para que la tienda se conecte correctamente.'
    );
    return false;
  }
  if (!navigator.onLine) {
    if (loadCachedCatalog()) return false;
    showCatalogueProblem('No hay conexión a internet.', 'Abre la tienda con internet una vez en este dispositivo para guardar el catálogo y poder consultarlo después sin conexión.');
    return false;
  }

  try {
    const search = new URLSearchParams({
      select: 'id,name,description,category,price,stock,image_path,kit_items,created_at',
      is_active: 'eq.true',
      order: 'created_at.desc'
    });
    const query = fetch(`/rest/v1/products?${search}`).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'No se pudo consultar el catálogo.');
      return payload;
    });
    const timeout = new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('La conexión tardó demasiado.')), 12000);
    });
    const data = await Promise.race([query, timeout]);

    products = data || [];
    catalogIsFresh = true;
    try { localStorage.setItem(productsCacheKey, JSON.stringify(products)); } catch { /* El catálogo sigue disponible en memoria si el almacenamiento está lleno. */ }
    status.textContent = products.length ? `${products.length} producto${products.length === 1 ? '' : 's'} disponible${products.length === 1 ? '' : 's'}` : 'Catálogo actualizado';
    updateCart();
    return true;
  } catch (error) {
    console.error('No se pudo cargar el catálogo:', error);
    if (loadCachedCatalog()) return false;
    showCatalogueProblem(
      'No pudimos conectar con el catálogo.',
      'No se pudo consultar el catálogo. Comprueba la configuración de Netlify y vuelve a intentarlo.'
    );
    return false;
  }
}

async function reserveCartStock(entries) {
  const quantities = new Map();
  entries.forEach(({ product, quantity, kitSelections }) => {
    quantities.set(product.id, (quantities.get(product.id) || 0) + quantity);
    kitSelections.forEach(selection => {
      if (selection.accessory_product_id) quantities.set(selection.accessory_product_id, (quantities.get(selection.accessory_product_id) || 0) + quantity * Number(selection.quantity || 0));
    });
  });
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      order_items: [...quantities].map(([id, quantity]) => ({ id, quantity }))
    })
  });
  const responseText = await response.text();
  let payload = null;
  try { payload = responseText ? JSON.parse(responseText) : null; } catch { payload = null; }
  if (!response.ok) {
    throw new Error(payload?.message || 'No pudimos reservar el stock.');
  }
  return payload;
}

async function checkout() {
  const checkoutEntries = cartEntries();
  if (!checkoutEntries.length) return;
  if (!navigator.onLine || !catalogIsFresh) {
    cartMessage.textContent = 'Sin conexión al catálogo. Tu carrito se conserva; al volver internet actualizaremos el stock y podrás pedir por WhatsApp.';
    renderCart();
    return;
  }
  checkoutEntries.forEach(({ product, quantity }) => trackStoreEvent('whatsapp_click', { product, quantity }));
  const phone = WHATSAPP_NUMBER.replace(/\D/g, '');
  if (!phone) {
    cartMessage.textContent = 'Aún falta configurar el WhatsApp del emprendimiento.';
    return;
  }

  const orderWindow = window.open('', '_blank');
  const catalogueUpdated = await loadProducts({ loading: false });
  if (!catalogueUpdated || !navigator.onLine || !catalogIsFresh) {
    cartMessage.textContent = 'No pudimos confirmar el stock en este momento. Inténtalo nuevamente.';
    orderWindow?.close();
    return;
  }
  const entries = cartEntries();
  if (!entries.length) {
    cartMessage.textContent = 'Algunos productos ya no están disponibles. Revisa tu carrito.';
    orderWindow?.close();
    return;
  }

  const total = entries.reduce((sum, entry) => sum + entry.unitPrice * entry.quantity, 0);
  const lines = entries.map(({ product, quantity, kitSelections, unitPrice }) => {
    const photo = shortProductPhotoUrl(product);
    const addOns = kitSelections.filter(item => Number(item.quantity) > 0).map(item => `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}`).join(' + ');
    return [
      `_Producto:_ ${product.name}${addOns ? ` + ${addOns}` : ''}`,
      `_Cantidad:_ ${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`,
      `_Precio:_ ${formatMoney(unitPrice)}`,
      `_Foto del producto:_ ${photo || 'No disponible'}`
    ].join('\n');
  });
  const message = [
    'Hola, quiero realizar este pedido en YC NICE LADY:',
    '',
    lines.join('\n\n'),
    '',
    `_Total:_ ${formatMoney(total)}`,
    '',
    'Deseo coordinar la entrega y saber si mi zona me sale delivery gratis.',
    'Gracias.'
  ].join('\n');
  checkoutButton.disabled = true;
  checkoutButton.textContent = 'Reservando…';

  try {
    await reserveCartStock(entries);
    cart = {};
    saveCart();
    await loadProducts({ loading: false });
    updateCart();
    dialog.close();

    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    if (orderWindow) orderWindow.location.replace(whatsappUrl);
    else window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  } catch (error) {
    console.error('No se pudo reservar el pedido:', error);
    cartMessage.textContent = error.message?.includes('stock')
      ? 'El stock cambió antes de confirmar el pedido. Revisa tu carrito.'
      : 'No pudimos reservar el pedido. Inténtalo nuevamente.';
    orderWindow?.close();
  } finally {
    checkoutButton.disabled = false;
    checkoutButton.textContent = 'Pedir por WhatsApp ↗';
  }
}

grid.addEventListener('click', (event) => {
  const kitButton = event.target.closest('[data-kit-item]');
  if (kitButton) {
    window.clearTimeout(pendingKitClickTimer);
    pendingKitClickTimer = window.setTimeout(() => {
      const product = products.find(item => item.id === kitButton.dataset.productId);
      const kitItem = product?.kit_items?.find(item => String(item.id) === kitButton.dataset.kitId);
      if (!product || !kitItem) return;
      const accessory = products.find(item => String(item.id) === String(kitItem.accessory_product_id))
        || products.find(item => categoryFor(item) === 'accesorios' && normalizeSearchText(item.name) === normalizeSearchText(kitItem.name));
      const selected = kitSelections.get(product.id) || new Map();
      const current = Number(selected.get(String(kitItem.id)) || 0);
      if (accessory && current >= Number(accessory.stock || 0)) return;
      selected.set(String(kitItem.id), current + 1);
      kitSelections.set(product.id, selected);
      updateKitCard(product);
    }, 500);
    return;
  }
  const previewButton = event.target.closest('[data-preview-product]');
  if (previewButton) {
    const product = products.find((item) => item.id === previewButton.dataset.previewProduct);
    if (product) {
      openProductPhoto(product);
    }
    return;
  }
  const button = event.target.closest('[data-add-product]');
  if (button) {
    const product = products.find(item => item.id === button.dataset.addProduct);
    const selected = kitSelections.get(product?.id) || new Map();
    const selections = (product?.kit_items || []).filter(item => Number(selected.get(String(item.id)) || 0) > 0).map(item => ({ ...item, quantity: Number(selected.get(String(item.id))) }));
    const unavailable = selections.find(item => item.accessory_product_id && Number(products.find(candidate => candidate.id === item.accessory_product_id)?.stock || 0) < item.quantity);
    if (unavailable) { cartMessage.textContent = `No hay stock suficiente de ${unavailable.accessory_name || unavailable.name}.`; renderCart(); dialog.showModal(); return; }
    addToCart(button.dataset.addProduct, selections);
    renderCart();
    dialog.showModal();
  }
});

grid.addEventListener('dblclick', event => {
  const kitButton = event.target.closest('[data-kit-item]');
  if (!kitButton) return;
  window.clearTimeout(pendingKitClickTimer);
  pendingKitClickTimer = null;
  const parent = products.find(item => item.id === kitButton.dataset.productId);
  const kitItem = parent?.kit_items?.find(item => String(item.id) === kitButton.dataset.kitId);
  const accessory = products.find(item => String(item.id) === String(kitItem?.accessory_product_id))
    || products.find(item => categoryFor(item) === 'accesorios' && normalizeSearchText(item.name) === normalizeSearchText(kitItem?.name));
  if (accessory) openProductPhoto(accessory);
});

function openProductPhoto(product) {
  if (!product) return;
  window.catalogueReturnPosition = window.scrollY;
  document.querySelector('#previewImage').src = imageUrl(product.image_path);
  document.querySelector('#previewImage').alt = product.name;
  preview.showModal();
}

function updateKitCard(product) {
  const card = grid.querySelector(`[data-add-product="${CSS.escape(product.id)}"]`)?.closest('.product-card');
  if (!card) return;
  const selected = kitSelections.get(product.id) || new Map();
  const sum = (product.kit_items || []).reduce((total, item) => total + Number(item.price || 0) * Number(selected.get(String(item.id)) || 0), 0);
  card.querySelector(`[data-product-total="${CSS.escape(product.id)}"]`).textContent = formatMoney(Number(product.price) + sum);
  card.querySelectorAll('[data-kit-item]').forEach(button => {
    const quantity = Number(selected.get(button.dataset.kitId) || 0);
    button.classList.toggle('is-selected', quantity > 0);
    button.setAttribute('aria-pressed', String(quantity > 0));
  });
}

document.querySelector('.category-tabs').addEventListener('click', (event) => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  activeCategory = button.dataset.category;
  document.querySelectorAll('[data-category]').forEach((tab) => tab.classList.toggle('is-active', tab === button));
  renderProducts();
});
priceMax.addEventListener('input', () => { document.querySelector('#priceMaxLabel').textContent = formatMoney(priceMax.value); renderProducts(); });
productSearch.addEventListener('input', renderProducts);
document.querySelector('.preview-close').addEventListener('click', () => preview.close());
document.querySelector('#previewContinue').addEventListener('click', () => preview.close());
preview.addEventListener('close', () => { if (Number.isFinite(window.catalogueReturnPosition)) window.scrollTo({ top: window.catalogueReturnPosition, behavior: 'instant' }); });
preview.addEventListener('click', (event) => { if (event.target === preview) preview.close(); });

cartItemsEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-cart-action]');
  if (!button) return;
  const id = button.dataset.cartKey;
  const action = button.dataset.cartAction;
  const line = getCartLine(id, cart[id]);
  const product = products.find((item) => item.id === line.productId);
  if (action === 'remove') delete cart[id];
  else if (action === 'decrease') { line.quantity--; cart[id] = line.legacy ? line.quantity : line; }
  else if (action === 'increase' && product) { line.quantity = Math.min(line.quantity + 1, product.stock); cart[id] = line.legacy ? line.quantity : line; }
  cartMessage.textContent = '';
  updateCart();
});

document.querySelector('#openCart').addEventListener('click', () => {
  renderCart();
  dialog.showModal();
});
document.querySelector('#closeCart').addEventListener('click', () => dialog.close());
document.querySelector('#continueShopping').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
checkoutButton.addEventListener('click', checkout);

function updateConnectionNotice() {
  if (!navigator.onLine) {
    if (networkNotice) { networkNotice.hidden = false; networkNotice.textContent = 'Estás sin internet. Puedes explorar el catálogo guardado y preparar el carrito; WhatsApp se habilitará al reconectarte.'; }
    renderCart();
    return;
  }
  if (networkNotice) { networkNotice.hidden = false; networkNotice.textContent = 'Conexión recuperada. Actualizando catálogo y stock…'; }
  loadProducts({ loading: false }).then((loaded) => {
    if (networkNotice) {
      networkNotice.hidden = false;
      networkNotice.textContent = loaded ? 'Catálogo actualizado. Ya puedes continuar tu pedido por WhatsApp.' : 'No pudimos conectar con el catálogo todavía. Conservamos tu carrito; intenta de nuevo en un momento.';
    }
    renderCart();
  });
}
window.addEventListener('offline', updateConnectionNotice);
window.addEventListener('online', updateConnectionNotice);

function startPublicStore() { loadProducts(); }
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  navigator.serviceWorker.register('/service-worker.js')
    .then(() => navigator.serviceWorker.ready)
    .then(startPublicStore)
    .catch((error) => { console.warn('No se pudo habilitar el modo sin conexión:', error); startPublicStore(); });
} else startPublicStore();
