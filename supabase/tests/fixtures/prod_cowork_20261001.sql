-- ════════════════════════════════════════════════════════════════════════════
-- Volcado del catálogo de PROD (proyecto lsagslbkliprespbyhts) del 01/10/2026,
-- SIN DATOS: Cowork, para probar Cowork por agencia
-- (supabase/tests/cowork_por_agencia.ts). Se carga DESPUÉS de
-- fixtures/prod_roles_20261001.sql (roles, auth, tenants, profiles).
-- Sacado con pg_get_functiondef, pg_get_constraintdef, pg_get_indexdef,
-- pg_get_triggerdef y pg_policies.
--
-- Las 13 tablas cowork_* tienen las columnas, defaults, columnas generadas,
-- restricciones, índices, políticas y triggers de prod. Las funciones son copia
-- textual; el banco recalcula md5(prosrc) de cada una y lo compara con estas
-- huellas: si alguna no coincide, falla. Si prod cambia, se vuelve a sacar.
--
-- Huellas de prod, md5(prosrc):
--   api_cowork_breaks(_from date, _to date, _profile_id uuid, _limit integer, _offset integer)=f16bda24c3ad1912266d611461dca48c
--   can_moderate_livekit_room(_user_id uuid, _room text)=a49b650f2af4f4d9461225d0877b9d78
--   cowork_bano_consumido_hoy(_user_ids uuid[])=cc0d6f61ddf41990eb8d2534c8da9b9c
--   cowork_llamados_no_encoger()=9e53a7fcd571f4c6daa83242016cef36
--   cowork_meets_resumen(_desde date, _hasta date, _session_id uuid, _user_id uuid, _limit integer, _offset integer)=26208993ce9c6344dde38e94751e589a
--   cowork_mis_sesiones_activas()=90a90854b67ea7f4762875c273a4297f
--   cowork_mis_sesiones_finalizadas(_dias integer)=dfa7a92fa68628fddda635ad6623502e
--   cowork_pausas_abiertas(_session_id uuid)=cb89dc285c025540629f9222735f486f
--   cowork_pausas_resumen(_desde date, _hasta date, _session_id uuid, _user_id uuid, _limit integer, _offset integer)=27d07e8e641b1d903f99a09d9777343c
--   cowork_puede_supervisar(_user_id uuid, _session_id uuid)=1a59999382558887c183dd08f01b4567
--   cowork_reloj_de_sala(_session_id uuid)=67301d7529280d8bf2ec7a156851ab1a
--   cowork_sesiones_activas_admin()=32207619ccacee51f04151da3ef1fc10
--   cowork_tiempo_diario(_desde date, _hasta date, _user_id uuid, _limit integer, _offset integer)=f026e22c0b3d440653876bece1b60ad3
--   equipo_tiempo_cowork(_desde date, _hasta date)=352b24832db035f9bf48a65633a5fb10
--   gen_cowork_join_code()=a61b6c0c7c7e095b05473db594bb4be8
--   get_cowork_user_room(_user_id uuid, _session_id uuid)=8c6ecf0b94092b4c5dc5a86cba8c9e63
--   is_cowork_host(_user_id uuid, _session_id uuid)=7ce152f1b5d1bc6a62eb25e45f31a10c
--   is_cowork_member(_user_id uuid, _session_id uuid)=b96ab03821d4d708f829af522e9989aa
--   push_cowork_llamado()=178854ec5a1287b1829b1fe8a6e80626
--   push_cowork_pedido_host()=264a04693922d0ddd44cad216f9e1d77
--   tg_cowork_rooms_set_join_code()=37e861d7b20ce1e53a6ff0bc4eefa9a1
--
-- Además de prod: la política de SELECT de profiles tal como está en prod
-- (USING (true); la necesita 20261001212000_personas_por_agencia para cargar).
--
-- Stubs (NO son de prod): gen_random_bytes (en prod es de pgcrypto, en el
-- esquema extensions), push_notify_enqueue (anota el aviso en
-- public._avisos_push), y meet_rooms / meet_room_cohosts / calls con solo las
-- columnas que lee can_moderate_livekit_room.
-- ════════════════════════════════════════════════════════════════════════════

set check_function_bodies = off;

-- ─── Stubs ───────────────────────────────────────────────────────────────────
create function public.gen_random_bytes(n integer) returns bytea language sql volatile as
$f$ select decode(substr(md5(random()::text) || md5(random()::text), 1, n * 2), 'hex') $f$;

create table public._avisos_push (id bigserial primary key, tipo text, destinatarios uuid[], datos jsonb, titulo text, cuerpo text, url text, etiqueta text, prioridad text);
create function public.push_notify_enqueue(_tipo text, _destinatarios uuid[], _datos jsonb, _titulo text, _cuerpo text, _url text, _etiqueta text, _prioridad text)
returns void language sql as
$f$ insert into public._avisos_push(tipo, destinatarios, datos, titulo, cuerpo, url, etiqueta, prioridad) values (_tipo, _destinatarios, _datos, _titulo, _cuerpo, _url, _etiqueta, _prioridad) $f$;

