-- cowork_tiempo_diario: no reportar "última salida" si la persona SIGUE EN SALA
-- ahora (Alvaro, 09/11). El bug: para una sesión abierta (ended_at NULL), la
-- función tomaba el último latido (last_seen_at) como "ultima_salida", así que
-- una persona activa aparecía como "salió a las HH:MM". Ahora, si hay al menos un
-- tramo abierto con latido fresco (< 5 min), ultima_salida = NULL (aún no salió).

CREATE OR REPLACE FUNCTION public.cowork_tiempo_diario(_desde date DEFAULT NULL::date, _hasta date DEFAULT NULL::date, _user_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 100, _offset integer DEFAULT 0)
 RETURNS TABLE(dia date, user_id uuid, nombre text, seg_activo integer, seg_meet integer, seg_pausa integer, seg_sin_camara integer, seg_sin_pantalla integer, seg_fuera_de_camara integer, seg_en_sala integer, horas_activas numeric, sesiones integer, primer_ingreso timestamp with time zone, ultima_salida timestamp with time zone, seg_sin_conexion integer, seg_sin_conexion_larga integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with tramos as (
    select
      s.user_id,
      s.session_id,
      s.estado,
      greatest(s.started_at, d.dia_ini) as ini,
      least(coalesce(s.ended_at, s.last_seen_at), d.dia_fin) as fin,
      -- ¿Sigue EN SALA ahora? Sesión sin cerrar con latido fresco (< 5 min).
      (s.ended_at is null and s.last_seen_at > now() - interval '5 minutes') as abierto,
      d.dia
    from public.cowork_tiempo_segmentos s
    cross join lateral (
      select g::date as dia,
             ((g::date)::timestamp at time zone 'America/Bogota') as dia_ini,
             ((g::date + 1)::timestamp at time zone 'America/Bogota') as dia_fin
      from generate_series(
        ((s.started_at at time zone 'America/Bogota')::date)::timestamp,
        ((coalesce(s.ended_at, s.last_seen_at) at time zone 'America/Bogota')::date)::timestamp,
        interval '1 day'
      ) g
    ) d
    where (_desde is null or (coalesce(s.ended_at, s.last_seen_at) at time zone 'America/Bogota')::date >= _desde)
      and (_hasta is null or (s.started_at at time zone 'America/Bogota')::date <= _hasta)
      and (_user_id is null or s.user_id = _user_id)
      and (auth.uid() is null or s.user_id = auth.uid()
           or (public.has_role(auth.uid(), 'admin')
               and s.session_id in (select public.cowork_sesiones_de_mi_agencia())))
  ),
  sumas as (
    select
      t.dia, t.user_id,
      sum(case when t.estado in ('activo','meet','sin_conexion') then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_activo,
      sum(case when t.estado = 'meet' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_meet,
      sum(case when t.estado = 'pausa' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_pausa,
      sum(case when t.estado = 'sin_camara' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_sin_camara,
      sum(case when t.estado = 'sin_pantalla' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_sin_pantalla,
      sum(case when t.estado = 'fuera_de_camara' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_fuera_de_camara,
      sum(case when t.estado = 'sin_conexion' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_sin_conexion,
      sum(case when t.estado = 'sin_conexion_larga' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_sin_conexion_larga,
      sum(extract(epoch from (t.fin - t.ini)))::int as seg_en_sala,
      count(distinct t.session_id)::int as sesiones,
      min(t.ini) as primer_ingreso,
      -- Si sigue en sala ahora, no hay salida: NULL (aún no sale).
      case when bool_or(t.abierto) then null else max(t.fin) end as ultima_salida
    from tramos t
    where t.fin > t.ini
      and (_desde is null or t.dia >= _desde)
      and (_hasta is null or t.dia <= _hasta)
    group by t.dia, t.user_id
  )
  select
    su.dia, su.user_id, p.full_name as nombre,
    su.seg_activo, su.seg_meet, su.seg_pausa, su.seg_sin_camara, su.seg_sin_pantalla, su.seg_fuera_de_camara, su.seg_en_sala,
    round(su.seg_activo / 3600.0, 2) as horas_activas,
    su.sesiones, su.primer_ingreso, su.ultima_salida,
    su.seg_sin_conexion, su.seg_sin_conexion_larga
  from sumas su
  left join public.profiles p on p.id = su.user_id
  order by su.dia desc, p.full_name
  limit least(greatest(_limit, 1), 500)
  offset greatest(_offset, 0)
$function$;
