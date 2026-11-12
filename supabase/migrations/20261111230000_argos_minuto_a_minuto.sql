-- ARGOS MINUTO A MINUTO (Alvaro, 11/11/2026: «desde el clock in contabilizamos
-- cada minuto»).
--
-- El expediente abre con el turno de la persona minuto a minuto: desde la hora
-- de ENTRADA de su horario hasta la de SALIDA, cada minuto con su estado
-- (trabajando bien, sin cámara, sin pantalla, fuera de cámara, fuera de Cowork,
-- pausa dentro del tiempo o de más, no había entrado, se fue antes), y hora por
-- hora con su % y sus fallas. También la semana (lunes a domingo) y el día contra
-- el promedio de su equipo.
--
-- Esta función NO decide nada: entrega lo crudo de cada persona (los tramos del
-- reloj de Cowork, las pausas, las salidas de Cowork, los pantallazos que Argos
-- vio fuera de lugar y sus alertas de distracción) y la cuenta minuto a minuto la
-- hace frontend/src/lib/argosJornada.ts, con sus pruebas. Así hay UNA sola regla
-- y se puede probar sin base.
--
--   · Quién mira a quién: puede_vigilar_a (el dueño a todos; RR. HH. a todos
--     menos admins y dueño; el supervisor a los agentes de su equipo). Si no puede
--     mirar a la persona pedida, error (no un «vacío»).
--   · _con_equipo: suma a los compañeros del mismo equipo y nivel que quien mira
--     también puede vigilar (para «comparado con su equipo»).
--   · Rango: de la medianoche del primer día a la del día siguiente al último + 1,
--     para los turnos que cruzan la medianoche. Máximo 31 días.
--   · Los tramos de 0 segundos (un latido suelto) no se mandan: no son presencia.
--   · Pantallazo fuera de lugar: cuenta desde que se tomó hasta el siguiente
--     pantallazo juzgado (tope 5 min). Los PERDONADOS no cuentan.

set local lock_timeout = '3s';

