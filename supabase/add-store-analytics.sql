-- Eventos anonimizados de actividad para estadísticas del catálogo.
create table if not exists public.store_analytics_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('add_to_cart', 'whatsapp_click')),
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null default 1 check (quantity between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists store_analytics_events_created_at_idx on public.store_analytics_events (created_at desc);
create index if not exists store_analytics_events_product_idx on public.store_analytics_events (product_id, event_type);
alter table public.store_analytics_events enable row level security;
grant insert on public.store_analytics_events to anon, authenticated;
grant select on public.store_analytics_events to authenticated;
drop policy if exists store_analytics_events_insert_public on public.store_analytics_events;
create policy store_analytics_events_insert_public on public.store_analytics_events for insert to anon, authenticated
with check (event_type in ('add_to_cart', 'whatsapp_click') and quantity between 1 and 1000);
drop policy if exists store_analytics_events_select_admin on public.store_analytics_events;
create policy store_analytics_events_select_admin on public.store_analytics_events for select to authenticated
using (public.is_store_admin());