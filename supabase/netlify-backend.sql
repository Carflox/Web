-- Ejecuta una sola vez en Supabase SQL Editor antes de desplegar las funciones.
-- Mantiene Supabase como base de datos/almacenamiento y Netlify como único hosting.

create table if not exists public.store_admin_credentials (
  id integer primary key check (id = 1),
  salt text not null,
  password_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.store_admin_credentials enable row level security;
revoke all on public.store_admin_credentials from anon, authenticated;

create table if not exists public.store_admin_password_resets (
  id integer primary key check (id = 1),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  requested_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5)
);
alter table public.store_admin_password_resets enable row level security;
revoke all on public.store_admin_password_resets from anon, authenticated;

create or replace function public.reserve_store_stock(order_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  qty integer;
  changed integer;
begin
  if jsonb_typeof(order_items) <> 'array' or jsonb_array_length(order_items) = 0 then
    raise exception 'El pedido no contiene productos válidos.';
  end if;

  for item in select value from jsonb_array_elements(order_items)
  loop
    qty := greatest(1, least(1000, coalesce((item->>'quantity')::integer, 1)));
    update public.products
       set stock = stock - qty
     where id = (item->>'id')::uuid
       and is_active = true
       and stock >= qty;
    get diagnostics changed = row_count;
    if changed <> 1 then
      raise exception 'Stock insuficiente para completar el pedido.';
    end if;
  end loop;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.reserve_store_stock(jsonb) from public, anon, authenticated;
grant execute on function public.reserve_store_stock(jsonb) to service_role;
