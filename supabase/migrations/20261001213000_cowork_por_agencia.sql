-- COWORK POR AGENCIA (fase 0, entrega 3b del plan «Maven Basic»), parte 1: la base.
-- Requiere 20261001210000_agencias_base, 20261001211000_roles_por_agencia y
-- 20261001212000_personas_por_agencia (gente_de_mi_agencia).
-- Banco: supabase/tests/cowork_por_agencia.ts.
--
-- Hasta hoy ninguna tabla de Cowork sabía de qué agencia era. Casi todo se
-- decide por MEMBRESÍA de la sesión (is_cowork_host / is_cowork_member), así que
-- la regla que cierra casi todo es una sola: nadie queda dentro de una sesión de
-- otra agencia. Qué cambia:
--
--   1. cowork_sessions.tenant_id: la agencia de la sesión. La pone la base
--      (cowork_sessions_agencia) desde la agencia de quien la crea; la edge
--      cowork-session no tiene que mandarla. No se cambia nunca.
--   2. cowork_misma_agencia, en las 10 tablas que cuelgan de una sesión y
--      nombran a una persona (membresías, asignaciones, pausas, llamados,
--      reloj, meets y sus participantes, pedidos de anfitrión y de pantalla,
--      incógnito): la persona tiene que ser de la agencia de la sesión. Así,
--      aunque una edge function se equivoque (joinSession, joinByCode,
--      requestHost, incognitoPing aceptan cualquier sessionId), la base no deja
--      entrar a nadie de otra agencia.
--   3. cowork_break_limits por agencia: los topes de baño y break eran UNA fila
--      por tipo para todo Maven, y cualquier admin los cambiaba para todos.
--      Ahora (agencia, tipo). sembrar_cowork_de_agencia(agencia, desde) copia los
--      topes al crear una agencia (solo service_role, como sembrar_roles_de_agencia).
--   4. Lo que veía «todo» ahora ve «todo lo de su agencia»:
--      · políticas: las pausas y los llamados para supervisores, el reloj
--        (cowork_tiempo_segmentos) para admins, los topes de pausa;
--      · funciones: el tablero de sesiones activas para admins, las sesiones
--        finalizadas, cowork_puede_supervisar (entrar como anfitrión con
--        alcance), los reportes de tiempo, pausas y meets, las pausas abiertas,
--        el baño consumido hoy;
--      · can_moderate_livekit_room: un admin moderaba (silenciar, sacar,
--        cerrar) CUALQUIER sala de LiveKit. Ahora, las de su agencia
--        (agencia_de_sala_livekit: Cowork por la sesión, Meet por quien la creó,
--        llamadas por quien llamó). Un nombre de sala que no es de ninguna de
--        esas tres familias ya no lo modera ningún admin.
--      · api_cowork_breaks: el tope se lee de la agencia de la sesión (con dos
--        agencias, el JOIN solo por tipo duplicaba cada pausa).
--
-- Con una sola agencia el resultado es el mismo que en prod: el banco lo
-- compara persona por persona, función por función y tabla por tabla.
--
-- Lo que NO cierra esta migración (queda anotado en el plan):
--   · las edge functions: cowork-session decide «admin» sin mirar la agencia
--     (endSession, getHostCode, incognito_room) y emite tokens de LiveKit por
--     roomId sin comprobar que la sala sea de la sesión: parte 2 de la 3b.
--   · livekit-token (token para cualquier nombre de sala), livekit-moderate
--     (quienesEstan de cualquier sala) y recordings: entrega 3c.
--   · la API pública (api_cowork_* y los reportes con service_role pasan todo):
--     la compuerta de aislamiento.ts ya la corta con más de una agencia.
--   · admin_cowork_vs_hubstaff: la parte de Hubstaff (solo KASH) es de la 3g.
--
-- Cada función se reemplaza con CREATE OR REPLACE solo si la de prod es
-- EXACTAMENTE la que se revisó (huella md5(prosrc)); si no, la migración falla
-- sin tocar nada. Los grants no cambian (CREATE OR REPLACE los conserva). Las
-- definiciones de antes quedan en cowork_por_agencia_respaldo.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre). Solo con una agencia:
--| do $$ declare r record; begin for r in select def from public.cowork_por_agencia_respaldo loop execute r.def; end loop; end $$;
--| drop table public.cowork_por_agencia_respaldo;
--| drop function public.agencia_de_sala_livekit(text);
--| drop function public.sembrar_cowork_de_agencia(uuid, uuid);
--| alter policy "Supervisors see all breaks" on public.cowork_breaks using (( SELECT is_in_role_group(( SELECT auth.uid() AS uid), 'supervisor_or_above'::text) AS is_in_role_group));
--| alter policy "Supervisores ven todos" on public.cowork_llamados using (( SELECT is_in_role_group(( SELECT auth.uid() AS uid), 'supervisor_or_above'::text) AS is_in_role_group));
--| alter policy "tiempo: cada uno lo suyo" on public.cowork_tiempo_segmentos using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'admin'::text) AS has_role)));
--| alter policy "Todos leen los limites" on public.cowork_break_limits using (true);
--| alter policy "Admins cambian los limites" on public.cowork_break_limits using (( SELECT is_in_role_group(( SELECT auth.uid() AS uid), 'admin'::text) AS is_in_role_group)) with check (( SELECT is_in_role_group(( SELECT auth.uid() AS uid), 'admin'::text) AS is_in_role_group));
--| drop function public.cowork_sesiones_de_mi_agencia();
--| drop trigger cowork_memberships_misma_agencia on public.cowork_memberships;
--| drop trigger cowork_room_assignments_misma_agencia on public.cowork_room_assignments;
--| drop trigger cowork_breaks_misma_agencia on public.cowork_breaks;
--| drop trigger cowork_llamados_misma_agencia on public.cowork_llamados;
--| drop trigger cowork_tiempo_segmentos_misma_agencia on public.cowork_tiempo_segmentos;
--| drop trigger cowork_meets_misma_agencia on public.cowork_meets;
--| drop trigger cowork_meet_participants_misma_agencia on public.cowork_meet_participants;
--| drop trigger cowork_host_requests_misma_agencia on public.cowork_host_requests;
--| drop trigger cowork_screenshare_requests_misma_agencia on public.cowork_screenshare_requests;
--| drop trigger cowork_incognito_watch_misma_agencia on public.cowork_incognito_watch;
--| drop function public.cowork_misma_agencia();
--| drop trigger cowork_sessions_agencia on public.cowork_sessions;
--| drop function public.cowork_sessions_agencia();
--| alter table public.cowork_break_limits drop constraint cowork_break_limits_pkey, add constraint cowork_break_limits_pkey primary key (kind);
--| alter table public.cowork_break_limits drop column tenant_id;
--| alter table public.cowork_sessions drop column tenant_id;

