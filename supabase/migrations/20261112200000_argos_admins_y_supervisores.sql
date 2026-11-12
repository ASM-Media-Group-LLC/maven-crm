-- ARGOS PARA ADMINS Y SUPERVISORES (Alvaro, 12/11/2026).
-- «El admin también puede verlo… los admin pueden ver el ojo, pueden ver a
--  todos de una. El supervisor mira a los chatters nada más (Daniel Ospina,
--  Breyner, Vanessa).»
--
-- Antes: Argos lo veían el dueño (todo) y RR. HH. (todo menos admins/dueño); los
-- supervisores tenían datos de su equipo en varias tablas pero no el menú.
-- Ahora:
--   - dueño y ADMIN  → todo el equipo (es_admin_o_dueno del que mira).
--   - RR. HH.        → igual que antes (todos menos admins y dueño).
--   - SUPERVISOR     → los agentes de su equipo = sus chatters (mi_equipo_supervisado).
-- La configuración de Argos (argos_situaciones, argos_voz) sigue solo del dueño.
-- ALTER POLICY (nunca DROP + CREATE) y auth.uid() siempre en (select …).

-- 1) Quién abre Argos (menú y rutas del frontend lo preguntan aquí).
create or replace function public.ve_argos()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(public.es_admin_o_dueno((select auth.uid())), false)
      or coalesce(public.es_rh((select auth.uid())), false)
      or exists (
        select 1 from public.profiles p
         where p.id = (select auth.uid()) and p.nivel = 'supervisor' and p.deleted_at is null
      );
$$;
revoke all on function public.ve_argos() from public;
grant execute on function public.ve_argos() to authenticated;

-- 2) A quién puede vigilar quien mira: el admin pasa a ver como el dueño.
--    (Lo usan las fotos del buzón y de los clips en Storage y puede_vigilar.)
create or replace function public.puede_vigilar_a(_viewer uuid, _target uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select _viewer is not null and _target is not null and _viewer <> _target
     and exists (select 1 from public.profiles t where t.id = _target and t.deleted_at is null)
     and (
       public.es_admin_o_dueno(_viewer)
       or (public.es_rh(_viewer) and not public.es_admin_o_dueno(_target))
       -- Supervisor → agentes de su equipo y de su agencia (= mi_equipo_supervisado).
       or exists (
         select 1
           from public.profiles s
           join public.profiles t on t.id = _target and t.nivel = 'agente' and t.deleted_at is null
          where s.id = _viewer and s.nivel = 'supervisor' and s.deleted_at is null
            and public.equipo_de(s.id) <> 'Otros'
            and public.equipo_de(s.id) = public.equipo_de(t.id)
            and exists (
              select 1 from public.user_roles a
                join public.user_roles b on b.tenant_id = a.tenant_id
               where a.user_id = s.id and b.user_id = t.id
            )
       )
     );
$$;

-- 3) El conjunto de personas que el que mira puede ver en Argos (para las
--    funciones que agregan: día por persona y tendencia).
create or replace function public.argos_vigilables()
returns table(user_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id from public.profiles p
   where public.es_admin_o_dueno((select auth.uid()))
  union
  select p.id from public.profiles p
   where coalesce(public.es_rh((select auth.uid())), false) and not public.es_admin_o_dueno(p.id)
  union
  select s.user_id from public.mi_equipo_supervisado() s;
$$;
revoke all on function public.argos_vigilables() from public;
grant execute on function public.argos_vigilables() to authenticated;

-- 4) Políticas de lectura: la rama del dueño pasa a dueño-o-admin; donde faltaba
--    el supervisor (clips, avisos de voz), se suma su equipo.
alter policy monitor_capturas_sel_supervisor on public.monitor_capturas using (
  public.es_admin_o_dueno((select auth.uid()))
  or (public.es_rh((select auth.uid())) and not public.es_admin_o_dueno(user_id))
  or user_id in (select s.user_id from public.mi_equipo_supervisado() s(user_id))
);

alter policy monitor_clips_sel_dueno on public.monitor_clips using (
  public.es_admin_o_dueno((select auth.uid()))
  or (public.es_rh((select auth.uid())) and not public.es_admin_o_dueno(user_id))
  or user_id in (select s.user_id from public.mi_equipo_supervisado() s(user_id))
);

