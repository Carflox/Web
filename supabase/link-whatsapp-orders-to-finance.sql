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