do $$
begin
  if (select count(*) from public.tenants) <> 1 then
    raise exception 'cowork_por_agencia: se aplica con UNA sola agencia (hay %): las filas de hoy se asignan a esa', (select count(*) from public.tenants);
  end if;
  if exists (select 1 from public.cowork_sessions s where not exists (select 1 from public.tenant_members tm where tm.user_id = s.created_by)) then
    raise exception 'cowork_por_agencia: hay sesiones creadas por alguien sin agencia';
  end if;
end $$;

-- ─── 0. Las funciones que se reemplazan tienen que ser las revisadas ─────────
create table public.cowork_por_agencia_respaldo (fn text primary key, def text not null, guardada timestamptz not null default now());
alter table public.cowork_por_agencia_respaldo enable row level security;
revoke all on table public.cowork_por_agencia_respaldo from public, anon, authenticated;
comment on table public.cowork_por_agencia_respaldo is
  'Definiciones de antes de 20261001213000_cowork_por_agencia, para su vuelta atrás. Sin políticas.';

do $$
declare
  r record;
  h text;
begin
  for r in select * from (values
    ('public.api_cowork_breaks(date,date,uuid,integer,integer)', 'f16bda24c3ad1912266d611461dca48c'),
    ('public.can_moderate_livekit_room(uuid,text)', 'a49b650f2af4f4d9461225d0877b9d78'),
    ('public.cowork_bano_consumido_hoy(uuid[])', 'cc0d6f61ddf41990eb8d2534c8da9b9c'),
    ('public.cowork_meets_resumen(date,date,uuid,uuid,integer,integer)', '26208993ce9c6344dde38e94751e589a'),
    ('public.cowork_mis_sesiones_finalizadas(integer)', 'dfa7a92fa68628fddda635ad6623502e'),
    ('public.cowork_pausas_abiertas(uuid)', 'cb89dc285c025540629f9222735f486f'),
    ('public.cowork_pausas_resumen(date,date,uuid,uuid,integer,integer)', '27d07e8e641b1d903f99a09d9777343c'),
    ('public.cowork_puede_supervisar(uuid,uuid)', '1a59999382558887c183dd08f01b4567'),
    ('public.cowork_sesiones_activas_admin()', '32207619ccacee51f04151da3ef1fc10'),
    ('public.cowork_tiempo_diario(date,date,uuid,integer,integer)', 'f026e22c0b3d440653876bece1b60ad3')
  ) as x(fn, huella) loop
    select md5(p.prosrc) into h from pg_proc p where p.oid = r.fn::regprocedure;
    if h is distinct from r.huella then
      raise exception 'cowork_por_agencia: % no es la que se revisó (huella %, se esperaba %): mirar qué cambió antes de aplicar', r.fn, h, r.huella;
    end if;
    insert into public.cowork_por_agencia_respaldo (fn, def) values (r.fn, pg_get_functiondef(r.fn::regprocedure));
  end loop;
