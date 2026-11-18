-- CADA CORTE DE LLAMADA, EN PALABRAS (Alvaro, 18/11/2026, preguntas y respuestas:
-- «menos tecnicismo: por qué, qué pasó, cuántos minutos se le cayó y cuánto
-- tardó en regresar»). Una fila por corte del día (los mismos que cuenta
-- argos_llamadas_hoy: parpadeo_ok, caida, reentrada_agotada, recarga), con:
--   · tipo: qué pasó, para decirlo en palabras (internet / caída / no pudo
--     volver / recarga).
--   · duracion_s: cuánto estuvo sin llamada. Para un parpadeo: lo que manda el
--     navegador al volver (contexto.duracion_ms, desde el 18/11) o, si no, el
--     tiempo desde su «parpadeo» anterior (≤ 5 min). Para una caída: hasta su
--     siguiente reentrada_ok (≤ 30 min). null = no se sabe (el «se cortó» se
--     intenta guardar justo sin internet y muchas veces no llega).
--   · volvio: si volvió a la llamada (false = no pudo volver o no se sabe).
-- Mismo permiso que argos_llamadas_hoy: quien ve Argos, y solo su gente.

create or replace function public.argos_llamadas_cortes_hoy()
returns table (
  user_id uuid,
  creado timestamptz,
  fase text,
  tipo text,
  duracion_s integer,
  volvio boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_desde timestamptz := ((now() at time zone 'America/Bogota')::date)::timestamp at time zone 'America/Bogota';
begin
  if not coalesce(public.ve_argos(), false) then
    raise exception 'argos_llamadas_cortes_hoy: sin permiso para ver las llamadas del equipo' using errcode = '42501';
  end if;

  return query
  with vis as (
    select v.user_id as uid from public.argos_vigilables() v
  ),
  todos as (
    select lc.user_id as uid, lc.sala, lc.fase, lc.creado, lc.contexto
      from public.llamada_cortes lc
     where lc.creado >= v_desde - interval '30 minutes'
       and (lc.user_id = (select auth.uid()) or lc.user_id in (select vis.uid from vis))
  ),
  cortes as (
    select t.* from todos t
     where t.creado >= v_desde
       and t.fase in ('parpadeo_ok', 'caida', 'reentrada_agotada', 'recarga')
  )
  select c.uid,
         c.creado,
         c.fase,
         case c.fase
           when 'parpadeo_ok' then 'internet'
           when 'caida' then 'caida'
           when 'reentrada_agotada' then 'no_volvio'
           when 'recarga' then 'recarga'
         end as tipo,
         case
           when c.fase = 'parpadeo_ok' then coalesce(
             round((nullif(c.contexto->>'duracion_ms', ''))::numeric / 1000)::int,
             (select round(extract(epoch from (c.creado - p.creado)))::int
                from todos p
               where p.uid = c.uid and p.fase = 'parpadeo' and p.creado < c.creado
                 and p.creado >= c.creado - interval '5 minutes'
                 and p.sala is not distinct from c.sala
               order by p.creado desc limit 1))
           when c.fase = 'caida' then
             (select round(extract(epoch from (r.creado - c.creado)))::int
                from public.llamada_cortes r
               where r.user_id = c.uid and r.fase = 'reentrada_ok' and r.creado > c.creado
                 and r.creado <= c.creado + interval '30 minutes'
               order by r.creado asc limit 1)
           else null
         end as duracion_s,
         case
           when c.fase in ('parpadeo_ok', 'recarga') then true
           when c.fase = 'caida' then exists (
             select 1 from public.llamada_cortes r
              where r.user_id = c.uid and r.fase = 'reentrada_ok' and r.creado > c.creado
                and r.creado <= c.creado + interval '30 minutes')
           else false
         end as volvio
    from cortes c
   order by c.uid, c.creado desc;
end;
$$;

revoke all on function public.argos_llamadas_cortes_hoy() from public, anon;
grant execute on function public.argos_llamadas_cortes_hoy() to authenticated;