alter policy monitor_rondas_sel_supervisor on public.monitor_rondas using (
  public.es_admin_o_dueno((select auth.uid()))
  or (public.es_rh((select auth.uid())) and not public.es_admin_o_dueno(user_id))
);

alter policy argos_alertas_sel_supervisor on public.argos_alertas using (
  (
    public.es_admin_o_dueno((select auth.uid()))
    or (public.es_rh((select auth.uid())) and not public.es_admin_o_dueno(user_id))
    or user_id in (select s.user_id from public.mi_equipo_supervisado() s(user_id))
  )
  and tenant_id = (select public.current_tenant_id())
);

alter policy argos_clips_sel_dueno on public.argos_clips using (
  public.es_admin_o_dueno((select auth.uid()))
  or (public.es_rh((select auth.uid())) and not public.es_admin_o_dueno(user_id))
  or user_id in (select s.user_id from public.mi_equipo_supervisado() s(user_id))
);

alter policy argos_nudges_sel_dueno_hr on public.argos_nudges using (
  public.es_admin_o_dueno((select auth.uid()))
  or public.es_rh((select auth.uid()))
  or user_id in (select s.user_id from public.mi_equipo_supervisado() s(user_id))
);

alter policy argos_contexto_sel_supervisor on public.argos_contexto using (
  public.es_admin_o_dueno((select auth.uid()))
  and tenant_id = (select public.current_tenant_id())
);

-- 5) Funciones que agregan: antes solo el dueño (los demás solo se veían a sí
--    mismos); ahora cada quien ve a los que puede vigilar.
create or replace function public.argos_dia_personas(_dia date, _h_desde integer, _h_hasta integer)
returns table(user_id uuid, seg_activo bigint, seg_pausa bigint, seg_sin_pantalla bigint, seg_sin_camara bigint, seg_fuera_camara bigint, seg_sin_conexion bigint, juzgadas bigint, juzgadas_ok bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  with lim as (
    select ((_dia)::timestamp at time zone 'America/Bogota') + make_interval(hours => _h_desde) as lo,
           ((_dia)::timestamp at time zone 'America/Bogota') + make_interval(hours => _h_hasta) as hi
  ),
  vis as (select v.user_id from public.argos_vigilables() v),
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
      and (s.user_id = (select auth.uid()) or s.user_id in (select vis.user_id from vis))
    group by s.user_id
  ),
  cap as (
    select c.user_id,
      count(*) filter (where c.tipo='pantalla' and c.veredicto is not null)::bigint as juzgadas,
      count(*) filter (where c.tipo='pantalla' and c.veredicto is not null
                        and (c.fuera_de_lugar is not true or c.perdonado is true))::bigint as juzgadas_ok
    from public.monitor_capturas c, lim
    where c.created_at >= lim.lo and c.created_at < lim.hi
      and (c.user_id = (select auth.uid()) or c.user_id in (select vis.user_id from vis))
    group by c.user_id
  )
  select coalesce(seg.user_id, cap.user_id) as user_id,
    coalesce(seg.seg_activo,0), coalesce(seg.seg_pausa,0), coalesce(seg.seg_sin_pantalla,0),
    coalesce(seg.seg_sin_camara,0), coalesce(seg.seg_fuera_camara,0), coalesce(seg.seg_sin_conexion,0),
    coalesce(cap.juzgadas,0), coalesce(cap.juzgadas_ok,0)
  from seg full join cap on cap.user_id = seg.user_id
$$;

create or replace function public.argos_tendencia(_desde date, _hasta date)
returns table(dia date, pantalla integer, camara integer, atencion integer, personas integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  with cap as (
    select (c.created_at at time zone 'America/Bogota')::date as dia,
           c.user_id,
           floor(extract(epoch from c.created_at)/120)::bigint as bkt,
           c.tipo, c.veredicto, c.fuera_de_lugar, c.cara_visible
    from public.monitor_capturas c
    where c.created_at >= ((_desde)::timestamp at time zone 'America/Bogota')
      and c.created_at < ((_hasta + 1)::timestamp at time zone 'America/Bogota')
      and c.user_id in (select v.user_id from public.argos_vigilables() v)
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
$$;
