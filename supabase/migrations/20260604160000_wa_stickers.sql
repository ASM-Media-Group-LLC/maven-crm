-- Galería de stickers propios del equipo (subir + guardar + reenviar desde la
-- bandeja). Los stickers se guardan como webp en Storage (creator-files/wa-stickers)
-- y acá referenciamos el storage_path. Tenant-scoped: el equipo comparte la galería.
create table if not exists public.wa_stickers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  storage_path text not null,
  label text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.wa_stickers enable row level security;

-- Todos los del tenant ven/usan la galería; insertar/borrar dentro del tenant.
drop policy if exists wa_stickers_select on public.wa_stickers;
create policy wa_stickers_select on public.wa_stickers
  for select using (tenant_id = current_tenant_id());

drop policy if exists wa_stickers_insert on public.wa_stickers;
create policy wa_stickers_insert on public.wa_stickers
  for insert with check (tenant_id = current_tenant_id());

drop policy if exists wa_stickers_delete on public.wa_stickers;
create policy wa_stickers_delete on public.wa_stickers
  for delete using (tenant_id = current_tenant_id());

create index if not exists wa_stickers_tenant_idx on public.wa_stickers (tenant_id, created_at desc);
