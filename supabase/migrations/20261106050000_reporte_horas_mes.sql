-- Reporte de horas mensual (Alvaro, 06/11). "Un PDF con el desglose de horas de
-- todo octubre, lo que la gente cliqueó, ir al baño, todo". Esta RPC agrega
-- todo lo necesario en un solo JSON por mes y el frontend genera el PDF con
-- jspdf. Solo dueño/admin. Lee cowork_tiempo_segmentos (estado por segmento) y
-- cowork_breaks (baños/break/almuerzo con duración).

create or replace function public.reporte_horas_mes(_desde date, _hasta date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resultado jsonb;
  _tz text := 'America/Bogota';
begin
  if not es_admin_o_dueno((select auth.uid())) then
    raise exception 'solo admin/dueño';
  end if;

  with seg_estado as (
    select user_id,
           (started_at at time zone _tz)::date as dia,
           estado,
           sum(coalesce(seconds, 0))::int as seg
    from cowork_tiempo_segmentos
    where started_at >= _desde::timestamptz and started_at < (_hasta + 1)::timestamptz
    group by user_id, dia, estado
  ),
  seg_breaks as (
    select user_id,
           (started_at at time zone _tz)::date as dia,
           kind,
           sum(coalesce(duration_seconds, 0))::int as seg
    from cowork_breaks
    where started_at >= _desde::timestamptz and started_at < (_hasta + 1)::timestamptz
    group by user_id, dia, kind
  ),
  personas as (
    select distinct p.id as user_id, p.full_name, p.nivel, ur.role
    from profiles p
    left join user_roles ur on ur.user_id = p.id
    where p.deleted_at is null
      and (exists (select 1 from seg_estado s where s.user_id = p.id)
           or exists (select 1 from seg_breaks b where b.user_id = p.id))
  ),
  por_persona as (
    select p.user_id, p.full_name, p.nivel, p.role,
           (select jsonb_object_agg(estado, seg) from (select estado, sum(seg)::int as seg from seg_estado where user_id = p.user_id group by estado) t) as totales_estado,
           (select jsonb_object_agg(kind, seg)   from (select kind,   sum(seg)::int as seg from seg_breaks where user_id = p.user_id group by kind) t) as totales_breaks,
           (select jsonb_agg(jsonb_build_object(
             'dia', d.dia,
             'estados', (select jsonb_object_agg(estado, seg) from seg_estado where user_id = p.user_id and dia = d.dia),
             'breaks',  (select jsonb_object_agg(kind, seg)   from seg_breaks where user_id = p.user_id and dia = d.dia)
           ) order by d.dia)
           from (
             select dia from seg_estado where user_id = p.user_id
             union select dia from seg_breaks where user_id = p.user_id
           ) d) as dias
    from personas p
  )
  select jsonb_build_object(
    'desde', _desde,
    'hasta', _hasta,
    'generado_at', now(),
    'tz', _tz,
    'personas', coalesce((select jsonb_agg(to_jsonb(por_persona) order by full_name) from por_persona), '[]'::jsonb)
  ) into resultado;

  return resultado;
end;
$$;

grant execute on function public.reporte_horas_mes(date, date) to authenticated;
