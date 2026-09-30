-- EL RELOJ DE COWORK DISTINGUE UNA CAÍDA DE LA SALA DE UNA CÁMARA APAGADA.
--
-- Hasta hoy, cuando se caía la sala de LiveKit la lista de participantes se
-- vaciaba, la cámara de todo el mundo se veía apagada y el reloj anotaba
-- 'sin_camara': se le cobraba la caída a quien estaba trabajando. Medido en
-- prod: ~30 h desde el 07/09 con la firma de una caída (varias personas cayendo
-- a 'sin_camara' en el mismo minuto).
--
-- Decisión de Jhon (29/09/2026): la caída tiene estado propio y se pagan hasta
-- 10 minutos de caídas por hora. Lo que pasa de eso es 'sin_conexion_larga', que
-- no se paga y queda a la vista del supervisor. Lo decide la edge con los tramos
-- guardados (supabase/functions/_shared/cowork-tiempo.ts, caidaSePaga).
--
-- ⚠️ VUELTA ATRÁS: una vez que haya filas 'sin_conexion' o 'sin_conexion_larga',
-- la restricción vieja no se puede volver a poner sin antes convertir esas filas
-- (ADD CONSTRAINT valida las existentes).
--
-- ⚠️ ORDEN DE DESPLIEGUE: esta migración va ANTES de la edge. Si la edge
-- escribiera 'sin_conexion' con la restricción vieja, el INSERT fallaría DESPUÉS
-- de haber cerrado el tramo abierto, y la persona quedaría sin tramo.
-- Es compatible con el código que corre hoy: agrega estados que nadie escribe
-- todavía y columnas al FINAL de lo que devuelven las funciones.

set lock_timeout = '3s';

-- 1. La restricción admite los dos estados nuevos.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.cowork_tiempo_segmentos'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%estado%'
  loop
    execute format('alter table public.cowork_tiempo_segmentos drop constraint %I', c);
  end loop;
end $$;
alter table public.cowork_tiempo_segmentos
  add constraint cowork_tiempo_segmentos_estado_check
  check (estado in ('activo','pausa','sin_camara','sin_pantalla','fuera_de_camara','meet',
                    'sin_conexion','sin_conexion_larga'));

-- 2. cowork_tiempo_diario: 'sin_conexion' se PAGA (entra en seg_activo, que es
--    lo que da horas_activas), y las dos variantes se ven aparte.
--    Es una función RETURNS TABLE: agregar columnas cambia el tipo de retorno y
--    CREATE OR REPLACE no lo permite. Va DROP + CREATE, y el DROP se lleva los
--    permisos: se vuelven a dar abajo, idénticos a los de prod.
--    Las columnas nuevas van al FINAL: todos los consumidores leen por nombre.
drop function if exists public.cowork_tiempo_diario(date, date, uuid, integer, integer);
create function public.cowork_tiempo_diario(
  _desde date default null, _hasta date default null, _user_id uuid default null,
  _limit integer default 100, _offset integer default 0)
