-- Meet grupal (Jhon, 10/09/2026): el supervisor se lleva a la gente de una o
-- varias salas de la sesión a una sala temporal de LiveKit. En su sala Cowork
-- quedan con cámara, micro y pantalla apagados hasta volver; en la miniatura
-- se ven "En meet grupal" con el tiempo corriendo. Ese tiempo SUMA al reloj de
-- Cowork (a diferencia de Baño y Break, que lo paran) y se reporta aparte, así
-- que queda registro por persona: desde qué sala vino, cuándo entró y salió.
-- Solo lo invoca un host; el chatter no puede ponerse en meet por su cuenta.

create table if not exists public.cowork_meets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cowork_sessions(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  livekit_room_name text not null unique,
  title text not null default 'Meet grupal',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- supervisor_salio: el que lo invocó colgó (el meet se cierra con él);
  -- terminado: lo cerró a mano otro host; barrido: quedó colgado y lo cerró la limpieza.
  end_reason text check (end_reason in ('supervisor_salio','terminado','barrido'))
);
create index if not exists cowork_meets_abiertos_idx on public.cowork_meets (session_id) where ended_at is null;

create table if not exists public.cowork_meet_participants (
  id uuid primary key default gen_random_uuid(),
  meet_id uuid not null references public.cowork_meets(id) on delete cascade,
  session_id uuid not null references public.cowork_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- La sala de donde vino, para el botón "Volver a mi sala" y para el reporte.
  room_id uuid references public.cowork_rooms(id) on delete set null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  -- volvio: tocó "Volver a mi sala"; meet_terminado: el meet se cerró (el
  -- supervisor se fue); barrido: limpieza.
  left_reason text check (left_reason in ('volvio','meet_terminado','barrido')),
  duration_seconds integer generated always as (
    case when left_at is null then null else greatest(0, extract(epoch from (left_at - joined_at)))::integer end
  ) stored
);
create index if not exists cowork_meet_participants_abiertos_idx on public.cowork_meet_participants (user_id) where left_at is null;
create index if not exists cowork_meet_participants_meet_idx on public.cowork_meet_participants (meet_id);
create index if not exists cowork_meet_participants_session_idx on public.cowork_meet_participants (session_id);

alter table public.cowork_meets enable row level security;
alter table public.cowork_meet_participants enable row level security;

-- Leen los miembros de la sesión: el chatter necesita ver su propia fila para
-- ser llevado (le llega por Realtime) y el tablero ve todas. Escriben solo las
-- edge functions con service_role: crear, terminar y salir pasan por ahí.
drop policy if exists "cowork_meets: miembros de la sesión leen" on public.cowork_meets;
create policy "cowork_meets: miembros de la sesión leen" on public.cowork_meets
  for select to authenticated
  using (exists (
    select 1 from public.cowork_memberships m
    where m.session_id = cowork_meets.session_id and m.user_id = (select auth.uid())
  ));
drop policy if exists "cowork_meet_participants: miembros de la sesión leen" on public.cowork_meet_participants;
create policy "cowork_meet_participants: miembros de la sesión leen" on public.cowork_meet_participants
  for select to authenticated
  using (exists (
    select 1 from public.cowork_memberships m
    where m.session_id = cowork_meet_participants.session_id and m.user_id = (select auth.uid())
  ));
grant select on public.cowork_meets, public.cowork_meet_participants to authenticated;

-- Realtime: el chatter se entera de que lo llevaron (y de que el meet terminó)
-- por postgres_changes, igual que las solicitudes de supervisor.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cowork_meets') then
    alter publication supabase_realtime add table public.cowork_meets;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cowork_meet_participants') then
    alter publication supabase_realtime add table public.cowork_meet_participants;
  end if;
end $$;

-- ── El reloj: un segmento 'meet' CUENTA como trabajo ──────────────────────
-- El latido marca 'meet' mientras la persona tenga una participación abierta
-- (lo mira en la base, como la pausa). Sin este estado el reloj se detendría
-- por "sin pantalla" en cuanto entrara al meet.
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.cowork_tiempo_segmentos'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%estado%';
  if c is not null then
    execute format('alter table public.cowork_tiempo_segmentos drop constraint %I', c);
  end if;
end $$;
alter table public.cowork_tiempo_segmentos
  add constraint cowork_tiempo_segmentos_estado_check
  check (estado in ('activo','pausa','sin_camara','sin_pantalla','fuera_de_camara','meet'));

-- Las tres funciones que suman tiempo trabajado aprenden 'meet'. Se recrean
-- enteras (misma firma) para no dejar dos versiones de la misma regla.
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
      sum(case when t.estado in ('activo','meet') then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_activo,
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
           when 'sin_pantalla' then 'no_screen' when 'fuera_de_camara' then 'away' when 'meet' then 'group_meet' else s.estado end as state,
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

create or replace function public.cowork_reloj_de_sala(_session_id uuid)
returns table (
  user_id uuid,
  seg_activo_hoy int,
  ultimo_estado text,
  ultimo_latido timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
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
    where s.estado in ('activo','meet')
      and coalesce(s.ended_at, s.last_seen_at) > d.ini
    group by s.user_id
  ),
  ultimo as (
    select distinct on (s.user_id) s.user_id, s.estado, s.last_seen_at
    from public.cowork_tiempo_segmentos s
    join gente g on g.user_id = s.user_id
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
$$;

