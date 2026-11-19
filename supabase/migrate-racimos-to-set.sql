-- Migra racimos a set y sincroniza categorías con las opciones del panel.
begin;

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
