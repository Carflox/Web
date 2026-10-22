-- Ejecuta este archivo una sola vez en el SQL Editor de Supabase.
-- Conserva el orden actual del panel admin antes de permitir arrastrar productos.

alter table public.products
  add column if not exists sort_order numeric;

with ranked_products as (
  select id, row_number() over (order by created_at desc, id) as position
  from public.products
)
update public.products as products
set sort_order = ranked_products.position
from ranked_products
where products.id = ranked_products.id
  and products.sort_order is null;

alter table public.products
  alter column sort_order set default 0;

create index if not exists products_sort_order_created_at_idx
  on public.products (sort_order asc, created_at desc);
