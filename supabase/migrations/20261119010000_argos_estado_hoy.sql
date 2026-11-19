-- ESTADO (Alvaro, 18/11/2026: «todo lo que reporte Argos de cada persona, ahí
-- va llegando, uno por uno»): una sola lista con lo que pasó HOY (Bogotá) a la
-- gente que el que mira puede vigilar. Cada fila trae el pantallazo más cercano
-- (monitor_capturas) para ver qué tenía en pantalla en ese momento.
--   clase = 'corte'   → se le cayó la llamada / el internet (de argos_llamadas_cortes_hoy)
--   clase = 'llamado' → Argos le llamó la atención (argos_nudges)
--   clase = 'fuera'   → estuvo fuera de Cowork (cowork_fuera; sin los fin_de_turno)
--   clase = 'ia'      → la IA lo vio distraído o con el celular (monitor_eventos)
-- Las faltas y llegadas tarde salen del horario en el frontend (useHoyDelEquipo).
create or replace function public.argos_estado_hoy()
returns table (
  user_id uuid,
  creado timestamptz,
  clase text,
  tipo text,
  detalle text,
  duracion_s integer,
  volvio boolean,
  escalado boolean,
  llamados integer,
  reportado boolean,
  por_corte boolean,
  estado text,
  captura_path text,
  captura_nas_path text,
  captura_en_nas boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_desde timestamptz := ((now() at time zone 'America/Bogota')::date)::timestamp at time zone 'America/Bogota';
begin
  if not coalesce(public.ve_argos(), false) then
    raise exception 'argos_estado_hoy: sin permiso para ver el estado del equipo' using errcode = '42501';
  end if;

  return query
  with vis as (
    select v.user_id as uid from public.argos_vigilables() v
    union
    select (select auth.uid())
  ),
  base as (
    -- cortes de llamada / internet
    select c.user_id as uid, c.creado as cuando, 'corte'::text as clase, c.tipo as tipo,
           null::text as detalle, c.duracion_s as dur, c.volvio as volvio,
           null::boolean as escalado, null::integer as llamados, null::boolean as reportado,
           null::boolean as por_corte, null::text as estado, null::text as path_evento
      from public.argos_llamadas_cortes_hoy() c
    union all
    -- llamados de atención de Argos
    select n.user_id, coalesce(n.avisado_at, n.created_at), 'llamado', n.tipo,
           n.mensaje,
           case when n.cerrado_at is not null
                then greatest(0, round(extract(epoch from (n.cerrado_at - coalesce(n.avisado_at, n.created_at)))))::int end,
           n.cerrado_at is not null,
           n.escalado_at is not null, null, null, null, null, null
      from public.argos_nudges n
     where coalesce(n.avisado_at, n.created_at) >= v_desde
       and n.user_id in (select vis.uid from vis)
    union all
    -- fuera de Cowork (no cuenta el fin de turno)
    select f.user_id, f.desde, 'fuera', coalesce(nullif(f.motivo, ''), 'fuera'),
           null,
           round(extract(epoch from (coalesce(f.hasta, now()) - f.desde)))::int,
           f.hasta is not null,
           null, coalesce(f.llamados, 0), f.reportado_at is not null,
           exists (
             select 1 from public.llamada_cortes lc
              where lc.user_id = f.user_id
                and lc.fase in ('caida', 'reentrada_agotada', 'parpadeo')
                and lc.creado between f.desde - interval '2 minutes' and f.desde + interval '1 minute'
           ),
           null, null
      from public.cowork_fuera f
     where f.desde >= v_desde
       and f.motivo is distinct from 'fin_de_turno'
       and f.user_id in (select vis.uid from vis)
    union all
    -- lo que vio la IA
    select e.user_id, e.created_at, 'ia', e.tipo,
           e.detalle, null, null, null, null, null, null, e.estado, e.captura_path
      from public.monitor_eventos e
     where e.created_at >= v_desde
       and e.tipo in ('distraido', 'celular')
       and coalesce(e.estado, '') <> 'descartado'
       and e.user_id in (select vis.uid from vis)
  )
  select b.uid, b.cuando, b.clase, b.tipo, b.detalle, b.dur, b.volvio, b.escalado,
         b.llamados, b.reportado, b.por_corte, b.estado,
         foto.path, foto.nas_path, foto.en_nas
    from base b
    left join lateral (
      select mc.path, mc.nas_path, coalesce(mc.en_nas, false) as en_nas
        from public.monitor_capturas mc
       where mc.user_id = b.uid
         and mc.tipo = 'pantalla'
         and mc.created_at between b.cuando - interval '3 minutes' and b.cuando + interval '3 minutes'
       order by (mc.path = b.path_evento) desc nulls last,
                abs(extract(epoch from (mc.created_at - b.cuando)))
       limit 1
    ) foto on true
   order by b.cuando desc
   limit 3000;
end;
$function$;

revoke all on function public.argos_estado_hoy() from public, anon;
grant execute on function public.argos_estado_hoy() to authenticated;
