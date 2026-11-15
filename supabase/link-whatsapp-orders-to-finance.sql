-- Vincula cada clic de WhatsApp con una venta confirmada para evitar duplicados.
-- Ejecutar después de add-store-analytics.sql y add-store-finances.sql.
alter table public.store_finance_entries
  add column if not exists analytics_event_id bigint;

do $$
begin
  alter table public.store_finance_entries
    add constraint store_finance_entries_analytics_event_fk
    foreign key (analytics_event_id)
    references public.store_analytics_events(id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

create unique index if not exists store_finance_entries_analytics_event_uidx
  on public.store_finance_entries (analytics_event_id)
  where analytics_event_id is not null;

-- Conserva los clics descartados fuera del registro financiero y evita que vuelvan
-- a aparecer como pedidos pendientes.
create table if not exists public.store_whatsapp_order_resolutions (
  analytics_event_id bigint primary key references public.store_analytics_events(id) on delete cascade,
  resolution text not null check (resolution in ('not_sold')),
  resolved_at timestamptz not null default now()
);

alter table public.store_whatsapp_order_resolutions enable row level security;
grant select, insert on public.store_whatsapp_order_resolutions to authenticated;
drop policy if exists store_whatsapp_resolutions_select_admin on public.store_whatsapp_order_resolutions;
create policy store_whatsapp_resolutions_select_admin
  on public.store_whatsapp_order_resolutions for select to authenticated
  using (public.is_store_admin());
drop policy if exists store_whatsapp_resolutions_insert_admin on public.store_whatsapp_order_resolutions;
create policy store_whatsapp_resolutions_insert_admin
  on public.store_whatsapp_order_resolutions for insert to authenticated
  with check (public.is_store_admin());
