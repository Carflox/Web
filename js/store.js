const config = window.YCNiceLadyConfig || {};
const { productsBucket: PRODUCTS_BUCKET, publishableKey: SUPABASE_PUBLISHABLE_KEY, supabaseUrl: SUPABASE_URL, whatsappNumber: WHATSAPP_NUMBER = '' } = config;
const storeIsConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && PRODUCTS_BUCKET);
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
let activeCategory = 'all';
const cartStorageKey = 'yc-nice-lady-cart';

let products = [];
let cart = loadCart();

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
  if (!path || !storeIsConfigured) return '';
  const safePath = String(path).split('/').map(encodeURIComponent).join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(PRODUCTS_BUCKET)}/${safePath}`;
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
  if (['pestanas', 'maquillaje', 'accesorios'].includes(product.category)) return product.category;
  const text = `${product.name} ${product.description || ''}`.toLocaleLowerCase('es');
  if (/pestañ|lash|rimel|rímel|ceja|eyelash|cluster/.test(text)) return 'pestanas';
  if (/maquill|labial|base |corrector|rubor|sombra|delineador|polvo/.test(text)) return 'maquillaje';
  return 'accesorios';
}

function renderProducts() {
  if (!products.length) {
    grid.innerHTML = '<p class="catalogue-empty">Aún no hay productos disponibles. Vuelve pronto ♡</p>';
    return;
  }

  const visibleProducts = products.filter((product) => Number(product.price) <= Number(priceMax?.value || 500) && (activeCategory === 'all' || categoryFor(product) === activeCategory));
  if (!visibleProducts.length) { grid.innerHTML = '<p class="catalogue-empty">No hay productos con estos filtros.</p>'; return; }
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
  checkoutButton.disabled = entries.length === 0;

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
          <button type="button" data-cart-action="decrease" data-product-id="${product.id}" aria-label="Restar una unidad de ${escapeHtml(product.name)}">−</button>
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
  if (!product || product.stock <= 0) return;
  cart[id] = Math.min(getCartQuantity(id) + 1, product.stock);
  cartMessage.textContent = '';
  updateCart();
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

  try {
    const search = new URLSearchParams({
      select: 'id,name,description,category,price,stock,image_path,created_at',
      is_active: 'eq.true',
      order: 'created_at.desc'
    });
    const query = fetch(`${SUPABASE_URL}/rest/v1/products?${search}`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
      }
    }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'No se pudo consultar el catálogo.');
      return payload;
    });
    const timeout = new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('La conexión tardó demasiado.')), 12000);
    });
    const data = await Promise.race([query, timeout]);

    products = data || [];
    status.textContent = products.length ? `${products.length} producto${products.length === 1 ? '' : 's'} disponible${products.length === 1 ? '' : 's'}` : 'Catálogo actualizado';
    updateCart();
    return true;
  } catch (error) {
    console.error('No se pudo cargar el catálogo:', error);
    showCatalogueProblem(
      'No pudimos conectar con el catálogo.',
      'Revisa que tengas internet y vuelve a intentarlo. Si continúa igual, abre la tienda desde su enlace de Netlify, no como archivo descargado.'
    );
    return false;
  }
}

async function reserveCartStock(entries) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reserve_whatsapp_order`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
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
  if (!cartEntries().length) return;
  const phone = WHATSAPP_NUMBER.replace(/\D/g, '');
  if (!phone) {
    cartMessage.textContent = 'Aún falta configurar el WhatsApp del emprendimiento.';
    return;
  }

  const orderWindow = window.open('', '_blank');
  const catalogueUpdated = await loadProducts({ loading: false });
  if (!catalogueUpdated) {
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
  const lines = entries.flatMap(({ product, quantity }) => {
    const photo = imageUrl(product.image_path);
    return [
      `\u{1F6CD}\uFE0F *Producto:* ${product.name}`,
      `\u{1F4E6} *Cantidad:* ${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`,
      `\u{1F4B0} *Precio:* ${formatMoney(Number(product.price))}`,
      `\u{1F5BC}\uFE0F *Foto del producto:* ${photo || 'No disponible'}`
    ];
  });
  const message = [
    'Hola, quiero realizar este pedido en YC NICE LADY:',
    '',
    ...lines,
    '',
    `*Total: ${formatMoney(total)}*`,
    '',
    '¿Me confirman si está disponible, por favor? También quisiera saber cómo coordinar la entrega.',
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
      document.querySelector('#previewAdd').onclick = () => { addToCart(product.id); preview.close(); };
      preview.showModal();
    }
    return;
  }
  const button = event.target.closest('[data-add-product]');
  if (button) addToCart(button.dataset.addProduct);
});

document.querySelector('.category-tabs').addEventListener('click', (event) => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  activeCategory = button.dataset.category;
  document.querySelectorAll('[data-category]').forEach((tab) => tab.classList.toggle('is-active', tab === button));
  renderProducts();
});
priceMax.addEventListener('input', () => { document.querySelector('#priceMaxLabel').textContent = formatMoney(priceMax.value); renderProducts(); });
document.querySelector('.preview-close').addEventListener('click', () => preview.close());
preview.addEventListener('click', (event) => { if (event.target === preview) preview.close(); });

cartItemsEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-cart-action]');
  if (!button) return;
  const id = button.dataset.productId;
  const action = button.dataset.cartAction;
  const product = products.find((item) => item.id === id);
  if (action === 'remove' || (action === 'decrease' && getCartQuantity(id) <= 1)) delete cart[id];
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
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
checkoutButton.addEventListener('click', checkout);

loadProducts();