create table public.meet_rooms (id uuid primary key default gen_random_uuid(), livekit_room_name text unique, created_by uuid references auth.users(id) on delete cascade);
create table public.meet_room_cohosts (meet_room_id uuid references public.meet_rooms(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade, primary key (meet_room_id, user_id));
create table public.calls (id uuid primary key default gen_random_uuid(), room_id text, caller_id uuid references auth.users(id) on delete cascade);

-- ─── profiles: la política de SELECT de prod ────────────────────────────────
alter table public.profiles enable row level security;
create policy "Authenticated users can view all profiles" on public.profiles as permissive for select to authenticated using (true);

-- ─── Tablas (columnas, defaults y NOT NULL de prod) ─────────────────────────
create table public.cowork_break_limits (kind text not null, label text not null, minutos integer not null, updated_at timestamp with time zone default now() not null);
create table public.cowork_breaks (id uuid default gen_random_uuid() not null, session_id uuid not null, room_id uuid, user_id uuid not null, started_at timestamp with time zone default now() not null, ended_at timestamp with time zone, auto_closed boolean default false not null, duration_seconds integer generated always as (
CASE
    WHEN (ended_at IS NULL) THEN NULL::integer
    ELSE GREATEST(0, (EXTRACT(epoch FROM (ended_at - started_at)))::integer)
END) stored, kind text default 'bano'::text not null);
create table public.cowork_host_requests (id uuid default gen_random_uuid() not null, session_id uuid not null, room_id uuid not null, user_id uuid not null, message text, status text default 'open'::text not null, acked_by uuid, resolved_by uuid, acked_at timestamp with time zone, resolved_at timestamp with time zone, created_at timestamp with time zone default now() not null, oneone_livekit_room text);
create table public.cowork_incognito_watch (session_id uuid not null, user_id uuid not null, last_seen timestamp with time zone default now() not null);
create table public.cowork_llamados (id uuid default gen_random_uuid() not null, session_id uuid not null, room_id uuid, user_id uuid not null, kind text not null, detail text, started_at timestamp with time zone not null, seconds integer default 0 not null, day date generated always as (((started_at AT TIME ZONE 'America/Bogota'::text))::date) stored, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null, nonce text not null);
create table public.cowork_meet_participants (id uuid default gen_random_uuid() not null, meet_id uuid not null, session_id uuid not null, user_id uuid not null, room_id uuid, joined_at timestamp with time zone default now() not null, left_at timestamp with time zone, left_reason text, duration_seconds integer generated always as (
CASE
    WHEN (left_at IS NULL) THEN NULL::integer
    ELSE (GREATEST((0)::numeric, EXTRACT(epoch FROM (left_at - joined_at))))::integer
END) stored);
create table public.cowork_meets (id uuid default gen_random_uuid() not null, session_id uuid not null, created_by uuid not null, livekit_room_name text not null, title text default 'Meet grupal'::text not null, started_at timestamp with time zone default now() not null, ended_at timestamp with time zone, end_reason text);
create table public.cowork_memberships (id uuid default gen_random_uuid() not null, session_id uuid not null, user_id uuid not null, role text default 'participant'::text not null, joined_at timestamp with time zone default now() not null);
create table public.cowork_room_assignments (id uuid default gen_random_uuid() not null, session_id uuid not null, user_id uuid not null, room_id uuid not null, assigned_at timestamp with time zone default now() not null, assigned_by uuid, is_active boolean default true not null);
create table public.cowork_rooms (id uuid default gen_random_uuid() not null, session_id uuid not null, name text not null, livekit_room_name text not null, sort_order integer default 0 not null, created_at timestamp with time zone default now() not null, preview_mode text default 'video'::text not null, join_code text not null);
create table public.cowork_screenshare_requests (id uuid default gen_random_uuid() not null, session_id uuid not null, room_id uuid not null, user_id uuid not null, status text default 'pending'::text not null, decided_by uuid, decided_at timestamp with time zone, expires_at timestamp with time zone, created_at timestamp with time zone default now() not null);
create table public.cowork_sessions (id uuid default gen_random_uuid() not null, name text not null, description text, status text default 'active'::text not null, host_hub_livekit_room text not null, created_by uuid not null, created_at timestamp with time zone default now() not null, ended_at timestamp with time zone, updated_at timestamp with time zone default now() not null, host_invite_code text default encode(gen_random_bytes(6), 'hex'::text) not null, alert_rules jsonb, ended_by uuid, host_code_expires_at timestamp with time zone, alert_rules_updated_by uuid, alert_rules_updated_at timestamp with time zone);
create table public.cowork_tiempo_segmentos (id uuid default gen_random_uuid() not null, session_id uuid not null, room_id uuid, user_id uuid not null, estado text not null, detalle text, started_at timestamp with time zone default now() not null, last_seen_at timestamp with time zone default now() not null, ended_at timestamp with time zone, seconds integer generated always as (GREATEST(0, (EXTRACT(epoch FROM (COALESCE(ended_at, last_seen_at) - started_at)))::integer)) stored, equipo text);
alter table public.cowork_break_limits enable row level security;
alter table public.cowork_breaks enable row level security;
alter table public.cowork_host_requests enable row level security;
alter table public.cowork_incognito_watch enable row level security;
alter table public.cowork_llamados enable row level security;
alter table public.cowork_meet_participants enable row level security;
alter table public.cowork_meets enable row level security;
alter table public.cowork_memberships enable row level security;
alter table public.cowork_room_assignments enable row level security;
alter table public.cowork_rooms enable row level security;
alter table public.cowork_screenshare_requests enable row level security;
alter table public.cowork_sessions enable row level security;
alter table public.cowork_tiempo_segmentos enable row level security;

-- ─── Restricciones ───────────────────────────────────────────────────────────
alter table public.cowork_break_limits add constraint cowork_break_limits_kind_check CHECK ((kind = ANY (ARRAY['bano'::text, 'break'::text])));
alter table public.cowork_break_limits add constraint cowork_break_limits_minutos_check CHECK ((minutos > 0));
alter table public.cowork_break_limits add constraint cowork_break_limits_pkey PRIMARY KEY (kind);
alter table public.cowork_breaks add constraint cowork_breaks_kind_chk CHECK ((kind = ANY (ARRAY['bano'::text, 'break'::text])));
alter table public.cowork_breaks add constraint cowork_breaks_pkey PRIMARY KEY (id);
alter table public.cowork_host_requests add constraint cowork_host_requests_pkey PRIMARY KEY (id);
alter table public.cowork_host_requests add constraint cowork_host_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text])));
alter table public.cowork_incognito_watch add constraint cowork_incognito_watch_pkey PRIMARY KEY (session_id, user_id);
alter table public.cowork_llamados add constraint cowork_llamados_kind_check CHECK ((kind = ANY (ARRAY['camara'::text, 'encuadre'::text, 'luz'::text, 'pantalla'::text])));
alter table public.cowork_llamados add constraint cowork_llamados_pkey PRIMARY KEY (id);
alter table public.cowork_llamados add constraint cowork_llamados_seconds_check CHECK ((seconds >= 0));
alter table public.cowork_meet_participants add constraint cowork_meet_participants_left_reason_check CHECK ((left_reason = ANY (ARRAY['volvio'::text, 'meet_terminado'::text, 'barrido'::text])));
alter table public.cowork_meet_participants add constraint cowork_meet_participants_pkey PRIMARY KEY (id);
alter table public.cowork_meets add constraint cowork_meets_end_reason_check CHECK ((end_reason = ANY (ARRAY['supervisor_salio'::text, 'terminado'::text, 'barrido'::text])));
alter table public.cowork_meets add constraint cowork_meets_livekit_room_name_key UNIQUE (livekit_room_name);
alter table public.cowork_meets add constraint cowork_meets_pkey PRIMARY KEY (id);
alter table public.cowork_memberships add constraint cowork_memberships_pkey PRIMARY KEY (id);
alter table public.cowork_memberships add constraint cowork_memberships_role_check CHECK ((role = ANY (ARRAY['host'::text, 'participant'::text])));
alter table public.cowork_memberships add constraint cowork_memberships_session_id_user_id_key UNIQUE (session_id, user_id);
alter table public.cowork_room_assignments add constraint cowork_room_assignments_pkey PRIMARY KEY (id);
alter table public.cowork_rooms add constraint cowork_rooms_livekit_room_name_key UNIQUE (livekit_room_name);
alter table public.cowork_rooms add constraint cowork_rooms_pkey PRIMARY KEY (id);
alter table public.cowork_screenshare_requests add constraint cowork_screenshare_requests_pkey PRIMARY KEY (id);
alter table public.cowork_screenshare_requests add constraint cowork_screenshare_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'expired'::text])));
alter table public.cowork_sessions add constraint cowork_sessions_pkey PRIMARY KEY (id);
alter table public.cowork_sessions add constraint cowork_sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text])));
alter table public.cowork_tiempo_segmentos add constraint cowork_tiempo_segmentos_estado_check CHECK ((estado = ANY (ARRAY['activo'::text, 'pausa'::text, 'sin_camara'::text, 'sin_pantalla'::text, 'fuera_de_camara'::text, 'meet'::text, 'sin_conexion'::text, 'sin_conexion_larga'::text])));
alter table public.cowork_tiempo_segmentos add constraint cowork_tiempo_segmentos_pkey PRIMARY KEY (id);
alter table public.cowork_breaks add constraint cowork_breaks_room_id_fkey FOREIGN KEY (room_id) REFERENCES cowork_rooms(id) ON DELETE SET NULL;
alter table public.cowork_breaks add constraint cowork_breaks_session_id_fkey FOREIGN KEY (session_id) REFERENCES cowork_sessions(id) ON DELETE CASCADE;
alter table public.cowork_breaks add constraint cowork_breaks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.cowork_host_requests add constraint cowork_host_requests_acked_by_fkey FOREIGN KEY (acked_by) REFERENCES auth.users(id);
alter table public.cowork_host_requests add constraint cowork_host_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id);
alter table public.cowork_host_requests add constraint cowork_host_requests_room_id_fkey FOREIGN KEY (room_id) REFERENCES cowork_rooms(id) ON DELETE CASCADE;
alter table public.cowork_host_requests add constraint cowork_host_requests_session_id_fkey FOREIGN KEY (session_id) REFERENCES cowork_sessions(id) ON DELETE CASCADE;
alter table public.cowork_host_requests add constraint cowork_host_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.cowork_incognito_watch add constraint cowork_incognito_watch_session_id_fkey FOREIGN KEY (session_id) REFERENCES cowork_sessions(id) ON DELETE CASCADE;
alter table public.cowork_llamados add constraint cowork_llamados_session_id_fkey FOREIGN KEY (session_id) REFERENCES cowork_sessions(id) ON DELETE CASCADE;
alter table public.cowork_meet_participants add constraint cowork_meet_participants_meet_id_fkey FOREIGN KEY (meet_id) REFERENCES cowork_meets(id) ON DELETE CASCADE;
alter table public.cowork_meet_participants add constraint cowork_meet_participants_room_id_fkey FOREIGN KEY (room_id) REFERENCES cowork_rooms(id) ON DELETE SET NULL;
alter table public.cowork_meet_participants add constraint cowork_meet_participants_session_id_fkey FOREIGN KEY (session_id) REFERENCES cowork_sessions(id) ON DELETE CASCADE;
alter table public.cowork_meet_participants add constraint cowork_meet_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.cowork_meets add constraint cowork_meets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.cowork_meets add constraint cowork_meets_session_id_fkey FOREIGN KEY (session_id) REFERENCES cowork_sessions(id) ON DELETE CASCADE;
alter table public.cowork_memberships add constraint cowork_memberships_session_id_fkey FOREIGN KEY (session_id) REFERENCES cowork_sessions(id) ON DELETE CASCADE;
alter table public.cowork_memberships add constraint cowork_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.cowork_room_assignments add constraint cowork_room_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id);
alter table public.cowork_room_assignments add constraint cowork_room_assignments_room_id_fkey FOREIGN KEY (room_id) REFERENCES cowork_rooms(id) ON DELETE CASCADE;
alter table public.cowork_room_assignments add constraint cowork_room_assignments_session_id_fkey FOREIGN KEY (session_id) REFERENCES cowork_sessions(id) ON DELETE CASCADE;
alter table public.cowork_room_assignments add constraint cowork_room_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.cowork_rooms add constraint cowork_rooms_session_id_fkey FOREIGN KEY (session_id) REFERENCES cowork_sessions(id) ON DELETE CASCADE;
alter table public.cowork_screenshare_requests add constraint cowork_screenshare_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id);
alter table public.cowork_screenshare_requests add constraint cowork_screenshare_requests_room_id_fkey FOREIGN KEY (room_id) REFERENCES cowork_rooms(id) ON DELETE CASCADE;
alter table public.cowork_screenshare_requests add constraint cowork_screenshare_requests_session_id_fkey FOREIGN KEY (session_id) REFERENCES cowork_sessions(id) ON DELETE CASCADE;
alter table public.cowork_screenshare_requests add constraint cowork_screenshare_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.cowork_sessions add constraint cowork_sessions_alert_rules_updated_by_fkey FOREIGN KEY (alert_rules_updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.cowork_sessions add constraint cowork_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.cowork_tiempo_segmentos add constraint cowork_tiempo_segmentos_room_id_fkey FOREIGN KEY (room_id) REFERENCES cowork_rooms(id) ON DELETE SET NULL;
alter table public.cowork_tiempo_segmentos add constraint cowork_tiempo_segmentos_session_id_fkey FOREIGN KEY (session_id) REFERENCES cowork_sessions(id) ON DELETE CASCADE;
alter table public.cowork_tiempo_segmentos add constraint cowork_tiempo_segmentos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ─── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX cowork_llamados_persona_dia ON public.cowork_llamados USING btree (user_id, day);
CREATE INDEX cowork_llamados_sesion ON public.cowork_llamados USING btree (session_id);
CREATE UNIQUE INDEX cowork_llamados_unico ON public.cowork_llamados USING btree (user_id, kind, nonce);
CREATE INDEX cowork_meet_participants_abiertos_idx ON public.cowork_meet_participants USING btree (user_id) WHERE (left_at IS NULL);
CREATE INDEX cowork_meet_participants_meet_idx ON public.cowork_meet_participants USING btree (meet_id);
CREATE INDEX cowork_meet_participants_session_idx ON public.cowork_meet_participants USING btree (session_id);
CREATE INDEX cowork_meets_abiertos_idx ON public.cowork_meets USING btree (session_id) WHERE (ended_at IS NULL);
CREATE INDEX cowork_tiempo_por_persona_fecha ON public.cowork_tiempo_segmentos USING btree (user_id, started_at DESC);
CREATE INDEX cowork_tiempo_por_sesion ON public.cowork_tiempo_segmentos USING btree (session_id);
CREATE UNIQUE INDEX cowork_tiempo_un_abierto_por_persona ON public.cowork_tiempo_segmentos USING btree (user_id) WHERE (ended_at IS NULL);
CREATE UNIQUE INDEX idx_cowork_active_assignment ON public.cowork_room_assignments USING btree (session_id, user_id) WHERE (is_active = true);
CREATE INDEX idx_cowork_breaks_session ON public.cowork_breaks USING btree (session_id, started_at DESC);
CREATE INDEX idx_cowork_breaks_user_started ON public.cowork_breaks USING btree (user_id, started_at DESC);
CREATE INDEX idx_cowork_host_requests_acked_by ON public.cowork_host_requests USING btree (acked_by);
CREATE INDEX idx_cowork_host_requests_resolved_by ON public.cowork_host_requests USING btree (resolved_by);
CREATE INDEX idx_cowork_host_requests_room_id ON public.cowork_host_requests USING btree (room_id);
CREATE INDEX idx_cowork_host_requests_session_id ON public.cowork_host_requests USING btree (session_id);
CREATE INDEX idx_cowork_host_requests_user_id ON public.cowork_host_requests USING btree (user_id);
CREATE INDEX idx_cowork_memberships_user_id ON public.cowork_memberships USING btree (user_id);
CREATE INDEX idx_cowork_room_assignments_assigned_by ON public.cowork_room_assignments USING btree (assigned_by);
CREATE INDEX idx_cowork_room_assignments_room_id ON public.cowork_room_assignments USING btree (room_id);
CREATE INDEX idx_cowork_room_assignments_user_id ON public.cowork_room_assignments USING btree (user_id);
CREATE INDEX idx_cowork_rooms_session_id ON public.cowork_rooms USING btree (session_id);
CREATE INDEX idx_cowork_screenshare_requests_decided_by ON public.cowork_screenshare_requests USING btree (decided_by);
CREATE INDEX idx_cowork_screenshare_requests_room_id ON public.cowork_screenshare_requests USING btree (room_id);
CREATE INDEX idx_cowork_screenshare_requests_session_id ON public.cowork_screenshare_requests USING btree (session_id);
CREATE INDEX idx_cowork_screenshare_requests_user_id ON public.cowork_screenshare_requests USING btree (user_id);
CREATE INDEX idx_cowork_sessions_created_by ON public.cowork_sessions USING btree (created_by);
CREATE UNIQUE INDEX uq_cowork_breaks_open ON public.cowork_breaks USING btree (user_id) WHERE (ended_at IS NULL);
CREATE UNIQUE INDEX uq_cowork_rooms_join_code ON public.cowork_rooms USING btree (join_code);

-- ─── Funciones (copia textual de prod) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.api_cowork_breaks(_from date DEFAULT NULL::date, _to date DEFAULT NULL::date, _profile_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 100, _offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, profile_id uuid, employee text, kind text, started_at timestamp with time zone, ended_at timestamp with time zone, is_open boolean, seconds integer, limit_seconds integer, exceeded boolean, auto_closed boolean, session_id uuid, session_name text, room_id uuid, room_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select b.id, b.user_id as profile_id, p.full_name as employee,
         case b.kind when 'bano' then 'bathroom' else b.kind end as kind,
         b.started_at, b.ended_at, (b.ended_at is null) as is_open,
         coalesce(b.duration_seconds, greatest(0, extract(epoch from (now() - b.started_at))::int)) as seconds,
         lim.limite_seg as limit_seconds,
         (lim.limite_seg is not null
          and coalesce(b.duration_seconds, greatest(0, extract(epoch from (now() - b.started_at))::int)) > lim.limite_seg) as exceeded,
         b.auto_closed,
         b.session_id, cs.name as session_name,
         b.room_id, cr.name as room_name
  from public.cowork_breaks b
  left join public.profiles p on p.id = b.user_id
  left join public.cowork_sessions cs on cs.id = b.session_id
  left join public.cowork_rooms cr on cr.id = b.room_id
  left join public.cowork_break_limits l on l.kind = b.kind
  cross join lateral (
    select coalesce(
      nullif(cs.alert_rules->'pausas'->>(case when b.kind = 'break' then 'breakMin' else 'banoMin' end), '')::int,
      l.minutos
    ) * 60 as limite_seg
  ) lim
  where (_from is null or (b.started_at at time zone 'America/Bogota')::date >= _from)
    and (_to is null or (b.started_at at time zone 'America/Bogota')::date <= _to)
    and (_profile_id is null or b.user_id = _profile_id)
  order by b.started_at desc
  limit least(greatest(_limit, 1), 500)
  offset greatest(_offset, 0)
$function$;

CREATE OR REPLACE FUNCTION public.can_moderate_livekit_room(_user_id uuid, _room text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _room IS NULL OR _room = '' THEN
    RETURN false;
  END IF;

  IF public.is_in_role_group(_user_id, 'admin') THEN
    RETURN true;
  END IF;

  IF _room LIKE 'meet\_%' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.meet_rooms mr
      WHERE mr.livekit_room_name = _room
        AND (
          mr.created_by = _user_id
          OR EXISTS (
            SELECT 1 FROM public.meet_room_cohosts c
            WHERE c.meet_room_id = mr.id AND c.user_id = _user_id
          )
        )
    );
  END IF;

  IF _room LIKE 'cowork\_%' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cowork_sessions s
      JOIN public.cowork_memberships m ON m.session_id = s.id
      WHERE m.user_id = _user_id
        AND m.role = 'host'
        AND (
          s.host_hub_livekit_room = _room
          OR EXISTS (
            SELECT 1 FROM public.cowork_rooms r
            WHERE r.session_id = s.id AND r.livekit_room_name = _room
          )
        )
    );
  END IF;

  IF _room LIKE 'call-%' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.room_id = _room AND c.caller_id = _user_id
    );
  END IF;

  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cowork_bano_consumido_hoy(_user_ids uuid[])
 RETURNS TABLE(user_id uuid, segundos integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select b.user_id,
         greatest(0, sum(
           coalesce(b.duration_seconds, extract(epoch from (b.ended_at - b.started_at)))
         ))::integer as segundos
  from public.cowork_breaks b
  where b.kind = 'bano'
    and b.user_id = any(_user_ids)
    and b.ended_at is not null
    and (b.started_at at time zone 'America/Bogota')::date
        = (now() at time zone 'America/Bogota')::date
  group by b.user_id;
$function$;

CREATE OR REPLACE FUNCTION public.cowork_llamados_no_encoger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.seconds := greatest(coalesce(new.seconds, 0), coalesce(old.seconds, 0));
  new.updated_at := now();

  -- Todo lo que describe el ORIGEN del llamado se congela en lo que se escribió
  -- la primera vez. Lo único que avanza es la duración.
  new.started_at := old.started_at;
  new.session_id := old.session_id;
  new.room_id    := coalesce(old.room_id, new.room_id);
  new.detail     := coalesce(old.detail, new.detail);
  new.created_at := old.created_at;

  if new.user_id is distinct from old.user_id
     or new.kind is distinct from old.kind
     or new.nonce is distinct from old.nonce then
    raise exception
      'cowork_llamados: user_id/kind/nonce identifican el llamado y no se cambian por UPDATE (era %/%/%, llegó %/%/%)',
      old.user_id, old.kind, old.nonce, new.user_id, new.kind, new.nonce;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cowork_meets_resumen(_desde date DEFAULT NULL::date, _hasta date DEFAULT NULL::date, _session_id uuid DEFAULT NULL::uuid, _user_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 2000, _offset integer DEFAULT 0)
 RETURNS TABLE(meet_id uuid, session_id uuid, session_name text, created_by uuid, creador text, meet_started_at timestamp with time zone, meet_ended_at timestamp with time zone, meet_seconds integer, user_id uuid, nombre text, room_id uuid, room_name text, joined_at timestamp with time zone, left_at timestamp with time zone, is_open boolean, seconds integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.cowork_mis_sesiones_activas()
 RETURNS TABLE(id uuid, name text, description text, role text, members integer, created_at timestamp with time zone, last_room_id uuid, created_by uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH mias AS (
    SELECT m.session_id, m.role
    FROM public.cowork_memberships m
    WHERE m.user_id = auth.uid()
  )
  SELECT
    s.id, s.name, s.description, mias.role,
    (SELECT count(*)::integer FROM public.cowork_memberships t WHERE t.session_id = s.id),
    s.created_at,
    (SELECT a.room_id FROM public.cowork_room_assignments a
      WHERE a.session_id = s.id AND a.user_id = auth.uid()
      ORDER BY a.assigned_at DESC LIMIT 1),
    s.created_by
  FROM mias
  JOIN public.cowork_sessions s ON s.id = mias.session_id AND s.status = 'active'
  ORDER BY s.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.cowork_mis_sesiones_finalizadas(_dias integer DEFAULT 10)
 RETURNS TABLE(id uuid, name text, ended_at timestamp with time zone, ended_by uuid, ended_by_name text, created_by uuid, created_by_name text, members integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    s.id, s.name, s.ended_at, s.ended_by,
    pe.full_name as ended_by_name,
    s.created_by,
    pc.full_name as created_by_name,
    (select count(*)::integer from public.cowork_memberships t where t.session_id = s.id) as members
  from public.cowork_sessions s
  left join public.profiles pe on pe.id = s.ended_by
  left join public.profiles pc on pc.id = s.created_by
  where s.status = 'ended'
    and s.ended_at > now() - make_interval(days => greatest(1, least(coalesce(_dias, 10), 90)))
    and (
      public.has_role(auth.uid(), 'admin'::app_role)
      or exists (select 1 from public.cowork_memberships m where m.session_id = s.id and m.user_id = auth.uid())
    )
  order by s.ended_at desc
  limit 30;
$function$;

CREATE OR REPLACE FUNCTION public.cowork_pausas_abiertas(_session_id uuid)
 RETURNS TABLE(user_id uuid, room_id uuid, kind text, started_at timestamp with time zone, segundos integer, limite_segundos integer, excedida boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT b.user_id, b.room_id, b.kind, b.started_at,
         EXTRACT(EPOCH FROM (now() - b.started_at))::integer,
         (l.minutos * 60),
         EXTRACT(EPOCH FROM (now() - b.started_at))::integer > (l.minutos * 60)
  FROM public.cowork_breaks b
  JOIN public.cowork_break_limits l ON l.kind = b.kind
  WHERE b.session_id = _session_id AND b.ended_at IS NULL
    AND (
      public.is_in_role_group(auth.uid(), 'supervisor_or_above')
      OR public.is_cowork_host(auth.uid(), b.session_id)
      OR b.user_id = auth.uid()
    );
$function$;

CREATE OR REPLACE FUNCTION public.cowork_pausas_resumen(_desde date DEFAULT NULL::date, _hasta date DEFAULT NULL::date, _session_id uuid DEFAULT NULL::uuid, _user_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 500, _offset integer DEFAULT 0)
 RETURNS TABLE(dia date, user_id uuid, nombre text, banos integer, seg_bano integer, bano_limite_seg integer, bano_excedido boolean, breaks integer, seg_break integer, break_limite_seg integer, breaks_excedidos integer, seg_break_de_mas integer, auto_cerradas integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with pausas as (
    select
      b.user_id,
      (b.started_at at time zone 'America/Bogota')::date as dia,
      b.kind,
      b.auto_closed,
      coalesce(b.duration_seconds, greatest(0, extract(epoch from (b.ended_at - b.started_at))::int)) as seg,
      coalesce(
        nullif(cs.alert_rules->'pausas'->>(case when b.kind = 'break' then 'breakMin' else 'banoMin' end), '')::int,
        l.minutos
      ) * 60 as limite_seg
    from public.cowork_breaks b
    left join public.cowork_sessions cs on cs.id = b.session_id
    left join public.cowork_break_limits l on l.kind = b.kind
    where b.ended_at is not null
      and (_desde is null or (b.started_at at time zone 'America/Bogota')::date >= _desde)
      and (_hasta is null or (b.started_at at time zone 'America/Bogota')::date <= _hasta)
      and (_session_id is null or b.session_id = _session_id)
      and (_user_id is null or b.user_id = _user_id)
      and (
        auth.uid() is null
        or b.user_id = auth.uid()
        or public.is_cowork_host(auth.uid(), b.session_id)
        or public.is_in_role_group(auth.uid(), 'supervisor_or_above')
      )
  ),
  sumas as (
    select
      p.dia, p.user_id,
      count(*) filter (where p.kind = 'bano' and not p.auto_closed)::int as banos,
      coalesce(sum(p.seg) filter (where p.kind = 'bano' and not p.auto_closed), 0)::int as seg_bano,
      max(p.limite_seg) filter (where p.kind = 'bano') as bano_limite_seg,
      count(*) filter (where p.kind = 'break' and not p.auto_closed)::int as breaks,
      coalesce(sum(p.seg) filter (where p.kind = 'break' and not p.auto_closed), 0)::int as seg_break,
      max(p.limite_seg) filter (where p.kind = 'break') as break_limite_seg,
      count(*) filter (where p.kind = 'break' and not p.auto_closed and p.limite_seg is not null and p.seg > p.limite_seg)::int as breaks_excedidos,
      coalesce(sum(greatest(0, p.seg - p.limite_seg)) filter (where p.kind = 'break' and not p.auto_closed and p.limite_seg is not null), 0)::int as seg_break_de_mas,
      count(*) filter (where p.auto_closed)::int as auto_cerradas
    from pausas p
    group by p.dia, p.user_id
  )
  select
    su.dia, su.user_id, pr.full_name as nombre,
    su.banos, su.seg_bano, su.bano_limite_seg,
    (su.bano_limite_seg is not null and su.seg_bano > su.bano_limite_seg) as bano_excedido,
    su.breaks, su.seg_break, su.break_limite_seg, su.breaks_excedidos, su.seg_break_de_mas,
    su.auto_cerradas
  from sumas su
  left join public.profiles pr on pr.id = su.user_id
  order by su.dia desc, pr.full_name
  limit least(greatest(_limit, 1), 2000)
  offset greatest(_offset, 0)
$function$;

CREATE OR REPLACE FUNCTION public.cowork_puede_supervisar(_user_id uuid, _session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_cowork_global_scope(_user_id)
      or (
        public.has_cowork_team_scope(_user_id)
        and exists (
          select 1 from public.cowork_sessions s
          where s.id = _session_id
            and public.actor_level(s.created_by) < public.actor_level(_user_id)
        )
      );
$function$;

CREATE OR REPLACE FUNCTION public.cowork_reloj_de_sala(_session_id uuid)
 RETURNS TABLE(user_id uuid, seg_activo_hoy integer, ultimo_estado text, ultimo_latido timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.cowork_sesiones_activas_admin()
 RETURNS TABLE(id uuid, name text, description text, members integer, rooms integer, created_at timestamp with time zone, host_name text, my_role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    s.id, s.name, s.description,
    (select count(*)::integer from public.cowork_memberships m where m.session_id = s.id),
    (select count(*)::integer from public.cowork_rooms r where r.session_id = s.id),
    s.created_at,
    (select p.full_name from public.profiles p where p.id = s.created_by),
    (select m.role from public.cowork_memberships m
      where m.session_id = s.id and m.user_id = auth.uid() limit 1)
  from public.cowork_sessions s
  where s.status = 'active'
    and (
      public.has_cowork_global_scope(auth.uid())
      or (
        public.has_cowork_team_scope(auth.uid())
        and public.actor_level(s.created_by) < public.actor_level(auth.uid())
      )
    )
  order by s.created_at desc;
$function$;

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

CREATE OR REPLACE FUNCTION public.equipo_tiempo_cowork(_desde date, _hasta date)
 RETURNS TABLE(user_id uuid, seg_activo bigint, seg_meet bigint, seg_en_sala bigint, dias_con_reloj integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.user_id,
         sum(c.seg_activo)::bigint as seg_activo,
         sum(c.seg_meet)::bigint as seg_meet,
         sum(c.seg_en_sala)::bigint as seg_en_sala,
         count(*) filter (where c.seg_activo > 0)::integer as dias_con_reloj
  from public.cowork_tiempo_diario(_desde, _hasta, null, 500, 0) c
  where public.is_in_role_group(auth.uid(), 'supervisor_or_above') or c.user_id = auth.uid()
  group by c.user_id
$function$;

CREATE OR REPLACE FUNCTION public.gen_cowork_join_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
BEGIN
  LOOP
    candidate := '';
    FOR _i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.cowork_rooms WHERE join_code = candidate);
  END LOOP;
  RETURN candidate;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_cowork_user_room(_user_id uuid, _session_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT room_id FROM public.cowork_room_assignments
  WHERE user_id = _user_id AND session_id = _session_id AND is_active = true
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.is_cowork_host(_user_id uuid, _session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.cowork_memberships
    WHERE user_id = _user_id AND session_id = _session_id AND role = 'host'
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_cowork_member(_user_id uuid, _session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.cowork_memberships
    WHERE user_id = _user_id AND session_id = _session_id
  )
$function$;

CREATE OR REPLACE FUNCTION public.push_cowork_llamado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hosts uuid[];
  v_nombre text;
  v_sesion text;
  v_que text;
begin
  select array_agg(m.user_id) into v_hosts
  from cowork_memberships m
  where m.session_id = new.session_id
    and m.role = 'host'
    and m.user_id <> new.user_id;
  if v_hosts is null then
    return null;
  end if;
  select p.full_name into v_nombre from profiles p where p.id = new.user_id;
  select s.name into v_sesion from cowork_sessions s where s.id = new.session_id;
  v_que := case new.kind
    when 'camara'   then 'Cámara apagada'
    when 'encuadre' then 'Mal encuadre'
    when 'luz'      then 'Sin luz'
    when 'pantalla' then 'No comparte pantalla'
    else new.kind
  end;
  perform public.push_notify_enqueue(
    'cowork_llamado_' || new.kind,
    v_hosts,
    jsonb_build_object('llamado_id', new.id, 'session_id', new.session_id, 'user_id', new.user_id, 'kind', new.kind),
    v_que || ' · Cowork',
    coalesce(nullif(v_nombre, ''), 'Alguien') || coalesce(' · ' || nullif(v_sesion, ''), ''),
    '/cowork?session=' || new.session_id,
    'cowork-llamado-' || new.session_id || '-' || new.kind,
    'normal'
  );
  return null;
end
$function$;

CREATE OR REPLACE FUNCTION public.push_cowork_pedido_host()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hosts uuid[];
  v_nombre text;
  v_sala text;
begin
  if coalesce(new.status, 'open') <> 'open' then
    return null;
  end if;
  select array_agg(m.user_id) into v_hosts
  from cowork_memberships m
  where m.session_id = new.session_id
    and m.role = 'host'
    and m.user_id <> new.user_id;
  if v_hosts is null then
    return null;
  end if;
  select p.full_name into v_nombre from profiles p where p.id = new.user_id;
  if new.room_id is not null then
    select r.name into v_sala from cowork_rooms r where r.id = new.room_id;
  end if;
  perform public.push_notify_enqueue(
    'cowork_pedido_host',
    v_hosts,
    jsonb_build_object('request_id', new.id, 'session_id', new.session_id, 'user_id', new.user_id),
    coalesce(nullif(v_nombre, ''), 'Alguien') || ' pide supervisor',
    coalesce('Sala ' || nullif(v_sala, ''), 'Cowork') || coalesce(' · ' || nullif(new.message, ''), ''),
    '/cowork?session=' || new.session_id,
    'cowork-pedido-' || new.id,
    'normal'
  );
  return null;
end
$function$;

CREATE OR REPLACE FUNCTION public.tg_cowork_rooms_set_join_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.join_code IS NULL THEN
    NEW.join_code := public.gen_cowork_join_code();
  END IF;
  RETURN NEW;
END;
$function$;

-- ─── Grants de funciones como en prod ───────────────────────────────────────
revoke execute on function public.api_cowork_breaks(date, date, uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.cowork_bano_consumido_hoy(uuid[]) from public, anon;
revoke execute on function public.cowork_meets_resumen(date, date, uuid, uuid, integer, integer) from public, anon;
revoke execute on function public.cowork_mis_sesiones_finalizadas(integer) from public, anon;
revoke execute on function public.cowork_pausas_resumen(date, date, uuid, uuid, integer, integer) from public, anon;
revoke execute on function public.cowork_reloj_de_sala(uuid) from public, anon;
revoke execute on function public.cowork_tiempo_diario(date, date, uuid, integer, integer) from public, anon;
revoke execute on function public.equipo_tiempo_cowork(date, date) from public, anon;
revoke execute on function public.gen_cowork_join_code() from public, anon, authenticated;
revoke execute on function public.get_cowork_user_room(uuid, uuid) from public, anon;
revoke execute on function public.push_cowork_llamado() from public, anon, authenticated;
revoke execute on function public.push_cowork_pedido_host() from public, anon, authenticated;

-- ─── Políticas ───────────────────────────────────────────────────────────────
create policy "Admins cambian los limites" on public.cowork_break_limits as permissive for update to authenticated using (( SELECT is_in_role_group(( SELECT auth.uid() AS uid), 'admin'::text) AS is_in_role_group)) with check (( SELECT is_in_role_group(( SELECT auth.uid() AS uid), 'admin'::text) AS is_in_role_group));
create policy "Todos leen los limites" on public.cowork_break_limits as permissive for select to authenticated using (true);
create policy "Hosts see breaks of their session" on public.cowork_breaks as permissive for select to authenticated using (is_cowork_host(( SELECT auth.uid() AS uid), session_id));
create policy "Own breaks" on public.cowork_breaks as permissive for select to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "Supervisors see all breaks" on public.cowork_breaks as permissive for select to authenticated using (( SELECT is_in_role_group(( SELECT auth.uid() AS uid), 'supervisor_or_above'::text) AS is_in_role_group));
create policy "Hosts see all host requests" on public.cowork_host_requests as permissive for select to authenticated using (is_cowork_host(( SELECT auth.uid() AS uid), session_id));
create policy "Members can create host requests" on public.cowork_host_requests as permissive for insert to authenticated with check ((is_cowork_member(( SELECT auth.uid() AS uid), session_id) AND (user_id = ( SELECT auth.uid() AS uid))));
create policy "Users see own host requests" on public.cowork_host_requests as permissive for select to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "Anfitriones ven los de su sesion" on public.cowork_llamados as permissive for select to public using (is_cowork_host(( SELECT auth.uid() AS uid), session_id));
create policy "Propios llamados" on public.cowork_llamados as permissive for select to public using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "Supervisores ven todos" on public.cowork_llamados as permissive for select to public using (( SELECT is_in_role_group(( SELECT auth.uid() AS uid), 'supervisor_or_above'::text) AS is_in_role_group));
create policy "cowork_meet_participants: miembros de la sesión leen" on public.cowork_meet_participants as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM cowork_memberships m
  WHERE ((m.session_id = cowork_meet_participants.session_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));
create policy "cowork_meets: miembros de la sesión leen" on public.cowork_meets as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM cowork_memberships m
  WHERE ((m.session_id = cowork_meets.session_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));
create policy "Members see session memberships" on public.cowork_memberships as permissive for select to authenticated using (is_cowork_member(( SELECT auth.uid() AS uid), session_id));
create policy "Hosts see all assignments" on public.cowork_room_assignments as permissive for select to authenticated using (is_cowork_host(( SELECT auth.uid() AS uid), session_id));
create policy "Participants see own assignment" on public.cowork_room_assignments as permissive for select to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "Hosts see all rooms" on public.cowork_rooms as permissive for select to authenticated using (is_cowork_host(( SELECT auth.uid() AS uid), session_id));
create policy "Participants see their assigned room" on public.cowork_rooms as permissive for select to authenticated using ((id = get_cowork_user_room(( SELECT auth.uid() AS uid), session_id)));
create policy "Hosts see all screenshare requests" on public.cowork_screenshare_requests as permissive for select to authenticated using (is_cowork_host(( SELECT auth.uid() AS uid), session_id));
create policy "Members can create screenshare requests" on public.cowork_screenshare_requests as permissive for insert to authenticated with check ((is_cowork_member(( SELECT auth.uid() AS uid), session_id) AND (user_id = ( SELECT auth.uid() AS uid))));
create policy "Users see own screenshare requests" on public.cowork_screenshare_requests as permissive for select to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "Hosts can update session" on public.cowork_sessions as permissive for update to authenticated using (is_cowork_host(( SELECT auth.uid() AS uid), id));
create policy "Members can view their session" on public.cowork_sessions as permissive for select to authenticated using (is_cowork_member(( SELECT auth.uid() AS uid), id));
create policy "tiempo: cada uno lo suyo" on public.cowork_tiempo_segmentos as permissive for select to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'admin'::text) AS has_role)));

-- ─── Triggers ────────────────────────────────────────────────────────────────
CREATE TRIGGER cowork_llamados_no_encoger BEFORE UPDATE ON public.cowork_llamados FOR EACH ROW EXECUTE FUNCTION cowork_llamados_no_encoger();
CREATE TRIGGER on_cowork_llamado_push AFTER INSERT ON public.cowork_llamados FOR EACH ROW EXECUTE FUNCTION push_cowork_llamado();
CREATE TRIGGER on_cowork_pedido_host_push AFTER INSERT ON public.cowork_host_requests FOR EACH ROW EXECUTE FUNCTION push_cowork_pedido_host();
CREATE TRIGGER trg_cowork_rooms_set_join_code BEFORE INSERT ON public.cowork_rooms FOR EACH ROW EXECUTE FUNCTION tg_cowork_rooms_set_join_code();
CREATE TRIGGER update_cowork_sessions_updated_at BEFORE UPDATE ON public.cowork_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
