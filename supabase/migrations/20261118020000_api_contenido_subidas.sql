-- /contenido/subidas de la API pública (17/11/2026): Backstage sube los
-- personalizados terminados y quedan en la carpeta de la modelo en el Drive
-- (Personalizados/<día>), por el mismo camino que su link (drive_aportes →
-- drive-aporte-nas). Una fila por archivo. Solo la escribe y la lee la edge
-- public-api con service_role, atada a la agencia y a la llave que la creó.
create table if not exists public.api_contenido_subidas (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  carpeta_item_id uuid not null,
  nombre_archivo text not null check (length(nombre_archivo) between 1 and 300),
  size bigint check (size is null or size > 0),
  mime text,
  storage_path text not null unique,
  estado text not null default 'esperando_archivo'
    check (estado in ('esperando_archivo', 'confirmando', 'procesando', 'error')),
  error text,
  idempotencia text,
  aporte_id uuid references public.drive_aportes(id) on delete set null,
  carpeta text,
  created_at timestamptz not null default now(),
  confirmado_at timestamptz,
  unique (api_key_id, idempotencia)
);
create index if not exists api_contenido_subidas_tenant_idx on public.api_contenido_subidas (tenant_id, created_at desc);
alter table public.api_contenido_subidas enable row level security;
-- Sin políticas: nadie la lee desde el navegador.
comment on table public.api_contenido_subidas is
  'Subidas de personalizados por la API pública (/contenido/subidas). Ver supabase/functions/public-api/contenido.ts.';
