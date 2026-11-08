-- Aviso de "no prendió la cámara los primeros minutos del turno" (Alvaro, 08/11).
-- Se conectó a tiempo pero no tuvo la cámara encendida en los primeros 15 min del
-- turno. Correo aparte del de tardanza, sanción aparte (no toca la nota). Dedup
-- por unique(user_id, dia): una vez al día por persona.
create table if not exists public.camara_inicio_registro (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  dia date not null,
  turno_nombre text,
  horario_asignado text,
  ventana_min int not null default 15,
  minutos_sin_camara int,
  entro_at timestamptz,
  correo_enviado boolean not null default false,
  correo_enviado_at timestamptz,
  correo_a text[],
  created_at timestamptz not null default now(),
  constraint camara_inicio_unico unique (user_id, dia)
);
create index if not exists camara_inicio_dia_idx on public.camara_inicio_registro (dia desc);

alter table public.camara_inicio_registro enable row level security;
drop policy if exists "ver camara inicio" on public.camara_inicio_registro;
create policy "ver camara inicio" on public.camara_inicio_registro
  for select to authenticated
  using (es_admin_o_dueno((select auth.uid())) or user_id = (select auth.uid()));
