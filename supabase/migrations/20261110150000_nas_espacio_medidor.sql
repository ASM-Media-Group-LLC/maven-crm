-- MEDIDOR DEL NAS + VIDEOS GRANDES DE LAS MODELOS (Alvaro, 10/11/2026).
--
-- 1) TOPES DE STORAGE. El link /aportar rebotaba todo video de más de 350 MB
--    («413 Maximum size exceeded» en drive_aportar_errores: 450, 649 y 924 MB,
--    desde el 06/11): el bucket drive-aportes permitía 5 GB, pero el tope
--    GLOBAL del proyecto estaba en 350 MB y le ganaba. El global se subió a
--    10 GB en el panel (Storage → Settings; eso no vive en SQL). Para no abrir
--    los demás buckets, los que heredaban el global quedan fijos en los mismos
--    350 MB de antes, y solo drive-aportes sube a 10 GB.
update storage.buckets set file_size_limit = 367001600 where file_size_limit is null;
update storage.buckets set file_size_limit = 10737418240 where id = 'drive-aportes';

-- 2) MUESTRAS DEL DISCO. El NAS dice en /salud cuánto tiene y cuánto le queda
--    (statfs por disco), pero nadie lo guardaba. La edge drive-aporte-nas (cron
--    cada 2 min, ya consulta /salud) deja UNA muestra por hora: con eso el
--    ritmo de llenado sale del disco real, no de una estimación.
create table if not exists public.nas_espacio (
  id bigint generated always as identity primary key,
  medido_at timestamptz not null default now(),
  total_bytes bigint not null check (total_bytes > 0),
  libre_bytes bigint not null check (libre_bytes >= 0),
  discos jsonb not null default '[]'::jsonb
);
create index if not exists nas_espacio_medido_at_idx on public.nas_espacio (medido_at desc);
alter table public.nas_espacio enable row level security;
create policy nas_espacio_admin_lee on public.nas_espacio
  for select to authenticated using (public.es_admin_o_dueno((select auth.uid())));

-- 3) ALERTAS DE LLENADO (80 % y 90 %). Una vez por nivel; si el uso baja del
--    75 % (se liberó o se cambió un disco) la edge borra la fila y el aviso se
--    rearma.
create table if not exists public.nas_espacio_alertas (
  nivel smallint primary key check (nivel in (80, 90)),
  avisado_at timestamptz not null default now(),
  pct numeric(5, 2) not null
);
alter table public.nas_espacio_alertas enable row level security;
create policy nas_espacio_alertas_admin_lee on public.nas_espacio_alertas
  for select to authenticated using (public.es_admin_o_dueno((select auth.uid())));

-- 4) RESUMEN PARA EL DASHBOARD (Centro de operaciones, solo admin/dueño).
--    · El NAS no deja usar el último 5 % de cada disco (MARGEN_LIBRE en
--      infra/nas-drive/server.mjs): «lleno» = 95 %.
--    · Ritmo: del disco real si hay ≥ 7 días de muestras; si todavía no, de lo
--      que entró al Drive en los últimos 28 días (Maven tiene registrado ~97 %
--      de lo que ocupa el disco).
--    · Qué ocupa: por unidad compartida (drive_items.unidad_id; lo que no está
--      en una unidad es «Mi unidad» de cada persona). Se calcula al momento
--      (~0,7 s sobre ~940 mil archivos).
create or replace function public.nas_espacio_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ult public.nas_espacio%rowtype;
  viejo public.nas_espacio%rowtype;
  usado bigint;
  util bigint;
  dias numeric;
  ritmo numeric;      -- bytes por semana
  fuente text;
  semanas numeric;
  que jsonb;
  alertas jsonb;
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'Solo admin o dueño' using errcode = '42501';
  end if;

  select * into ult from public.nas_espacio order by medido_at desc limit 1;
  if not found then
    return jsonb_build_object('sin_muestras', true);
  end if;

  usado := ult.total_bytes - ult.libre_bytes;
  util := greatest(0, floor(ult.total_bytes * 0.95)::bigint - usado);

  select * into viejo from public.nas_espacio
   where medido_at >= ult.medido_at - interval '30 days'
   order by medido_at asc limit 1;
  dias := extract(epoch from (ult.medido_at - viejo.medido_at)) / 86400.0;
  if dias >= 7 then
    ritmo := ((ult.total_bytes - ult.libre_bytes) - (viejo.total_bytes - viejo.libre_bytes)) / dias * 7;
    fuente := 'disco';
  else
    select coalesce(sum(i.size), 0) / 4.0 into ritmo
      from public.drive_items i
     where i.tipo = 'archivo' and i.created_at > now() - interval '28 days';
    fuente := 'drive';
  end if;
  semanas := case when ritmo > 0 then util / ritmo end;

  select coalesce(jsonb_agg(jsonb_build_object('unidad', x.unidad, 'bytes', x.bytes, 'archivos', x.archivos) order by x.bytes desc), '[]'::jsonb)
    into que
    from (
      select u.nombre as unidad, sum(i.size)::bigint as bytes, count(*) as archivos
        from public.drive_items i
        left join public.drive_items u on u.id = i.unidad_id
       where i.tipo = 'archivo' and i.trashed_at is null
       group by u.nombre
       order by sum(i.size) desc nulls last
       limit 8
    ) x;

  select coalesce(jsonb_agg(jsonb_build_object('nivel', a.nivel, 'avisado_at', a.avisado_at) order by a.nivel), '[]'::jsonb)
    into alertas from public.nas_espacio_alertas a;

  return jsonb_build_object(
    'medido_at', ult.medido_at,
    'total', ult.total_bytes,
    'libre', ult.libre_bytes,
    'usado', usado,
    'util_restante', util,
    'discos', ult.discos,
    'ritmo_semana', round(ritmo),
    'ritmo_fuente', fuente,
    'semanas_para_llenarse', round(semanas, 1),
    'fecha_llena', case when semanas is not null then (ult.medido_at + make_interval(days => least(semanas * 7, 36500)::int))::date end,
    'que_ocupa', que,
    'alertas', alertas
  );
end;
$$;

revoke all on function public.nas_espacio_resumen() from public, anon;
grant execute on function public.nas_espacio_resumen() to authenticated;