end $$;

-- ─── 1. La agencia de la sesión ──────────────────────────────────────────────
alter table public.cowork_sessions add column tenant_id uuid references public.tenants(id);
alter table public.cowork_sessions disable trigger update_cowork_sessions_updated_at;
update public.cowork_sessions s set tenant_id = tm.tenant_id
  from public.tenant_members tm where tm.user_id = s.created_by;
alter table public.cowork_sessions enable trigger update_cowork_sessions_updated_at;
alter table public.cowork_sessions alter column tenant_id set not null;
create index cowork_sessions_agencia_idx on public.cowork_sessions (tenant_id, status);

comment on column public.cowork_sessions.tenant_id is
  'La agencia de la sesión: la de quien la crea (la pone cowork_sessions_agencia). No se cambia.';

create function public.cowork_sessions_agencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_del_creador uuid;
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id then
      raise exception 'cowork_sessions_agencia: la agencia de una sesión no se cambia' using errcode = '23514';
    end if;
    return new;
  end if;
  v_del_creador := (select tm.tenant_id from public.tenant_members tm where tm.user_id = new.created_by);
  if v_del_creador is null then
    raise exception 'cowork_sessions_agencia: % no es de ninguna agencia, no puede crear sesiones', new.created_by using errcode = '42501';
  end if;
  if new.tenant_id is null then
    new.tenant_id := v_del_creador;
  elsif new.tenant_id <> v_del_creador then
    raise exception 'cowork_sessions_agencia: la sesión tiene que ser de la agencia de quien la crea' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger cowork_sessions_agencia
  before insert or update of tenant_id on public.cowork_sessions
  for each row execute function public.cowork_sessions_agencia();

-- Las sesiones de la agencia de quien llama. SECURITY DEFINER y conjunto, como
-- gente_de_mi_agencia: dentro de una política se calcula una vez por consulta.
create function public.cowork_sesiones_de_mi_agencia()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.id from public.cowork_sessions s where s.tenant_id = public.current_tenant_id()
$$;

