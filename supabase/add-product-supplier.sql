-- Agrega el proveedor habitual que usa el formulario de administración.
alter table public.products
  add column if not exists supplier text;

-- Hace que la API de Supabase recargue el esquema de la tabla.
notify pgrst, 'reload schema';
