-- Ejecuta una sola vez en Supabase para guardar los complementos de cada producto.
alter table public.products
  add column if not exists kit_items jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