comment on function public.cowork_sesiones_de_mi_agencia() is
  'Los id de las sesiones de Cowork de la agencia de quien llama. Para políticas y funciones.';

revoke all on function public.cowork_sesiones_de_mi_agencia() from public, anon;
grant execute on function public.cowork_sesiones_de_mi_agencia() to authenticated, service_role;

-- ─── 2. Nadie queda dentro de una sesión de otra agencia ────────────────────
-- El argumento es la columna que nombra a la persona (user_id, o created_by en
-- cowork_meets). Si la sesión no existe, decide la clave foránea.
create function public.cowork_misma_agencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_persona uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
  v_de_la_sesion uuid;
  v_de_la_persona uuid;
begin
  select s.tenant_id into v_de_la_sesion from public.cowork_sessions s where s.id = new.session_id;
  if v_de_la_sesion is null then
    return new;
  end if;
  select tm.tenant_id into v_de_la_persona from public.tenant_members tm where tm.user_id = v_persona;
  if v_de_la_persona is distinct from v_de_la_sesion then
    raise exception 'cowork_misma_agencia: % no es de la agencia de la sesión % (%)', v_persona, new.session_id, tg_table_name
      using errcode = '42501', hint = 'Cada persona entra solo a las sesiones de su agencia.';
  end if;
  return new;
end $$;

create trigger cowork_memberships_misma_agencia before insert or update of session_id, user_id on public.cowork_memberships
  for each row execute function public.cowork_misma_agencia('user_id');
create trigger cowork_room_assignments_misma_agencia before insert or update of session_id, user_id on public.cowork_room_assignments
  for each row execute function public.cowork_misma_agencia('user_id');
create trigger cowork_breaks_misma_agencia before insert or update of session_id, user_id on public.cowork_breaks
  for each row execute function public.cowork_misma_agencia('user_id');
create trigger cowork_llamados_misma_agencia before insert or update of session_id, user_id on public.cowork_llamados
  for each row execute function public.cowork_misma_agencia('user_id');
create trigger cowork_tiempo_segmentos_misma_agencia before insert or update of session_id, user_id on public.cowork_tiempo_segmentos
  for each row execute function public.cowork_misma_agencia('user_id');
create trigger cowork_meets_misma_agencia before insert or update of session_id, created_by on public.cowork_meets
  for each row execute function public.cowork_misma_agencia('created_by');
create trigger cowork_meet_participants_misma_agencia before insert or update of session_id, user_id on public.cowork_meet_participants
  for each row execute function public.cowork_misma_agencia('user_id');
create trigger cowork_host_requests_misma_agencia before insert or update of session_id, user_id on public.cowork_host_requests
  for each row execute function public.cowork_misma_agencia('user_id');
create trigger cowork_screenshare_requests_misma_agencia before insert or update of session_id, user_id on public.cowork_screenshare_requests
  for each row execute function public.cowork_misma_agencia('user_id');
create trigger cowork_incognito_watch_misma_agencia before insert or update of session_id, user_id on public.cowork_incognito_watch
  for each row execute function public.cowork_misma_agencia('user_id');

-- ─── 3. Topes de pausa por agencia ───────────────────────────────────────────
alter table public.cowork_break_limits add column tenant_id uuid references public.tenants(id) on delete cascade;
update public.cowork_break_limits set tenant_id = (select id from public.tenants);
alter table public.cowork_break_limits
  alter column tenant_id set not null,
  alter column tenant_id set default public.current_tenant_id(),
  drop constraint cowork_break_limits_pkey,
  add constraint cowork_break_limits_pkey primary key (tenant_id, kind);

comment on column public.cowork_break_limits.tenant_id is
  'La agencia de estos topes. Una agencia nueva los recibe con sembrar_cowork_de_agencia.';

alter policy "Todos leen los limites" on public.cowork_break_limits
  using (tenant_id = (select public.current_tenant_id()));
