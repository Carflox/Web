-- Finanzas: registrar solo ventas confirmadas y gastos reales del negocio.
create table if not exists public.store_finance_entries (
  id bigint generated always as identity primary key,
  entry_type text not null check (entry_type in ('sale','expense')),
  description text not null check (length(description) between 1 and 160),
  category text not null check (category in ('sale','delivery','gasolina','material_moto','productos','empaque','otros')),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists store_finance_entries_created_idx on public.store_finance_entries(created_at desc);
alter table public.store_finance_entries enable row level security;
grant select,insert,delete on public.store_finance_entries to authenticated;
drop policy if exists store_finance_admin_all on public.store_finance_entries;
create policy store_finance_admin_all on public.store_finance_entries for all to authenticated
using (public.is_store_admin()) with check (public.is_store_admin());
grant usage, select on sequence public.store_finance_entries_id_seq to authenticated;


