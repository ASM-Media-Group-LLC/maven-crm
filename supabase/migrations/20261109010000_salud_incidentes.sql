-- Vigilante de la Salud de la plataforma (Alvaro, 08/11/2026 noche):
-- "esto no es un cartel, es un check: si hay un problema, la plataforma lo ve
-- y lo escala". Esta tabla registra los incidentes abiertos (uno por tipo) para
-- (a) saber si ya se notificó y no spamear, (b) pintar el banner rojo de
-- Maven, (c) tener historial.

create table if not exists public.salud_incidentes (
  id uuid primary key default gen_random_uuid(),
  -- qué falló: nas_caido | correo_atascado | argos_sin_juzgar | cron_parado
  tipo text not null,
  -- detalle corto para el banner / push ("NAS sin responder desde 10:14 am")
  mensaje text not null,
  abierto_at timestamptz not null default now(),
  cerrado_at timestamptz,
  -- cuándo se avisó por push (si fue). Null = aún no se avisó.
  push_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists salud_incidentes_abierto_por_tipo
  on public.salud_incidentes (tipo) where cerrado_at is null;

create index if not exists salud_incidentes_abierto_at
  on public.salud_incidentes (abierto_at desc);

alter table public.salud_incidentes enable row level security;

-- Solo el dueño (es_dueno) lee los incidentes. El banner del home los pinta.
drop policy if exists salud_incidentes_sel_dueno on public.salud_incidentes;
create policy salud_incidentes_sel_dueno on public.salud_incidentes
  for select to authenticated
  using (es_dueno((select auth.uid())));

-- Los inserta / cierra el vigilante (edge con service role, no pasa por RLS).
-- No se da INSERT/UPDATE a usuarios: mantener controlado.