-- Los dos lados: la política ya tenía WITH CHECK y ALTER POLICY no lo toca si no
-- se lo nombra. Con los dos, un admin tampoco puede pasar un tope a otra agencia.
alter policy "Admins cambian los limites" on public.cowork_break_limits
  using ((select public.is_in_role_group((select auth.uid()), 'admin'::text)) and tenant_id = (select public.current_tenant_id()))
  with check ((select public.is_in_role_group((select auth.uid()), 'admin'::text)) and tenant_id = (select public.current_tenant_id()));

create function public.sembrar_cowork_de_agencia(_agencia uuid, _desde uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n integer;
begin
  insert into public.cowork_break_limits (tenant_id, kind, label, minutos)
  select _agencia, l.kind, l.label, l.minutos
  from public.cowork_break_limits l
  where l.tenant_id = _desde
  on conflict (tenant_id, kind) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

comment on function public.sembrar_cowork_de_agencia(uuid, uuid) is
  'Copia los topes de pausa de la agencia _desde a la agencia _agencia (los que ya tenga no se tocan). Devuelve cuántos copió. Solo service_role (panel de plataforma).';

revoke all on function public.sembrar_cowork_de_agencia(uuid, uuid) from public, anon, authenticated;
grant execute on function public.sembrar_cowork_de_agencia(uuid, uuid) to service_role;

-- ─── 4. Lo que veía todo, ahora ve lo de su agencia: políticas ──────────────
alter policy "Supervisors see all breaks" on public.cowork_breaks
  using ((select public.is_in_role_group((select auth.uid()), 'supervisor_or_above'::text))
         and session_id in (select public.cowork_sesiones_de_mi_agencia()));
alter policy "Supervisores ven todos" on public.cowork_llamados
  using ((select public.is_in_role_group((select auth.uid()), 'supervisor_or_above'::text))
         and session_id in (select public.cowork_sesiones_de_mi_agencia()));
alter policy "tiempo: cada uno lo suyo" on public.cowork_tiempo_segmentos
  using (user_id = (select auth.uid())
         or ((select public.has_role((select auth.uid()), 'admin'::text))
             and session_id in (select public.cowork_sesiones_de_mi_agencia())));

-- ─── 5. ... y funciones ──────────────────────────────────────────────────────
-- La agencia de una sala de LiveKit, por su nombre. NULL = no se sabe.
create function public.agencia_de_sala_livekit(_room text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    -- Las salas de Cowork llevan los 8 primeros caracteres del id de su sesión:
    -- cowork_hub_<s>, cowork_<s>_<n>, cowork_meet_<s>_<m>, cowork_1on1_<s>_<r>.
    -- Por el prefijo se encuentra también una sala ya cerrada (closeRoom borra la
    -- fila de cowork_rooms y la sala de LiveKit puede seguir viva un rato).
    when _room like 'cowork\_%' then (
      select case when count(distinct s.tenant_id) = 1 then min(s.tenant_id::text)::uuid end
      from public.cowork_sessions s
      where left(s.id::text, 8) = substring(_room from '^cowork_(?:hub_|meet_|1on1_)?([0-9a-f]{8})'))
    when _room like 'meet\_%' then (
      select tm.tenant_id
      from public.meet_rooms mr
      join public.tenant_members tm on tm.user_id = mr.created_by
      where mr.livekit_room_name = _room)
    when _room like 'call-%' then (
      select case when count(distinct tm.tenant_id) = 1 then min(tm.tenant_id::text)::uuid end
      from public.calls c
      join public.tenant_members tm on tm.user_id = c.caller_id
      where c.room_id = _room)
  end
$$;

comment on function public.agencia_de_sala_livekit(text) is
  'La agencia de una sala de LiveKit por su nombre: Cowork por la sesión, Meet por quien la creó, llamadas por quien llamó. NULL si no se sabe.';

revoke all on function public.agencia_de_sala_livekit(text) from public, anon;
grant execute on function public.agencia_de_sala_livekit(text) to authenticated, service_role;

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
  -- El tope es el de la agencia de la sesión (20261001213000).
  left join public.cowork_break_limits l on l.kind = b.kind and l.tenant_id = cs.tenant_id
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

  -- Un admin modera las salas de SU agencia (20261001213000); antes, cualquiera.
  IF public.is_in_role_group(_user_id, 'admin')
     AND public.agencia_de_sala_livekit(_room) = (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = _user_id) THEN
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
    -- Con sesión, solo gente de la propia agencia (20261001213000).
    and (auth.uid() is null or b.user_id in (select public.gente_de_mi_agencia()))
    and b.ended_at is not null
    and (b.started_at at time zone 'America/Bogota')::date
        = (now() at time zone 'America/Bogota')::date
  group by b.user_id;
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
    -- sesiones que uno hostea, o todo lo de su agencia si es supervisor o
    -- superior (20261001213000).
    and (
      auth.uid() is null
      or p.user_id = auth.uid()
      or public.is_cowork_host(auth.uid(), p.session_id)
      or (public.is_in_role_group(auth.uid(), 'supervisor_or_above')
          and cs.tenant_id = (select public.current_tenant_id()))
    )
  order by m.started_at desc, pr.full_name
  limit least(greatest(_limit, 1), 5000)
  offset greatest(_offset, 0)
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
      -- Un admin ve las de su agencia (20261001213000).
      (public.has_role(auth.uid(), 'admin'::app_role) and s.tenant_id = (select public.current_tenant_id()))
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
  JOIN public.cowork_sessions s ON s.id = b.session_id
  -- El tope es el de la agencia de la sesión (20261001213000).
  JOIN public.cowork_break_limits l ON l.kind = b.kind AND l.tenant_id = s.tenant_id
  WHERE b.session_id = _session_id AND b.ended_at IS NULL
    AND (
      (public.is_in_role_group(auth.uid(), 'supervisor_or_above')
       AND s.tenant_id = (SELECT public.current_tenant_id()))
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
    -- El tope es el de la agencia de la sesión (20261001213000).
    left join public.cowork_break_limits l on l.kind = b.kind and l.tenant_id = cs.tenant_id
    where b.ended_at is not null
      and (_desde is null or (b.started_at at time zone 'America/Bogota')::date >= _desde)
      and (_hasta is null or (b.started_at at time zone 'America/Bogota')::date <= _hasta)
      and (_session_id is null or b.session_id = _session_id)
      and (_user_id is null or b.user_id = _user_id)
      and (
        auth.uid() is null
        or b.user_id = auth.uid()
        or public.is_cowork_host(auth.uid(), b.session_id)
        or (public.is_in_role_group(auth.uid(), 'supervisor_or_above')
            and cs.tenant_id = (select public.current_tenant_id()))
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
  -- Solo sesiones de la propia agencia (20261001213000); el alcance de los
  -- roles ya es por agencia, pero sin esto miraba sesiones de cualquiera.
  select exists (
           select 1
           from public.cowork_sessions s0
           join public.tenant_members tm on tm.tenant_id = s0.tenant_id and tm.user_id = _user_id
           where s0.id = _session_id
         )
     and (
       public.has_cowork_global_scope(_user_id)
       or (
         public.has_cowork_team_scope(_user_id)
         and exists (
           select 1 from public.cowork_sessions s
           where s.id = _session_id
             and public.actor_level(s.created_by) < public.actor_level(_user_id)
         )
       )
     );
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
    -- Solo las de la agencia de quien mira (20261001213000).
    and s.tenant_id = (select public.current_tenant_id())
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
      -- Con sesión de usuario, cada uno ve lo suyo salvo admin, que ve lo de su
      -- agencia (20261001213000). Sin sesión (service_role desde la API
      -- pública) pasa todo.
      and (auth.uid() is null or s.user_id = auth.uid()
           or (public.has_role(auth.uid(), 'admin')
               and s.session_id in (select public.cowork_sesiones_de_mi_agencia())))
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
