-- HISTORIAL por hora del día (Alvaro, 04/11): para la pestaña Historial con la
-- gráfica hora por hora y las 3 cajas por turno (AM 8-16 / PM 16-24 / Madrugada
-- 0-8, hora Colombia). Promedia por persona y luego por hora. Solo el dueño.
create or replace function public.argos_horas_dia(_dia date)
returns table(hora int, pantalla int, camara int, atencion int, personas int)
language sql
stable security definer
set search_path to 'public'
as $function$
  with cap as (
    select extract(hour from (c.created_at at time zone 'America/Bogota'))::int as hora,
           c.user_id,
           floor(extract(epoch from c.created_at)/120)::bigint as bkt,
           c.tipo, c.veredicto, c.fuera_de_lugar, c.cara_visible
    from public.monitor_capturas c
    where c.created_at >= ((_dia)::timestamp at time zone 'America/Bogota')
      and c.created_at < ((_dia + 1)::timestamp at time zone 'America/Bogota')
      and public.es_dueno((select auth.uid()))
  ),
  pp as (
    select hora, user_id,
      count(distinct bkt) filter (where tipo='camara')  as mom_cam,
      count(distinct bkt) filter (where tipo='pantalla') as mom_pan,
      count(distinct bkt) filter (where tipo='camara' and cara_visible is true)      as cara_ok,
      count(distinct bkt) filter (where tipo='camara' and cara_visible is not null)  as cara_med,
      count(*) filter (where tipo='pantalla' and veredicto is not null)              as juzg,
      count(*) filter (where tipo='pantalla' and veredicto is not null and fuera_de_lugar is not true) as juzg_ok
    from cap group by hora, user_id
  )
  select hora,
    round(avg(case when mom_cam  > 0 then least(1.0, mom_pan::numeric / mom_cam) end) * 100)::int as pantalla,
    round(avg(case when cara_med > 0 then cara_ok::numeric / cara_med end)            * 100)::int as camara,
    round(avg(case when juzg     > 0 then juzg_ok::numeric / juzg end)                * 100)::int as atencion,
    count(distinct user_id)::int as personas
  from pp group by hora order by hora
$function$;

grant execute on function public.argos_horas_dia(date) to authenticated, service_role;
