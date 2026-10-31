-- Segunda capa del monitor de cámara de Cowork (Álvaro, 30/10/2026):
--   · Acciones de RRHH sobre cada falta: pendiente → falta | descartado, con nota.
--   · Rondín: un latido por persona en cada pasada del robot (para "última ronda").
--   · Borrado de las FOTOS a los 7 días (la falta queda en el historial).
-- Todo reversible / no destructivo.

-- ── 1) Workflow sobre cada falta ─────────────────────────────────────────────
alter table public.monitor_eventos
  add column if not exists estado       text not null default 'pendiente',  -- pendiente|falta|descartado
  add column if not exists nota         text,
  add column if not exists resuelto_por uuid,
  add column if not exists resuelto_at  timestamptz;

create index if not exists monitor_eventos_estado_idx
  on public.monitor_eventos (estado, created_at desc);
create index if not exists monitor_eventos_falta_user_idx
  on public.monitor_eventos (user_id, created_at desc) where estado = 'falta';

-- Supervisores/admin actúan sobre las faltas (marcar falta, descartar, anotar).
create policy "monitor_eventos_update_supervisor" on public.monitor_eventos
  for update to authenticated
  using (public.is_in_role_group((select auth.uid()), 'supervisor_or_above'))
  with check (public.is_in_role_group((select auth.uid()), 'supervisor_or_above'));

-- ── 2) Rondín (latido por persona en cada ronda) ─────────────────────────────
-- Un latido por persona, aunque esté todo bien. Da el cartel "última ronda a las
-- HH:MM · N en sala" sin ensuciar la lista de faltas. Se poda solo (no es historial).
create table if not exists public.monitor_rondas (
  user_id     uuid primary key,
  room_nombre text,
  presente    boolean,
  trabajando  boolean,          -- cámara ok y mirando, según se supo en la ronda
  resumen     text,
  last_at     timestamptz not null default now()
);

alter table public.monitor_rondas enable row level security;

-- Cada quien escribe su propio latido (su navegador); el edge usa service_role.
create policy "monitor_rondas_ins_propio" on public.monitor_rondas
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "monitor_rondas_upd_propio" on public.monitor_rondas
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Supervisores/admin leen quién pasó y cuándo; la persona ve su propio latido.
create policy "monitor_rondas_sel_supervisor" on public.monitor_rondas
  for select to authenticated
  using (public.is_in_role_group((select auth.uid()), 'supervisor_or_above'));
create policy "monitor_rondas_sel_propio" on public.monitor_rondas
  for select to authenticated using (user_id = (select auth.uid()));

-- ── 3) Borrado de las fotos a los 7 días ─────────────────────────────────────
-- Quita SOLO la captura (imagen) de las faltas de más de 7 días; la fila de la
-- falta se conserva para el historial y el conteo. Lo corre pg_cron de madrugada.
create or replace function public.monitor_limpiar_capturas()
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  -- Borra el objeto del bucket (quita el acceso) de las capturas viejas.
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    execute $q$
      delete from storage.objects
      where bucket_id = 'monitor-capturas'
        and created_at < now() - interval '7 days'
    $q$;
  end if;

  -- Limpia la ruta en las faltas viejas (para no dejar un enlace muerto).
  update public.monitor_eventos
     set captura_path = null
   where captura_path is not null
     and created_at < now() - interval '7 days';

  -- Poda los latidos viejos del rondín (no son historial).
  delete from public.monitor_rondas where last_at < now() - interval '2 days';
end
$fn$;

-- Programa la limpieza diaria (04:17). Protegido: pg_cron solo existe en una base
-- Supabase real; en los bancos de prueba (PGlite) este bloque se salta entero.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      execute $x$ select cron.unschedule('monitor_limpiar_capturas') $x$;
    exception when others then null;
    end;
    execute $x$ select cron.schedule('monitor_limpiar_capturas', '17 4 * * *', 'select public.monitor_limpiar_capturas();') $x$;
  end if;
end $$;
