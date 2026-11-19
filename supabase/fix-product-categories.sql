-- Alinea la restricción de Supabase con las categorías actuales del panel.
-- Convierte únicamente la categoría antigua racimos a set.
begin;

alter table public.products
  add column if not exists supplier text;

alter table public.products
  drop constraint if exists products_category_allowed;

update public.products
set category = 'set'
where category = 'racimos';

alter table public.products
  add constraint products_category_allowed
  check (category in ('libros', 'set', 'kits', 'maquillaje', 'accesorios'));

notify pgrst, 'reload schema';
commit;
