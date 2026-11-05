-- Nota nueva de Argos + "Perdonar" faltas (Alvaro, 05/11)
-- La nota pasa a medir pantalla/cámara sobre el TURNO completo (8h − pausa libre)
-- y la distracción (pantallazos fuera de lugar) con peso 20. El dueño y los admins
-- pueden PERDONAR un pantallazo marcado para que no baje la nota (ej. un PR que sí
-- puede ver redes de sus creadoras). Lo perdonado deja de contar como falta.

-- 1) Marca de perdonado en cada pantallazo.
alter table public.monitor_capturas
  add column if not exists perdonado      boolean not null default false,
  add column if not exists perdonado_por  uuid,
  add column if not exists perdonado_at   timestamptz;

-- 2) Permiso "dueño o admin" (para perdonar y, más adelante, la config del panel).
create or replace function public.es_admin_o_dueno(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.es_dueno(_uid)
      or exists (select 1 from public.user_roles ur
                 where ur.user_id = _uid and lower(ur.role) = 'admin');
$$;

-- 3) RPC: perdonar / des-perdonar un pantallazo. Solo dueño + admins.
create or replace function public.argos_perdonar_captura(_id uuid, _perdonar boolean default true)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'sin permiso para perdonar';
  end if;
  update public.monitor_capturas
    set perdonado     = coalesce(_perdonar, true),
        perdonado_por = case when coalesce(_perdonar, true) then (select auth.uid()) else null end,
        perdonado_at  = case when coalesce(_perdonar, true) then now() else null end
  where id = _id;
end;
$$;

revoke all on function public.argos_perdonar_captura(uuid, boolean) from public, anon;
grant execute on function public.argos_perdonar_captura(uuid, boolean) to authenticated;

-- 4) argos_dia_personas: las "juzgadas_ok" ahora cuentan también las PERDONADAS
--    (una falta perdonada no baja la nota).
create or replace function public.argos_dia_personas(_dia date, _h_desde integer, _h_hasta integer)
 returns table(user_id uuid, seg_activo bigint, seg_pausa bigint, seg_sin_pantalla bigint, seg_sin_camara bigint, seg_fuera_camara bigint, seg_sin_conexion bigint, juzgadas bigint, juzgadas_ok bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with lim as (
    select ((_dia)::timestamp at time zone 'America/Bogota') + make_interval(hours => _h_desde) as lo,
           ((_dia)::timestamp at time zone 'America/Bogota') + make_interval(hours => _h_hasta) as hi
  ),
  seg as (
    select s.user_id,
      sum(s.seconds) filter (where s.estado='activo')::bigint          as seg_activo,
      sum(s.seconds) filter (where s.estado='pausa')::bigint           as seg_pausa,
      sum(s.seconds) filter (where s.estado='sin_pantalla')::bigint    as seg_sin_pantalla,
      sum(s.seconds) filter (where s.estado='sin_camara')::bigint      as seg_sin_camara,
      sum(s.seconds) filter (where s.estado='fuera_de_camara')::bigint as seg_fuera_camara,
      sum(s.seconds) filter (where s.estado='sin_conexion')::bigint    as seg_sin_conexion
    from public.cowork_tiempo_segmentos s, lim
    where s.started_at >= lim.lo and s.started_at < lim.hi
      and (public.es_dueno((select auth.uid())) or s.user_id = (select auth.uid()))
    group by s.user_id
  ),
  cap as (
    select c.user_id,
      count(*) filter (where c.tipo='pantalla' and c.veredicto is not null)::bigint as juzgadas,
      count(*) filter (where c.tipo='pantalla' and c.veredicto is not null
                        and (c.fuera_de_lugar is not true or c.perdonado is true))::bigint as juzgadas_ok
    from public.monitor_capturas c, lim
    where c.created_at >= lim.lo and c.created_at < lim.hi
      and (public.es_dueno((select auth.uid())) or c.user_id = (select auth.uid()))
    group by c.user_id
  )
  select coalesce(seg.user_id, cap.user_id) as user_id,
    coalesce(seg.seg_activo,0), coalesce(seg.seg_pausa,0), coalesce(seg.seg_sin_pantalla,0),
    coalesce(seg.seg_sin_camara,0), coalesce(seg.seg_fuera_camara,0), coalesce(seg.seg_sin_conexion,0),
    coalesce(cap.juzgadas,0), coalesce(cap.juzgadas_ok,0)
  from seg full join cap on cap.user_id = seg.user_id
$function$;