create or replace function public.argos_jornada_cruda(
  _uid uuid,
  _desde date,
  _hasta date,
  _con_equipo boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer uuid := (select auth.uid());
  v_ini timestamptz;
  v_fin timestamptz;
  v_equipo text;
  v_nivel text;
  v_res jsonb;
begin
  if v_viewer is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  if _uid is null or _desde is null or _hasta is null or _hasta < _desde or _hasta - _desde > 31 then
    raise exception 'Rango de días inválido' using errcode = '22023';
  end if;
  if not public.puede_vigilar_a(v_viewer, _uid) then
    raise exception 'No puedes ver a esta persona' using errcode = '42501';
  end if;

  v_ini := (_desde::timestamp) at time zone 'America/Bogota';
  v_fin := ((_hasta + 2)::timestamp) at time zone 'America/Bogota';
  v_equipo := public.equipo_de(_uid);
  select coalesce(p.nivel, 'agente') into v_nivel from public.profiles p where p.id = _uid;

  with gente as (
    select p.id, p.full_name, p.avatar_url, p.avatar_seed, (p.id = _uid) as objetivo
      from public.profiles p
     where p.deleted_at is null
       and (
         p.id = _uid
         or (
           _con_equipo
           and p.id <> v_viewer
           and coalesce(p.nivel, 'agente') = v_nivel
           and public.equipo_de(p.id) = v_equipo
           and public.puede_vigilar_a(v_viewer, p.id)
         )
       )
  )
  select jsonb_build_object(
    'ahora', now(),
    'equipo', v_equipo,
    'limites', coalesce((
      select jsonb_object_agg(l.kind, l.minutos * 60)
        from public.cowork_break_limits l
       where l.tenant_id = public.current_tenant_id()
    ), '{}'::jsonb),
    'personas', coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id,
      'nombre', g.full_name,
      'avatar_url', g.avatar_url,
      'avatar_seed', g.avatar_seed,
      'objetivo', g.objetivo,
      'entrada', h.entrada,
      'salida', h.salida,
      'exento', coalesce(h.exento, false),
      'segmentos', coalesce((
        select jsonb_agg(jsonb_build_array(s.estado, s.started_at, coalesce(s.ended_at, s.last_seen_at)) order by s.started_at)
          from public.cowork_tiempo_segmentos s
         where s.user_id = g.id
           and s.started_at < v_fin
           and coalesce(s.ended_at, s.last_seen_at) > v_ini
           and coalesce(s.ended_at, s.last_seen_at) > s.started_at
      ), '[]'::jsonb),
      'pausas', coalesce((
        select jsonb_agg(jsonb_build_array(b.kind, b.started_at, b.ended_at) order by b.started_at)
          from public.cowork_breaks b
         where b.user_id = g.id
           and b.started_at < v_fin
           and coalesce(b.ended_at, now()) > v_ini
      ), '[]'::jsonb),
      'fuera', coalesce((
        select jsonb_agg(jsonb_build_array(f.desde, f.hasta) order by f.desde)
          from public.cowork_fuera f
         where f.user_id = g.id
           and f.desde < v_fin
           and coalesce(f.hasta, now()) > v_ini
      ), '[]'::jsonb),
      'flojas', coalesce((
        select jsonb_agg(jsonb_build_array(
                 x.created_at,
                 least(coalesce(x.siguiente, x.created_at + interval '5 minutes'), x.created_at + interval '5 minutes')
               ) order by x.created_at)
          from (
            select c.created_at, c.fuera_de_lugar, coalesce(c.perdonado, false) as perdonado,
                   lead(c.created_at) over (order by c.created_at) as siguiente
              from public.monitor_capturas c
             where c.user_id = g.id
               and c.tipo = 'pantalla'
               and c.veredicto is not null
               and c.created_at >= v_ini
               and c.created_at < v_fin
          ) x
         where x.fuera_de_lugar is true and not x.perdonado
      ), '[]'::jsonb),
      'alertas', coalesce((
        select jsonb_agg(jsonb_build_array(a.tipo, a.abierta_at, coalesce(a.cerrada_at, a.actualizada_at)) order by a.abierta_at)
          from public.argos_alertas a
         where a.user_id = g.id
           and a.tipo in ('distraido', 'celular', 'no_mira')
           and a.abierta_at < v_fin
           and coalesce(a.cerrada_at, now()) > v_ini
      ), '[]'::jsonb)
    ) order by g.objetivo desc, g.full_name), '[]'::jsonb)
  ) into v_res
  from gente g
  left join lateral (select * from public.horario_de(g.id)) h on true;

  return v_res;
end;
$$;

comment on function public.argos_jornada_cruda(uuid, date, date, boolean) is
  'Argos minuto a minuto: lo crudo del turno de una persona (y, si se pide, de su equipo) entre dos días de Bogotá: horario, tramos del reloj de Cowork, pausas, salidas de Cowork, pantallazos fuera de lugar no perdonados y alertas de distracción. La cuenta la hace lib/argosJornada.ts. Solo a quien puede_vigilar_a deja.';

revoke all on function public.argos_jornada_cruda(uuid, date, date, boolean) from public, anon;
grant execute on function public.argos_jornada_cruda(uuid, date, date, boolean) to authenticated, service_role;