returns table(dia date, user_id uuid, nombre text, seg_activo integer, seg_meet integer, seg_pausa integer,
              seg_sin_camara integer, seg_sin_pantalla integer, seg_fuera_de_camara integer, seg_en_sala integer,
              horas_activas numeric, sesiones integer, primer_ingreso timestamp with time zone,
              ultima_salida timestamp with time zone,
              seg_sin_conexion integer, seg_sin_conexion_larga integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  with tramos as (
    select
      s.user_id,
      s.session_id,
      s.estado,
      -- Recorte del segmento a cada día de Bogotá que toca.
      greatest(s.started_at, d.dia_ini) as ini,
      least(coalesce(s.ended_at, s.last_seen_at), d.dia_fin) as fin,
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
      -- Con sesión de usuario, cada uno ve lo suyo salvo admin. Sin sesión
      -- (service_role desde la API pública) pasa todo.
      and (auth.uid() is null or s.user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  ),
  sumas as (
    select
      t.dia, t.user_id,
      -- Lo que se PAGA. Es la misma lista que cuentaComoTrabajo() en la edge y
      -- en el frontend: si cambia una, cambian todas.
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
      max(t.fin) as ultima_salida
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
revoke all on function public.cowork_tiempo_diario(date, date, uuid, integer, integer) from public, anon;
grant execute on function public.cowork_tiempo_diario(date, date, uuid, integer, integer) to authenticated, service_role;

-- 3. admin_cowork_vs_hubstaff: separa la caída de la cámara apagada. Sin esto,
--    "Reloj detenido" (en sala − activo) la incluye y ningún chip la explica.
drop function if exists public.admin_cowork_vs_hubstaff(date, date);
create function public.admin_cowork_vs_hubstaff(_desde date, _hasta date)
returns table(dia date, profile_id uuid, nombre text, hubstaff_seg integer, hubstaff_actividad integer,
              cowork_activo_seg integer, cowork_pausa_seg integer, cowork_sin_camara_seg integer,
              cowork_sin_pantalla_seg integer, cowork_fuera_seg integer, cowork_en_sala_seg integer,
              cowork_sesiones integer,
              cowork_sin_conexion_seg integer, cowork_sin_conexion_larga_seg integer)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Solo admins' using errcode = '42501';
  end if;
  if _hasta < _desde or _hasta - _desde > 92 then
    raise exception 'Rango inválido (máximo 92 días)';
  end if;

  return query
  with hub as (
    select (a.starts_at at time zone 'America/Bogota')::date as dia,
           hm.profile_id,
           sum(a.tracked_seconds)::int as seg,
           round(sum(a.overall_activity * a.tracked_seconds) filter (where a.overall_activity is not null)
                 / nullif(sum(a.tracked_seconds) filter (where a.overall_activity is not null), 0))::int as actividad
    from public.hubstaff_activities a
    join public.hubstaff_members hm on hm.id = a.member_id
    where (a.starts_at at time zone 'America/Bogota')::date between _desde and _hasta
    group by 1, 2
    having sum(a.tracked_seconds) > 0
  ),
  cw as (
    select c.dia, c.user_id as profile_id,
           c.seg_activo, c.seg_pausa, c.seg_sin_camara, c.seg_sin_pantalla, c.seg_fuera_de_camara, c.seg_en_sala, c.sesiones,
           c.seg_sin_conexion, c.seg_sin_conexion_larga
    from public.cowork_tiempo_diario(_desde, _hasta, null, 500, 0) c
  )
  select coalesce(h.dia, c.dia) as dia,
         coalesce(h.profile_id, c.profile_id) as profile_id,
         p.full_name as nombre,
         coalesce(h.seg, 0), h.actividad,
         coalesce(c.seg_activo, 0), coalesce(c.seg_pausa, 0), coalesce(c.seg_sin_camara, 0),
         coalesce(c.seg_sin_pantalla, 0), coalesce(c.seg_fuera_de_camara, 0), coalesce(c.seg_en_sala, 0),
         coalesce(c.sesiones, 0),
         coalesce(c.seg_sin_conexion, 0), coalesce(c.seg_sin_conexion_larga, 0)
  from hub h
  full outer join cw c on c.dia = h.dia and c.profile_id = h.profile_id
  left join public.profiles p on p.id = coalesce(h.profile_id, c.profile_id)
  order by 1 desc, 3;
end;
$function$;
revoke all on function public.admin_cowork_vs_hubstaff(date, date) from public, anon;
grant execute on function public.admin_cowork_vs_hubstaff(date, date) to authenticated, service_role;

-- 4. La API pública en inglés: sin esto, el `else s.estado` dejaría salir
--    'sin_conexion' en español. Misma firma: alcanza con OR REPLACE (conserva
--    los permisos: solo service_role).
create or replace function public.api_cowork_time_segments(
  _from date default null, _to date default null, _profile_id uuid default null,
  _limit integer default 100, _offset integer default 0)
returns table(id uuid, profile_id uuid, employee text, session_id uuid, session_name text, room_id uuid,
              room_name text, state text, detail text, started_at timestamp with time zone,
              ended_at timestamp with time zone, is_open boolean, seconds integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  select s.id, s.user_id as profile_id, p.full_name as employee,
         s.session_id, cs.name as session_name,
         s.room_id, cr.name as room_name,
         case s.estado
           when 'activo' then 'active' when 'pausa' then 'paused' when 'sin_camara' then 'no_camera'
           when 'sin_pantalla' then 'no_screen' when 'fuera_de_camara' then 'away' when 'meet' then 'group_meet'
           when 'sin_conexion' then 'disconnected' when 'sin_conexion_larga' then 'disconnected_long'
           else s.estado end as state,
         s.detalle as detail,
         s.started_at, s.ended_at, (s.ended_at is null) as is_open, s.seconds
  from public.cowork_tiempo_segmentos s
  left join public.profiles p on p.id = s.user_id
  left join public.cowork_sessions cs on cs.id = s.session_id
  left join public.cowork_rooms cr on cr.id = s.room_id
  where (_from is null or (coalesce(s.ended_at, s.last_seen_at) at time zone 'America/Bogota')::date >= _from)
    and (_to is null or (s.started_at at time zone 'America/Bogota')::date <= _to)
    and (_profile_id is null or s.user_id = _profile_id)
  order by s.started_at desc
  limit least(greatest(_limit, 1), 500)
  offset greatest(_offset, 0)
$function$;

-- 5. El reloj de respaldo del tablero del supervisor suma lo mismo que el de la
--    persona. Es la cuarta copia SQL de "qué se paga". Misma firma: OR REPLACE.
--    Y el último estado se mira EN ESTA SESIÓN: con la caída, el tablero muestra
--    a quien se cayó aunque LiveKit no lo vea, y sin el filtro una asignación
--    vieja en esta sesión aparecía "sin conexión" por latir en OTRA.
create or replace function public.cowork_reloj_de_sala(_session_id uuid)
returns table(user_id uuid, seg_activo_hoy integer, ultimo_estado text, ultimo_latido timestamp with time zone)
language sql
stable security definer
set search_path to 'public'
as $function$
  with dia as (
    select ((now() at time zone 'America/Bogota')::date)::timestamp at time zone 'America/Bogota' as ini
  ),
  gente as (
    select distinct a.user_id
    from public.cowork_room_assignments a
    where a.session_id = _session_id and a.is_active
  ),
  activo as (
    select s.user_id,
           sum(extract(epoch from (
             least(coalesce(s.ended_at, s.last_seen_at), now()) - greatest(s.started_at, d.ini)
           )))::int as seg
    from public.cowork_tiempo_segmentos s
    cross join dia d
    join gente g on g.user_id = s.user_id
    where s.estado in ('activo','meet','sin_conexion')
      and coalesce(s.ended_at, s.last_seen_at) > d.ini
    group by s.user_id
  ),
  ultimo as (
    select distinct on (s.user_id) s.user_id, s.estado, s.last_seen_at
    from public.cowork_tiempo_segmentos s
    join gente g on g.user_id = s.user_id
    where s.session_id = _session_id
    order by s.user_id, s.last_seen_at desc
  )
  select g.user_id,
         coalesce(a.seg, 0) as seg_activo_hoy,
         u.estado as ultimo_estado,
         u.last_seen_at as ultimo_latido
  from gente g
  left join activo a on a.user_id = g.user_id
  left join ultimo u on u.user_id = g.user_id
  where public.is_cowork_host(auth.uid(), _session_id)
$function$;
