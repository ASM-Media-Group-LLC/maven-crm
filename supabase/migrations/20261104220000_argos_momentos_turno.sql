-- La gente de un TURNO (Alvaro, 04/11): como argos_momentos_dia pero acotado a un
-- rango de horas [_h_desde, _h_hasta) del día (hora Colombia). Alimenta el
-- drill-down del Historial: tocar un turno → quién trabajó y cómo estuvo.
create or replace function public.argos_momentos_turno(_dia date, _h_desde int, _h_hasta int)
returns table(
  user_id uuid, mom_camara bigint, mom_pantalla bigint, faltas_camara bigint,
  juzgadas bigint, juzgadas_ok bigint, mom_cara_ok bigint, mom_cara_medida bigint
)
language sql
stable security definer
set search_path to 'public'
as $function$
  with cap as (
    select c.user_id,
           floor(extract(epoch from c.created_at)/120)::bigint as bkt,
           c.tipo, c.veredicto, c.fuera_de_lugar, c.cara_visible
    from public.monitor_capturas c
    where c.created_at >= ((_dia)::timestamp at time zone 'America/Bogota')
      and c.created_at < ((_dia + 1)::timestamp at time zone 'America/Bogota')
      and extract(hour from (c.created_at at time zone 'America/Bogota'))::int >= _h_desde
      and extract(hour from (c.created_at at time zone 'America/Bogota'))::int < _h_hasta
      and (public.es_dueno((select auth.uid())) or c.user_id = (select auth.uid()))
  ),
  fal as (
    select e.user_id, count(*)::bigint fc
    from public.monitor_eventos e
    where e.tipo in ('camara_apagada','camara_tapada','se_fue')
      and e.estado <> 'descartado'
      and e.created_at >= ((_dia)::timestamp at time zone 'America/Bogota')
      and e.created_at < ((_dia + 1)::timestamp at time zone 'America/Bogota')
      and extract(hour from (e.created_at at time zone 'America/Bogota'))::int >= _h_desde
      and extract(hour from (e.created_at at time zone 'America/Bogota'))::int < _h_hasta
    group by e.user_id
  )
  select cap.user_id,
    count(distinct bkt) filter (where cap.tipo='camara')::bigint,
    count(distinct bkt) filter (where cap.tipo='pantalla')::bigint,
    coalesce(max(fal.fc), 0)::bigint,
    count(*) filter (where cap.tipo='pantalla' and cap.veredicto is not null)::bigint,
    count(*) filter (where cap.tipo='pantalla' and cap.veredicto is not null and cap.fuera_de_lugar is not true)::bigint,
    count(distinct bkt) filter (where cap.tipo='camara' and cap.cara_visible is true)::bigint,
    count(distinct bkt) filter (where cap.tipo='camara' and cap.cara_visible is not null)::bigint
  from cap left join fal on fal.user_id = cap.user_id
  group by cap.user_id
$function$;

grant execute on function public.argos_momentos_turno(date, int, int) to authenticated, anon, service_role;
