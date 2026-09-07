-- Tiempo trabajado en Cowork (fase 1: medir sin mostrar).
--
-- Preparando el reemplazo de Hubstaff (decisión de Jhon, 07/09/2026). El
-- cliente de cada participante late cada 30 s con su estado (cámara, pantalla,
-- detector de cara, pausa) a la edge cowork-session, que decide si el reloj
-- CORRE o está DETENIDO y lo guarda como SEGMENTOS: una fila por tramo
-- continuo en el mismo estado. Sumar `seconds` de los segmentos `activo` de un
-- día es el tiempo trabajado de esa persona.
--
-- Por qué segmentos y no un contador: se puede auditar (a qué hora se detuvo y
-- por qué), se puede re-agregar con otras reglas después, y el cliente no
-- puede inflarlo — la verdad la escribe el servidor con cada latido.

create table if not exists public.cowork_tiempo_segmentos (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.cowork_sessions(id) on delete cascade,
  room_id       uuid references public.cowork_rooms(id) on delete set null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- activo = el reloj corre. Los demás son POR QUÉ está detenido.
  estado        text not null check (estado in ('activo','pausa','sin_camara','sin_pantalla','fuera_de_camara')),
  -- Sub-dato del detector cuando aplica (p. ej. 'no_face').
  detalle       text,
  started_at    timestamptz not null default now(),
  -- Último latido que confirmó este estado. Si la persona se desconecta sin
  -- avisar, el segmento vale hasta acá y no hasta que alguien lo cierre.
  last_seen_at  timestamptz not null default now(),
  -- null = segmento abierto (es el estado actual de la persona).
  ended_at      timestamptz,
  seconds       integer generated always as (
    greatest(0, extract(epoch from (coalesce(ended_at, last_seen_at) - started_at))::integer)
  ) stored
);

comment on table public.cowork_tiempo_segmentos is
  'Tramos continuos del reloj de Cowork por persona: activo (cuenta) o detenido con su motivo. Lo escribe la edge cowork-session con cada latido. Fase 1 del reemplazo de Hubstaff.';

-- Una sola fila abierta por persona: el estado actual.
create unique index if not exists cowork_tiempo_un_abierto_por_persona
  on public.cowork_tiempo_segmentos (user_id) where ended_at is null;
create index if not exists cowork_tiempo_por_persona_fecha
  on public.cowork_tiempo_segmentos (user_id, started_at desc);
create index if not exists cowork_tiempo_por_sesion
  on public.cowork_tiempo_segmentos (session_id);

alter table public.cowork_tiempo_segmentos enable row level security;

-- Cada uno ve lo suyo; los admins todo. Nadie escribe desde el cliente: solo
-- la edge con service_role.
drop policy if exists "tiempo: cada uno lo suyo" on public.cowork_tiempo_segmentos;
create policy "tiempo: cada uno lo suyo" on public.cowork_tiempo_segmentos
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- ── Agregado diario ──────────────────────────────────────────────────────────
-- Un segmento puede cruzar la medianoche (Bogotá): se reparte entre los días
-- que toca. Devuelve segundos por estado, por persona y día.
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
      sum(case when t.estado = 'activo' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_activo,
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
    su.seg_activo, su.seg_pausa, su.seg_sin_camara, su.seg_sin_pantalla, su.seg_fuera_de_camara, su.seg_en_sala,
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

-- ── Segmentos al detalle para la API pública ────────────────────────────────
create or replace function public.api_cowork_time_segments(
  _from date default null,
  _to date default null,
  _profile_id uuid default null,
  _limit int default 100,
  _offset int default 0
)
returns table (
  id uuid,
  profile_id uuid,
  employee text,
  session_id uuid,
  session_name text,
  room_id uuid,
  room_name text,
  state text,
  detail text,
  started_at timestamptz,
  ended_at timestamptz,
  is_open boolean,
  seconds int
)
language sql stable security definer set search_path = public
as $$
  select s.id, s.user_id as profile_id, p.full_name as employee,
         s.session_id, cs.name as session_name,
         s.room_id, cr.name as room_name,
         case s.estado
           when 'activo' then 'active' when 'pausa' then 'paused' when 'sin_camara' then 'no_camera'
           when 'sin_pantalla' then 'no_screen' when 'fuera_de_camara' then 'away' else s.estado end as state,
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
$$;
revoke all on function public.api_cowork_time_segments(date, date, uuid, int, int) from public, anon, authenticated;
grant execute on function public.api_cowork_time_segments(date, date, uuid, int, int) to service_role;
