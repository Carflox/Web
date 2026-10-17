-- Ejecuta este archivo una sola vez en Supabase: SQL Editor > New query > Run.
-- Añade la categoría de los productos y clasifica los registros existentes por su nombre/descripción.
alter table public.products
  add column if not exists category text;

update public.products
set category = case
  when lower(coalesce(name, '') || ' ' || coalesce(description, '')) ~ '(pestañ|lash|r[ií]mel|ceja|eyelash|cluster)' then 'pestanas'
  when lower(coalesce(name, '') || ' ' || coalesce(description, '')) ~ '(maquill|labial|base |corrector|rubor|sombra|delineador|polvo)' then 'maquillaje'
  else 'accesorios'
end
where category is null or category not in ('pestanas', 'maquillaje', 'accesorios');

alter table public.products
  alter column category set default 'accesorios',
  alter column category set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_category_allowed'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_category_allowed
      check (category in ('pestanas', 'maquillaje', 'accesorios'));
  end if;
end $$;
