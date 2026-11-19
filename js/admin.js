function refreshFinanceSaleProducts() {
  const selected = financeSaleProduct.value;

  financeSaleProduct.innerHTML =
    '<option value="">Venta general</option>' +
    products.map(product => {
      return `<option value="${escapeHtml(String(product.id))}">${escapeHtml(String(product.name || ""))}</option>`;
    }).join("");

  if (products.some(product => String(product.id) === selected)) {
    financeSaleProduct.value = selected;
  }
}

function refreshFinanceExpenseProducts() {
  const selected = financeExpenseProduct.value;

  financeExpenseProduct.innerHTML =
    '<option value="">Compra general / varios</option>' +
    products.map(product => {
      const suffix = product.supplier
        ? ` — ${String(product.supplier)}`
        : "";

      return `<option value="${escapeHtml(String(product.id))}">${escapeHtml(String(product.name || ""))}${escapeHtml(suffix)}</option>`;
    }).join("");

  if (products.some(product => String(product.id) === selected)) {
    financeExpenseProduct.value = selected;
  }
}

function syncFinanceSaleFields({ useCurrentPrices = false } = {}) {
  const form = document.querySelector("#financeSaleForm");

  if (!form) return;

  const product = products.find(
    item => String(item.id) === String(financeSaleProduct.value)
  );

  const quantity = Math.max(
    1,
    Number(form.elements.quantity.value) || 1
  );

  form.elements.product_name.value = product
    ? String(product.name || "")
    : "";

  if (product && useCurrentPrices) {
    form.elements.unit_price.value = Number(product.price || 0).toFixed(2);
  }

  if (product) {
    form.elements.description.value =
      `${String(product.name || "")} × ${quantity}`;
  }

  const unitPrice = Math.max(
    0,
    Number(form.elements.unit_price.value) || 0
  );

  form.elements.amount.value = (unitPrice * quantity).toFixed(2);
}
