-- Cámara REAL (Álvaro, 04/11): el detector de cara ya corre al tomar cada foto
-- de cámara; guardamos si HABÍA cara en ese instante. Antes la cámara% salía de
-- mom_camara/(mom_camara+faltas) y las faltas nunca se registraban => 100% de
-- mentira. Ahora cámara% = momentos con cara ÷ momentos medidos.
-- (Ya aplicada a producción por el MCP; este archivo deja el repo al día.)
alter table public.monitor_capturas
  add column if not exists cara_visible boolean;

comment on column public.monitor_capturas.cara_visible is
  'Solo fotos de cámara: true = el detector vio una cara en ese instante; false = no vio a nadie; null = no se pudo medir (detector no cargó / foto de pantalla).';

drop function if exists public.argos_momentos_dia(date);

create function public.argos_momentos_dia(_dia date)
returns table(
  user_id uuid,
  mom_camara bigint,
  mom_pantalla bigint,
  faltas_camara bigint,
  juzgadas bigint,
  juzgadas_ok bigint,
  mom_cara_ok bigint,
  mom_cara_medida bigint
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
    count(distinct bkt) filter (where cap.tipo='camara')::bigint,                 -- momentos con cámara
    count(distinct bkt) filter (where cap.tipo='pantalla')::bigint,               -- momentos compartiendo pantalla
    coalesce(max(fal.fc), 0)::bigint,
    count(*) filter (where cap.tipo='pantalla' and cap.veredicto is not null)::bigint,
    count(*) filter (where cap.tipo='pantalla' and cap.veredicto is not null and cap.fuera_de_lugar is not true)::bigint,
    count(distinct bkt) filter (where cap.tipo='camara' and cap.cara_visible is true)::bigint,       -- momentos con CARA visible
    count(distinct bkt) filter (where cap.tipo='camara' and cap.cara_visible is not null)::bigint    -- momentos de cámara MEDIDOS
  from cap left join fal on fal.user_id = cap.user_id
  group by cap.user_id
$function$;

grant execute on function public.argos_momentos_dia(date) to authenticated, anon, service_role;
