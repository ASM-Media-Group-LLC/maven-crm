-- public-api v2 (Alvaro, 07/11): endpoints nuevos pedidos por el equipo externo
-- que ya consume la API:
--   GET /attendance        → clock-in / clock-out / horas / tardanza por día
--   GET /argos/notas       → nota 0-100 por persona y día (atendiendo / cámara / pantalla)
--   /employees/{id}        → perfil completo (handler en el edge)
--   /argos/screens         → monitor_capturas con URL firmada (handler en el edge)
--
-- Las RPCs son SECURITY DEFINER y dependen de que el edge ya haya validado la
-- key: el edge pasa la llamada con service_role, así que RLS no se evalúa.

-- ============================================================================
-- /attendance: por persona y día. Entró, salió, horas trabajadas (activo),
-- minutos tarde vs su horario esperado, pausas totales.
-- ============================================================================
create or replace function public.api_attendance(
  _from date, _to date, _profile_id uuid, _limit int, _offset int
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with dias as (
    select user_id,
           (started_at at time zone 'America/Bogota')::date as dia,
           min(started_at) as entro_at,
           max(coalesce(ended_at, last_seen_at, started_at)) as salio_at,
           sum(case when estado = 'activo' then coalesce(seconds, 0) else 0 end)::int as segs_activo,
           sum(case when estado = 'pausa'  then coalesce(seconds, 0) else 0 end)::int as segs_pausa,
           sum(coalesce(seconds, 0))::int as segs_conectado
    from cowork_tiempo_segmentos
    where (_from is null or started_at >= _from::timestamptz)
      and (_to   is null or started_at <  (_to + 1)::timestamptz)
      and (_profile_id is null or user_id = _profile_id)
    group by user_id, dia
  ),
  tar as (
    select user_id, dia, horario_asignado, entro_at as tard_entro_at,
           tarde_min, turno_nombre
    from tardanzas_registro
    where (_from is null or dia >= _from)
      and (_to   is null or dia <= _to)
      and (_profile_id is null or user_id = _profile_id)
  )
  select jsonb_build_object(
    'data', coalesce(jsonb_agg(
      jsonb_build_object(
        'employee_id', d.user_id,
        'date', d.dia,
        'clock_in_at', d.entro_at,
        'clock_out_at', d.salio_at,
        'hours_worked', round(d.segs_activo / 3600.0, 2),
        'hours_paused', round(d.segs_pausa / 3600.0, 2),
        'hours_connected', round(d.segs_conectado / 3600.0, 2),
        'scheduled_entry', tar.horario_asignado,
        'late_minutes', coalesce(tar.tarde_min, 0),
        'shift_name', tar.turno_nombre
      ) order by d.dia desc, d.user_id
    ), '[]'::jsonb),
    'count', count(*)
  )
  from (
    select d.*, tar.horario_asignado, tar.tarde_min, tar.turno_nombre
    from dias d
    left join tar on tar.user_id = d.user_id and tar.dia = d.dia
    order by d.dia desc, d.user_id
    offset coalesce(_offset, 0) limit coalesce(_limit, 100)
  ) d
  left join tar on tar.user_id = d.user_id and tar.dia = d.dia;
$$;

grant execute on function public.api_attendance(date, date, uuid, int, int) to authenticated, service_role;

-- ============================================================================
-- /argos/notas: nota 0-100 por persona y día, con desglose
-- pantalla (45) / cámara (35) / distracción (20). Fórmula calcada de
-- frontend/src/lib/notaEmpleado.ts:
--   pantalla_pct = segs(activo + pausa) / jornada_esperada
--   camara_pct   = segs(cara_visible) / segs(con cámara)
--   distraccion  = 1 - fuera_de_lugar_ratio
-- Devuelve las métricas crudas también para que el partner pueda recalcular.
-- ============================================================================
create or replace function public.api_argos_notas(
  _from date, _to date, _profile_id uuid, _limit int, _offset int
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with segs as (
    select user_id,
           (started_at at time zone 'America/Bogota')::date as dia,
           sum(case when estado in ('activo','pausa') then coalesce(seconds, 0) else 0 end)::int as segs_pantalla,
           sum(coalesce(seconds, 0))::int as segs_conectado
    from cowork_tiempo_segmentos
    where (_from is null or started_at >= _from::timestamptz)
      and (_to   is null or started_at <  (_to + 1)::timestamptz)
      and (_profile_id is null or user_id = _profile_id)
    group by user_id, dia
  ),
  caps as (
    select user_id,
           (created_at at time zone 'America/Bogota')::date as dia,
           count(*) filter (where tipo = 'camara')::int as caps_camara,
           count(*) filter (where tipo = 'camara' and cara_visible is true)::int as caps_cara,
           count(*) filter (where tipo = 'pantalla')::int as caps_pantalla,
           count(*) filter (where fuera_de_lugar is true and perdonado is not true)::int as caps_distraido
    from monitor_capturas
    where (_from is null or created_at >= _from::timestamptz)
      and (_to   is null or created_at <  (_to + 1)::timestamptz)
      and (_profile_id is null or user_id = _profile_id)
    group by user_id, dia
  ),
  union_dias as (
    select user_id, dia from segs
    union
    select user_id, dia from caps
  ),
  juntos as (
    select u.user_id, u.dia,
           coalesce(s.segs_pantalla, 0) as segs_pantalla,
           coalesce(s.segs_conectado, 0) as segs_conectado,
           coalesce(c.caps_camara, 0) as caps_camara,
           coalesce(c.caps_cara, 0) as caps_cara,
           coalesce(c.caps_pantalla, 0) as caps_pantalla,
           coalesce(c.caps_distraido, 0) as caps_distraido
    from union_dias u
    left join segs s on s.user_id = u.user_id and s.dia = u.dia
    left join caps c on c.user_id = u.user_id and c.dia = u.dia
  ),
  notas as (
    select user_id, dia, segs_pantalla, segs_conectado, caps_camara, caps_cara, caps_pantalla, caps_distraido,
           round((least(1.0, segs_pantalla / nullif(8 * 3600.0, 0)) * 45)::numeric, 1) as nota_pantalla,
           case when caps_camara > 0 then round((caps_cara::numeric / caps_camara) * 35, 1) else 0 end as nota_camara,
           case when caps_pantalla > 0 then round((1 - (caps_distraido::numeric / caps_pantalla)) * 20, 1) else 20 end as nota_distraccion
    from juntos
  )
  select jsonb_build_object(
    'data', coalesce(jsonb_agg(
      jsonb_build_object(
        'employee_id', user_id,
        'date', dia,
        'score', least(100, greatest(0, round((coalesce(nota_pantalla,0) + coalesce(nota_camara,0) + coalesce(nota_distraccion,0))::numeric, 1))),
        'breakdown', jsonb_build_object(
          'screen_score', nota_pantalla,
          'camera_score', nota_camara,
          'focus_score', nota_distraccion
        ),
        'raw', jsonb_build_object(
          'seconds_on_screen', segs_pantalla,
          'seconds_connected', segs_conectado,
          'camera_snapshots', caps_camara,
          'camera_face_visible', caps_cara,
          'screen_snapshots', caps_pantalla,
          'screen_off_task', caps_distraido
        )
      ) order by dia desc, user_id
    ), '[]'::jsonb),
    'count', count(*)
  )
  from (
    select * from notas order by dia desc, user_id
    offset coalesce(_offset, 0) limit coalesce(_limit, 100)
  ) q;
$$;

grant execute on function public.api_argos_notas(date, date, uuid, int, int) to authenticated, service_role;
