-- Reportes del meet grupal (Jhon, 10/09/2026: "sí" a que quede como categoría
-- aparte). El meet ya quedaba registrado (#1814); esto es para VERLO después:
--   · cowork_meets_resumen: para el diálogo de Pausas y meets del tablero.
--   · cowork_tiempo_diario gana seg_meet (los segundos en meet, que ya venían
--     SUMADOS dentro de seg_activo y ahí siguen: "6 h trabajadas, de las cuales
--     45 min en meet"). equipo_tiempo_cowork lo arrastra.
--   · api_cowork_meets: /cowork/meets en la API pública.

-- ── Resumen para el tablero: una fila por persona y meet ───────────────────
create or replace function public.cowork_meets_resumen(
  _desde date default null,
  _hasta date default null,
  _session_id uuid default null,
  _user_id uuid default null,
  _limit int default 2000,
  _offset int default 0
)
returns table (
  meet_id uuid,
  session_id uuid,
  session_name text,
  created_by uuid,
  creador text,
  meet_started_at timestamptz,
  meet_ended_at timestamptz,
  meet_seconds int,
  user_id uuid,
  nombre text,
  room_id uuid,
  room_name text,
  joined_at timestamptz,
  left_at timestamptz,
  is_open boolean,
  seconds int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id as meet_id,
    m.session_id, cs.name as session_name,
    m.created_by, pc.full_name as creador,
    m.started_at as meet_started_at, m.ended_at as meet_ended_at,
    greatest(0, extract(epoch from (coalesce(m.ended_at, now()) - m.started_at)))::int as meet_seconds,
    p.user_id, pr.full_name as nombre,
    p.room_id, cr.name as room_name,
    p.joined_at, p.left_at, (p.left_at is null) as is_open,
    coalesce(p.duration_seconds, greatest(0, extract(epoch from (now() - p.joined_at)))::int) as seconds
  from public.cowork_meet_participants p
  join public.cowork_meets m on m.id = p.meet_id
  left join public.cowork_sessions cs on cs.id = m.session_id
  left join public.cowork_rooms cr on cr.id = p.room_id
  left join public.profiles pr on pr.id = p.user_id
  left join public.profiles pc on pc.id = m.created_by
  where (_desde is null or (p.joined_at at time zone 'America/Bogota')::date >= _desde)
    and (_hasta is null or (p.joined_at at time zone 'America/Bogota')::date <= _hasta)
    and (_session_id is null or p.session_id = _session_id)
    and (_user_id is null or p.user_id = _user_id)
    -- Sin sesión (service_role) pasa todo. Con sesión: lo propio, lo de las
    -- sesiones que uno hostea, o todo si es supervisor o superior.
    and (
      auth.uid() is null
      or p.user_id = auth.uid()
      or public.is_cowork_host(auth.uid(), p.session_id)
      or public.is_in_role_group(auth.uid(), 'supervisor_or_above')
    )
  order by m.started_at desc, pr.full_name
  limit least(greatest(_limit, 1), 5000)
  offset greatest(_offset, 0)
$$;
comment on function public.cowork_meets_resumen(date, date, uuid, uuid, int, int) is
  'Meets grupales de Cowork: una fila por persona y meet (quién lo invocó, de qué sala vino, cuánto estuvo). Incluye los abiertos con el tiempo hasta ahora.';
revoke all on function public.cowork_meets_resumen(date, date, uuid, uuid, int, int) from public, anon;
grant execute on function public.cowork_meets_resumen(date, date, uuid, uuid, int, int) to authenticated, service_role;

-- ── API pública: cada participación en un meet, plana y en inglés ──────────
create or replace function public.api_cowork_meets(
  _from date default null,
  _to date default null,
  _profile_id uuid default null,
  _limit int default 100,
  _offset int default 0
)
returns table (
  meet_id uuid,
  session_id uuid,
  session_name text,
  invoked_by uuid,
  invoked_by_name text,
  meet_started_at timestamptz,
  meet_ended_at timestamptz,
  meet_end_reason text,
  profile_id uuid,
  employee text,
  room_id uuid,
  room_name text,
  joined_at timestamptz,
  left_at timestamptz,
  is_open boolean,
  seconds int,
  left_reason text
)
language sql stable security definer set search_path = public
as $$
  select
    m.id as meet_id, m.session_id, cs.name as session_name,
    m.created_by as invoked_by, pc.full_name as invoked_by_name,
    m.started_at as meet_started_at, m.ended_at as meet_ended_at, m.end_reason as meet_end_reason,
    p.user_id as profile_id, pr.full_name as employee,
    p.room_id, cr.name as room_name,
    p.joined_at, p.left_at, (p.left_at is null) as is_open,
    coalesce(p.duration_seconds, greatest(0, extract(epoch from (now() - p.joined_at)))::int) as seconds,
    case p.left_reason when 'volvio' then 'returned' when 'meet_terminado' then 'meet_ended' when 'barrido' then 'swept' else p.left_reason end as left_reason
  from public.cowork_meet_participants p
  join public.cowork_meets m on m.id = p.meet_id
  left join public.cowork_sessions cs on cs.id = m.session_id
  left join public.cowork_rooms cr on cr.id = p.room_id
  left join public.profiles pr on pr.id = p.user_id
  left join public.profiles pc on pc.id = m.created_by
  where (_from is null or (p.joined_at at time zone 'America/Bogota')::date >= _from)
    and (_to is null or (p.joined_at at time zone 'America/Bogota')::date <= _to)
    and (_profile_id is null or p.user_id = _profile_id)
  order by m.started_at desc, pr.full_name
  limit least(greatest(_limit, 1), 500)
  offset greatest(_offset, 0)
$$;
comment on function public.api_cowork_meets(date, date, uuid, int, int) is
  'API pública: cada persona en cada meet grupal de Cowork (quién lo invocó, de qué sala vino, cuánto estuvo). Ese tiempo cuenta como trabajado y ya está dentro de active_seconds en /cowork/time; acá se ve aparte.';
revoke all on function public.api_cowork_meets(date, date, uuid, int, int) from public, anon, authenticated;
grant execute on function public.api_cowork_meets(date, date, uuid, int, int) to service_role;

-- ── seg_meet en el tiempo diario (la firma cambia: hay que soltar y recrear) ─
drop function if exists public.equipo_tiempo_cowork(date, date);
drop function if exists public.cowork_tiempo_diario(date, date, uuid, int, int);

create or replace function public.cowork_tiempo_diario(
  _desde date default null,
  _hasta date default null,
  _user_id uuid default null,
  _limit int default 100,
  _offset int default 0
)
returns table (
  dia date,
  user_id uuid,
  nombre text,
  seg_activo int,
  seg_meet int,
  seg_pausa int,
  seg_sin_camara int,
  seg_sin_pantalla int,
  seg_fuera_de_camara int,
  seg_en_sala int,
  horas_activas numeric,
  sesiones int,
  primer_ingreso timestamptz,
  ultima_salida timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
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
      sum(case when t.estado in ('activo','meet') then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_activo,
      sum(case when t.estado = 'meet' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_meet,
      sum(case when t.estado = 'pausa' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_pausa,
      sum(case when t.estado = 'sin_camara' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_sin_camara,
      sum(case when t.estado = 'sin_pantalla' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_sin_pantalla,
      sum(case when t.estado = 'fuera_de_camara' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_fuera_de_camara,
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
    su.sesiones, su.primer_ingreso, su.ultima_salida
  from sumas su
  left join public.profiles p on p.id = su.user_id
  order by su.dia desc, p.full_name
  limit least(greatest(_limit, 1), 500)
  offset greatest(_offset, 0)
$$;

revoke all on function public.cowork_tiempo_diario(date, date, uuid, int, int) from public, anon;
grant execute on function public.cowork_tiempo_diario(date, date, uuid, int, int) to authenticated, service_role;

create or replace function public.equipo_tiempo_cowork(_desde date, _hasta date)
returns table (
  user_id uuid,
  seg_activo bigint,
  seg_meet bigint,
  seg_en_sala bigint,
  dias_con_reloj integer
)
language sql
stable
security definer
set search_path = public
as $$
  select c.user_id,
         sum(c.seg_activo)::bigint as seg_activo,
         sum(c.seg_meet)::bigint as seg_meet,
         sum(c.seg_en_sala)::bigint as seg_en_sala,
         count(*) filter (where c.seg_activo > 0)::integer as dias_con_reloj
  from public.cowork_tiempo_diario(_desde, _hasta, null, 500, 0) c
  where public.is_in_role_group(auth.uid(), 'supervisor_or_above') or c.user_id = auth.uid()
  group by c.user_id
$$;
revoke all on function public.equipo_tiempo_cowork(date, date) from public, anon;
grant execute on function public.equipo_tiempo_cowork(date, date) to authenticated;
