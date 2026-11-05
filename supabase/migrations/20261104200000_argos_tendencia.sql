-- TENDENCIA de Argos (Alvaro, 04/11): para las gráficas del dashboard — cómo
-- viene el equipo día a día (pantalla%, cámara%, atención%). Promedia por
-- PERSONA y luego por día (una persona sin dato de cámara no arrastra el
-- promedio). Solo el dueño ve la tendencia del equipo.
create or replace function public.argos_tendencia(_desde date, _hasta date)
returns table(dia date, pantalla int, camara int, atencion int, personas int)
language sql
stable security definer
set search_path to 'public'
as $function$
  with cap as (
    select (c.created_at at time zone 'America/Bogota')::date as dia,
           c.user_id,
           floor(extract(epoch from c.created_at)/120)::bigint as bkt,
           c.tipo, c.veredicto, c.fuera_de_lugar, c.cara_visible
    from public.monitor_capturas c
    where c.created_at >= ((_desde)::timestamp at time zone 'America/Bogota')
      and c.created_at < ((_hasta + 1)::timestamp at time zone 'America/Bogota')
      and public.es_dueno((select auth.uid()))
  ),
  pp as (  -- por persona y día
    select dia, user_id,
      count(distinct bkt) filter (where tipo='camara')  as mom_cam,
      count(distinct bkt) filter (where tipo='pantalla') as mom_pan,
      count(distinct bkt) filter (where tipo='camara' and cara_visible is true)      as cara_ok,
      count(distinct bkt) filter (where tipo='camara' and cara_visible is not null)  as cara_med,
      count(*) filter (where tipo='pantalla' and veredicto is not null)              as juzg,
      count(*) filter (where tipo='pantalla' and veredicto is not null and fuera_de_lugar is not true) as juzg_ok
    from cap group by dia, user_id
  )
  select dia,
    round(avg(case when mom_cam  > 0 then least(1.0, mom_pan::numeric / mom_cam) end) * 100)::int as pantalla,
    round(avg(case when cara_med > 0 then cara_ok::numeric / cara_med end)            * 100)::int as camara,
    round(avg(case when juzg     > 0 then juzg_ok::numeric / juzg end)                * 100)::int as atencion,
    count(distinct user_id)::int as personas
  from pp group by dia order by dia
$function$;

grant execute on function public.argos_tendencia(date, date) to authenticated, service_role;
