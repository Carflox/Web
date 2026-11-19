-- Guarda el nombre del producto tal como estaba al registrar cada movimiento.
-- Ejecutar una vez en Supabase SQL Editor, después de add-product-cost-and-finance.sql.
alter table public.store_finance_entries
  add column if not exists product_name text;

-- Rellena los movimientos existentes con el nombre actual del producto asociado.
update public.store_finance_entries as entry
set product_name = product.name
from public.products as product
where entry.product_id = product.id
  and entry.product_name is null;
