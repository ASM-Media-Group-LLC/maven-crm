-- Telemetría de fallas de subida por el link público /aportar y /subir (Alvaro,
-- 06/11). Antes el front solo mostraba "Falló — reintenta" sin más, y para
-- entender qué pasaba realmente en el navegador de la creadora había que pedir
-- vídeo + Devtools. Ahora cada fallo se registra acá con el error exacto y el
-- admin lo lee sin molestar a nadie.

create table if not exists public.drive_aportar_errores (
  id uuid primary key default gen_random_uuid(),
  token text,
  nombre_archivo text,
  size_bytes bigint,
  etapa text,
  mensaje text,
  status int,
  intento int,
  user_agent text,
  creado_at timestamptz not null default now()
);

create index if not exists drive_aportar_errores_creado_idx
  on public.drive_aportar_errores (creado_at desc);

alter table public.drive_aportar_errores enable row level security;

drop policy if exists "ver aportar errores" on public.drive_aportar_errores;
create policy "ver aportar errores" on public.drive_aportar_errores
  for select to authenticated
  using (es_admin_o_dueno((select auth.uid())));
