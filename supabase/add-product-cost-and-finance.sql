-- Agrega precio de costo unitario al catálogo y vincula cada venta con su costo real.
alter table public.products
  add column if not exists cost_price numeric(12,2) not null default 0,
  add column if not exists supplier text;

alter table public.products
  drop constraint if exists products_cost_price_nonnegative;
alter table public.products
  add constraint products_cost_price_nonnegative check (cost_price >= 0);

alter table public.store_finance_entries
  add column if not exists product_id uuid,
  add column if not exists quantity integer not null default 1,
  add column if not exists cost_amount numeric(12,2) not null default 0;

  -- Snapshot del nombre de producto en movimientos históricos.
  add column if not exists product_name text;

alter table public.store_finance_entries
  drop constraint if exists store_finance_quantity_positive;
alter table public.store_finance_entries
  add constraint store_finance_quantity_positive check (quantity > 0);

alter table public.store_finance_entries
  drop constraint if exists store_finance_cost_amount_nonnegative;
alter table public.store_finance_entries
  add constraint store_finance_cost_amount_nonnegative check (cost_amount >= 0);
