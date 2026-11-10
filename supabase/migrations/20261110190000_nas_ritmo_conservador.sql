-- RITMO DE LLENADO DEL NAS: CONSERVADOR (Alvaro, 10/11/2026).
--
-- La primera versión de nas_espacio_resumen() tomaba lo que entró al Drive en
-- las últimas 4 semanas (~60 GB/semana → «se llena en ~3,7 años»). Pero el
-- contenido entra a montones (un shooting son 2 TB de golpe): en el último año
-- el ritmo fue ~141 GB/semana → ~1,6 años. Para planear disco es mejor
-- quedarse corto que sorprenderse, así que ahora se usa EL MÁS ALTO de:
--   · el promedio del último año en el Drive (por la fecha de cada archivo), y
--   · lo medido en el disco, cuando ya hay ≥ 30 días de muestras (ventana de
--     hasta 90 días).
-- ritmo_fuente dice cuál ganó: 'anual' o 'disco'.

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
  ritmo_anual numeric;   -- bytes por semana, promedio del último año en el Drive
  ritmo_disco numeric;   -- bytes por semana, medido en el disco (null si < 30 días)
  ritmo numeric;
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

  select coalesce(sum(i.size), 0) / 52.18 into ritmo_anual
    from public.drive_items i
   where i.tipo = 'archivo' and i.trashed_at is null and i.created_at > now() - interval '365 days';

  select * into viejo from public.nas_espacio
   where medido_at >= ult.medido_at - interval '90 days'
   order by medido_at asc limit 1;
  dias := extract(epoch from (ult.medido_at - viejo.medido_at)) / 86400.0;
  if dias >= 30 then
    ritmo_disco := ((ult.total_bytes - ult.libre_bytes) - (viejo.total_bytes - viejo.libre_bytes)) / dias * 7;
  end if;

  if ritmo_disco is not null and ritmo_disco > ritmo_anual then
    ritmo := ritmo_disco; fuente := 'disco';
  else
    ritmo := ritmo_anual; fuente := 'anual';
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
    'ritmo_anual', round(ritmo_anual),
    'ritmo_disco', round(ritmo_disco),
    'dias_medidos', round(dias),
    'semanas_para_llenarse', round(semanas, 1),
    'fecha_llena', case when semanas is not null then (ult.medido_at + make_interval(days => least(semanas * 7, 36500)::int))::date end,
    'que_ocupa', que,
    'alertas', alertas
  );
end;
$$;
