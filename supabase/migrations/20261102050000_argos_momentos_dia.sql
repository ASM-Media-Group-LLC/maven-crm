-- Momentos del día por persona para la nota v2: de TODO el tiempo conectada
-- (capturas de cámara), cuántos momentos compartió pantalla y cuántos pantallazos
-- juzgó la IA en lo suyo. Reemplaza el cálculo por segundos de Cowork, que medía
-- solo el ratito en sala y daba notas infladas (Alvaro, 02/11).
create or replace function public.argos_momentos_dia(_dia date)
returns table(user_id uuid, mom_camara bigint, mom_pantalla bigint, faltas_camara bigint, juzgadas bigint, juzgadas_ok bigint)
language sql stable security definer set search_path to 'public'
as $function$
  with cap as (
    select c.user_id, c.tipo, c.veredicto, c.fuera_de_lugar
    from public.monitor_capturas c
    where c.created_at >= ((_dia)::timestamp at time zone 'America/Bogota')
      and c.created_at < ((_dia + 1)::timestamp at time zone 'America/Bogota')
      and (public.es_dueno((select auth.uid())) or c.user_id = (select auth.uid()))
  ),
  fal as (
    select e.user_id, count(*)::bigint fc
    from public.monitor_eventos e
    where e.tipo in ('camara_apagada','camara_tapada','se_fue')
      and e.estado <> 'descartado'
      and e.created_at >= ((_dia)::timestamp at time zone 'America/Bogota')
      and e.created_at < ((_dia + 1)::timestamp at time zone 'America/Bogota')
    group by e.user_id
  )
  select cap.user_id,
    count(*) filter (where cap.tipo='camara')::bigint,
    count(*) filter (where cap.tipo='pantalla')::bigint,
    coalesce(max(fal.fc), 0)::bigint,
    count(*) filter (where cap.tipo='pantalla' and cap.veredicto is not null)::bigint,
    count(*) filter (where cap.tipo='pantalla' and cap.veredicto is not null and cap.fuera_de_lugar is not true)::bigint
  from cap left join fal on fal.user_id = cap.user_id
  group by cap.user_id
$function$;
