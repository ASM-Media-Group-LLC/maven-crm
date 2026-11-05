-- LINK PÚBLICO de subida al Drive (Alvaro, 04/11): editores/admins/supervisores/
-- manager generan un link; cualquiera lo abre SIN cuenta y sube archivos a una
-- carpeta del Drive. Los archivos van al bucket privado drive-aportes y un
-- proceso aparte los migra al NAS en unos días. (Ya aplicada en prod por MCP.)
insert into storage.buckets (id, name, public, file_size_limit)
values ('drive-aportes', 'drive-aportes', false, 5368709120)
on conflict (id) do nothing;

create table if not exists public.drive_upload_links (
  token      text primary key default encode(gen_random_bytes(16), 'hex'),
  item_id    uuid not null references public.drive_items(id) on delete cascade,
  tenant_id  uuid not null,
  created_by uuid,
  nombre     text,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists drive_upload_links_item_idx on public.drive_upload_links (item_id);

create table if not exists public.drive_aportes (
  id            uuid primary key default gen_random_uuid(),
  token         text not null references public.drive_upload_links(token) on delete cascade,
  item_id       uuid,
  tenant_id     uuid not null,
  nombre_archivo text not null,
  storage_path  text not null,
  size          bigint,
  quien         text,
  estado        text not null default 'subido' check (estado in ('subido','en_nas')),
  en_nas        boolean not null default false,
  drive_item_id uuid,
  created_at    timestamptz not null default now()
);
create index if not exists drive_aportes_token_idx on public.drive_aportes (token, created_at desc);
create index if not exists drive_aportes_pendiente_idx on public.drive_aportes (en_nas) where en_nas = false;

alter table public.drive_upload_links enable row level security;
alter table public.drive_aportes enable row level security;

create policy "ver links de subida" on public.drive_upload_links
  for select to authenticated
  using (public.drive_mi_rol(item_id) is not null or public.es_dueno((select auth.uid())));
create policy "ver aportes" on public.drive_aportes
  for select to authenticated
  using (public.drive_mi_rol(item_id) is not null or public.es_dueno((select auth.uid())));
revoke insert, update, delete on public.drive_upload_links from authenticated, anon;
revoke insert, update, delete on public.drive_aportes from authenticated, anon;
grant select on public.drive_upload_links to authenticated;
grant select on public.drive_aportes to authenticated;
