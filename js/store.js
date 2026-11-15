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
  Object.keys(cart).forEach((id) => {
    const quantity = getCartQuantity(id);
    const stock = available.get(id);
    if (!stock || quantity <= 0) delete cart[id];
    else cart[id] = Math.min(quantity, stock);
  });
  saveCart();
}

function categoryFor(product) {
  const category = normalizeSearchText(product.category || '');
  if (['libros', 'set', 'kits', 'maquillaje', 'accesorios'].includes(category)) return category;
  const text = normalizeSearchText(`${product.name} ${product.description || ''}`);
  if (/\blibro\b/.test(text)) return 'libros';
  if (/\bkit\b/.test(text)) return 'kits';
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
    return `
      <article class="product product-card">
        <button class="product-img" type="button" data-preview-product="${product.id}" aria-label="Ver ${escapeHtml(product.name)}">${imageMarkup}<span class="zoom-hint">Ver foto</span></button>
        <div class="product-info">
          ${stockLabel(product.stock)}
          <h3>${escapeHtml(product.name)}</h3>
          <p class="product-description">${escapeHtml(product.description || 'Sin descripción.')}</p>
          <div class="product-bottom">
            <span class="price">${formatMoney(product.price)}</span>
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
    .map(([id, quantity]) => ({ product: products.find((item) => item.id === id), quantity: Number(quantity) }))
    .filter(({ product, quantity }) => product && quantity > 0);
}

function renderCart() {
  const entries = cartEntries();
  const itemCount = entries.reduce((total, entry) => total + entry.quantity, 0);
  const total = entries.reduce((sum, { product, quantity }) => sum + Number(product.price) * quantity, 0);
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

  cartItemsEl.innerHTML = entries.map(({ product, quantity }) => `
    <article class="cart-line">
      <div><h3>${escapeHtml(product.name)}</h3><p>${formatMoney(product.price)} c/u · Disponible: ${product.stock}</p></div>
      <div>
        <div class="cart-line-total">${formatMoney(Number(product.price) * quantity)}</div>
        <div class="quantity-actions">
          <button type="button" data-cart-action="decrease" data-product-id="${product.id}" aria-label="Restar una unidad de ${escapeHtml(product.name)}" ${quantity <= 1 ? 'disabled' : ''}>−</button>
          <strong>${quantity}</strong>
          <button type="button" data-cart-action="increase" data-product-id="${product.id}" aria-label="Sumar una unidad de ${escapeHtml(product.name)}" ${quantity >= product.stock ? 'disabled' : ''}>+</button>
          <button class="remove-line" type="button" data-cart-action="remove" data-product-id="${product.id}">Quitar</button>
        </div>
      </div>
    </article>`).join('');
}

function updateCart() {
  syncCartWithStock();
  renderCart();
  renderProducts();
}

function addToCart(id) {
  const product = products.find((item) => item.id === id);
  if (!product || product.stock <= 0 || getCartQuantity(id) >= product.stock) return false;
  cart[id] = getCartQuantity(id) + 1;
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
      select: 'id,name,description,category,price,stock,image_path,created_at',
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
      'Para usar la tienda sin conexión, primero debes abrirla una vez con internet en este dispositivo. Luego vuelve a intentarlo.'
    );
    return false;
  }
}

async function reserveCartStock(entries) {
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      order_items: entries.map(({ product, quantity }) => ({ id: product.id, quantity }))
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

  const total = entries.reduce((sum, { product, quantity }) => sum + Number(product.price) * quantity, 0);
  const lines = entries.map(({ product, quantity }) => {
    const photo = shortProductPhotoUrl(product);
    return [
      `_Producto:_ ${product.name}`,
      `_Cantidad:_ ${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`,
      `_Precio:_ ${formatMoney(Number(product.price))}`,
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
  const previewButton = event.target.closest('[data-preview-product]');
  if (previewButton) {
    const product = products.find((item) => item.id === previewButton.dataset.previewProduct);
    if (product) {
      document.querySelector('#previewImage').src = imageUrl(product.image_path);
      document.querySelector('#previewImage').alt = product.name;
      document.querySelector('#previewName').textContent = product.name;
      document.querySelector('#previewPrice').textContent = formatMoney(product.price);
      document.querySelector('#previewAdd').onclick = () => {
        addToCart(product.id);
        preview.close();
        renderCart();
        dialog.showModal();
      };
      preview.showModal();
    }
    return;
  }
  const button = event.target.closest('[data-add-product]');
  if (button) {
    addToCart(button.dataset.addProduct);
    renderCart();
    dialog.showModal();
  }
});

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
preview.addEventListener('click', (event) => { if (event.target === preview) preview.close(); });

cartItemsEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-cart-action]');
  if (!button) return;
  const id = button.dataset.productId;
  const action = button.dataset.cartAction;
  const product = products.find((item) => item.id === id);
  if (action === 'remove') delete cart[id];
  else if (action === 'decrease') cart[id] = getCartQuantity(id) - 1;
  else if (action === 'increase' && product) cart[id] = Math.min(getCartQuantity(id) + 1, product.stock);
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