-- ─── RR. HH. y supervisores veían 0 horas en el expediente ──────────────────
-- cowork_tiempo_diario solo le respondía a la persona y a los admins de su
-- agencia: RR. HH. y el supervisor abrían el expediente y salían 0 horas y una
-- nota falsa. Ahora también responde por quien puede_vigilar_a deja mirar (la
-- misma regla de Argos). El conjunto se arma UNA vez (subconsulta sin correlación),
-- no fila por fila. El resto es el cuerpo de 20261109150000_cowork_salida_en_sala
-- tal cual (que ya trae «sigue en sala → sin última salida»).
CREATE OR REPLACE FUNCTION public.cowork_tiempo_diario(_desde date DEFAULT NULL::date, _hasta date DEFAULT NULL::date, _user_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 100, _offset integer DEFAULT 0)
 RETURNS TABLE(dia date, user_id uuid, nombre text, seg_activo integer, seg_meet integer, seg_pausa integer, seg_sin_camara integer, seg_sin_pantalla integer, seg_fuera_de_camara integer, seg_en_sala integer, horas_activas numeric, sesiones integer, primer_ingreso timestamp with time zone, ultima_salida timestamp with time zone, seg_sin_conexion integer, seg_sin_conexion_larga integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with tramos as (
    select
      s.user_id,
      s.session_id,
      s.estado,
      greatest(s.started_at, d.dia_ini) as ini,
      least(coalesce(s.ended_at, s.last_seen_at), d.dia_fin) as fin,
      -- ¿Sigue EN SALA ahora? Sesión sin cerrar con latido fresco (< 5 min).
      (s.ended_at is null and s.last_seen_at > now() - interval '5 minutes') as abierto,
      d.dia
    from public.cowork_tiempo_segmentos s
    cross join lateral (
      select g::date as dia,
             ((g::date)::timestamp at time zone 'America/Bogota') as dia_ini,
             ((g::date + 1)::timestamp at time zone 'America/Bogota') as dia_fin
      from generate_series(
        ((s.started_at at time zone 'America/Bogota')::date)::timestamp,
        ((coalesce(s.ended_at, s.last_seen_at) at time zone 'America/Bogota')::date)::timestamp,
        interval '1 day'
      ) g
    ) d
    where (_desde is null or (coalesce(s.ended_at, s.last_seen_at) at time zone 'America/Bogota')::date >= _desde)
      and (_hasta is null or (s.started_at at time zone 'America/Bogota')::date <= _hasta)
      and (_user_id is null or s.user_id = _user_id)
      and ((select auth.uid()) is null or s.user_id = (select auth.uid())
           or (public.has_role((select auth.uid()), 'admin')
               and s.session_id in (select public.cowork_sesiones_de_mi_agencia()))
           or s.user_id in (select p.id from public.profiles p
                             where public.puede_vigilar_a((select auth.uid()), p.id)))
  ),
  sumas as (
    select
      t.dia, t.user_id,
      sum(case when t.estado in ('activo','meet','sin_conexion') then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_activo,
      sum(case when t.estado = 'meet' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_meet,
      sum(case when t.estado = 'pausa' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_pausa,
      sum(case when t.estado = 'sin_camara' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_sin_camara,
      sum(case when t.estado = 'sin_pantalla' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_sin_pantalla,
      sum(case when t.estado = 'fuera_de_camara' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_fuera_de_camara,
      sum(case when t.estado = 'sin_conexion' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_sin_conexion,
      sum(case when t.estado = 'sin_conexion_larga' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_sin_conexion_larga,
      sum(extract(epoch from (t.fin - t.ini)))::int as seg_en_sala,
      count(distinct t.session_id)::int as sesiones,
      min(t.ini) as primer_ingreso,
      -- Si sigue en sala ahora, no hay salida: NULL (aún no sale).
      case when bool_or(t.abierto) then null else max(t.fin) end as ultima_salida
    from tramos t
    where t.fin > t.ini
      and (_desde is null or t.dia >= _desde)
      and (_hasta is null or t.dia <= _hasta)
    group by t.dia, t.user_id
  )
  select
    su.dia, su.user_id, p.full_name as nombre,
    su.seg_activo, su.seg_meet, su.seg_pausa, su.seg_sin_camara, su.seg_sin_pantalla, su.seg_fuera_de_camara, su.seg_en_sala,
    round(su.seg_activo / 3600.0, 2) as horas_activas,
    su.sesiones, su.primer_ingreso, su.ultima_salida,
    su.seg_sin_conexion, su.seg_sin_conexion_larga
  from sumas su
  left join public.profiles p on p.id = su.user_id
  order by su.dia desc, p.full_name
  limit least(greatest(_limit, 1), 500)
  offset greatest(_offset, 0)
$function$;
