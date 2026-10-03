-- MEET, LLAMADAS, GRABACIONES Y LIVEKIT POR AGENCIA (fase 0, entrega 3c del plan
-- «Maven Basic»): la base.
-- Requiere 20260930230000_chat_agencia_y_huecos (chat_conversations.tenant_id),
-- 20261001210000_agencias_base, 20261001211000_roles_por_agencia,
-- 20261001212000_personas_por_agencia y 20261001213000_cowork_por_agencia (que
-- crea agencia_de_sala_livekit y deja la can_moderate_livekit_room que se
-- reemplaza aquí). Banco: supabase/tests/meet_por_agencia.ts. La guarda de las
-- edges es su espejo: supabase/functions/_shared/livekit-agencia.ts.
--
-- Hasta hoy ninguna tabla de Meet, de las llamadas del Messenger ni de
-- Grabaciones sabía de qué agencia era, y varias se leían o escribían de una
-- agencia a otra. Los huecos, con el nombre que les da el banco (cada uno se
-- prueba ABIERTO sin esta migración y CERRADO con ella):
--
--   M1. meet_guest_requests: «Authenticated users see guest requests» es
--       USING (true) y authenticated tiene SELECT de toda la tabla: cualquier
--       cuenta (de cualquier agencia, o del registro público) leía guest_token,
--       el secreto con el que el invitado canjea su token de LiveKit en
--       meet-guest, y entraba a esa reunión haciéndose pasar por él. Y Realtime
--       le mandaba cada solicitud nueva, con el secreto adentro.
--   M2. meet_room_cohosts: «Authenticated users see cohosts» es USING (true).
--   M3. meet_room_members, meet_room_cohosts y la admisión de un invitado
--       (decided_by): nada impedía meter a alguien de otra agencia.
--   L1. calls: «Users can create calls» solo mira caller_id. Se llamaba a
--       alguien de otra agencia, con cualquier room_id; con room_id = la sala de
--       una llamada ajena (call-<conversación>), quien insertaba la fila quedaba
--       como «el que llamó» de esa sala: can_moderate_livekit_room e
--       is_livekit_room_owner lo dejaban silenciar, echar y terminar, y
--       livekit-token le daba roomAdmin.
--   L2. calls: «Participants can update calls» no tiene WITH CHECK: quien
--       recibía se cambiaba el caller_id y la sala (lo mismo que L1).
--   L3. call_participants: cualquiera se sumaba a cualquier llamada («… OR
--       user_id = auth.uid()»), o movía su participación a otra llamada (UPDATE
--       de call_id): con eso la veía y la podía actualizar (terminarla).
--   G1. meeting_recordings_select: has_role(admin), has_grabaciones_global_scope
--       y el alcance de equipo no miran la agencia: el admin (o el rol con
--       Grabaciones «todos») de cualquier agencia veía las grabaciones de todas,
--       y v_recordings_usage (security_invoker) las contaba.
--   G2. meeting_recordings_update: el admin de cualquier agencia editaba todas.
--   G3. meeting_recording_recipients: el admin de cualquier agencia veía con
--       quién se compartió cada grabación de todas, y nada impedía compartir con
--       alguien de otra agencia.
--   G4. meeting_recordings: se creaba la grabación de una sala de otra agencia
--       (y quien la inicia la recibe siempre).
--   S1. agencia_de_sala_livekit resolvía Meet por quien creó la reunión y las
--       llamadas por quien llamó: con L1 una sala quedaba «de dos agencias»
--       (NULL) y su propio admin ya no la moderaba; y las llamadas de GRUPO (sin
--       fila en calls) no eran de ninguna agencia.
--
-- Qué cambia:
--   1. tenant_id en meet_rooms, calls y meeting_recordings (las tablas «padre»),
--      NOT NULL, con las filas de hoy en la única agencia (default constante y
--      después sin default: no reescribe filas ni manda eventos de Realtime). La
--      pone la base, nunca el pedido: la de quien crea la reunión, la de quien
--      llama, la de la sala que se graba (que tiene que ser la de quien graba).
--      No cambia nunca.
--   2. Las tablas «hijas» exigen la misma agencia: miembros y co-anfitriones de
--      una reunión (y quien lo da), quien admite a un invitado, participantes de
--      una llamada, destinatarios de una grabación.
--   3. calls: la sala es call-<id de su conversación>, la conversación es de la
--      agencia de quien llama y quien llama está en ella; a quien se llama es de
--      la agencia. Quién llama, a quién, la sala y la conversación no cambian (la
--      conversación solo puede pasar a NULL: lo hace la FK al borrarla). Una
--      participación no cambia de llamada ni de persona. Una reunión no cambia
--      de agencia, creador ni sala; una grabación, de agencia ni de sala.
--   4. Políticas (ALTER POLICY): las reuniones, sus co-anfitriones y sus
--      invitados, de mi agencia; las grabaciones y sus destinatarios (para el
--      admin), de mi agencia. guest_token e ip_hash dejan de ser legibles por la
--      API (privilegio de columna; Realtime tampoco los manda): lo que lee
--      MeetGuestGate (id, guest_name, status, created_at) sigue igual.
--   5. agencia_de_sala_livekit, la autoridad de «de quién es esta sala»: Meet por
--      meet_rooms.tenant_id; llamadas por su conversación (también las de grupo)
--      y, si ya no existe, por sus filas de calls; Cowork igual que antes.
--      can_moderate_livekit_room e is_livekit_room_owner: nadie modera ni es
--      dueño de una sala que no es de su agencia (ni admin, ni anfitrión, ni
--      «el que llamó»). can_moderate_livekit_room deja de ser de anon.
--
-- Con una sola agencia cada persona ve y puede lo mismo que en prod (el banco
-- lo compara persona por persona), salvo lo que se cierra a propósito: leer
-- guest_token e ip_hash, sumarse o moverse a una llamada ajena, y crear una
-- llamada con una sala que no es la de su conversación. Y un cambio a favor: el
-- admin ahora modera las llamadas de grupo de su agencia (antes no eran de nadie).
--
-- Despliegue: las edges de este PR andan antes y después de esta migración (leen
-- select("*"); sin tenant_id usan la agencia de quien creó), y las edges de hoy
-- andan con ella (no mandan tenant_id: lo pone la base). Orden recomendado:
-- mergear (despliega las edges: cierra los tokens, la moderación y las
-- grabaciones por nombre de sala) y aplicar esto enseguida (cierra M1, que hoy
-- está abierto también con una sola agencia).
--
-- Lo que NO cierra (anotado en el PR): send-call-invitation (manda correos con
-- cualquier link: no es de agencia); dentro de una agencia, un Meet o una
-- llamada se abren con el link (como hoy, como en Google dentro de la
-- organización); las filas viejas de gente sin agencia (registro público) en
-- miembros, participantes o destinatarios no se borran: las políticas ya no se
-- las muestran.
--
-- Cada función se reemplaza con CREATE OR REPLACE solo si la de prod es
-- EXACTAMENTE la que se revisó (huella md5(prosrc)); si no, la migración falla
-- sin tocar nada. Las definiciones de antes quedan en meet_por_agencia_respaldo.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre). Solo con una agencia:
--| do $$ declare r record; begin for r in select def from public.meet_por_agencia_respaldo loop execute r.def; end loop; end $$;
--| drop table public.meet_por_agencia_respaldo;
--| grant execute on function public.can_moderate_livekit_room(uuid, text) to public, anon;
--| alter policy "Creator sees own meet rooms" on public.meet_rooms using ((created_by = auth.uid()));
--| alter policy "Members see meet rooms" on public.meet_rooms using ((EXISTS ( SELECT 1 FROM meet_room_members m WHERE ((m.meet_room_id = meet_rooms.id) AND (m.user_id = auth.uid())))));
--| alter policy "Authenticated users see cohosts" on public.meet_room_cohosts using (true);
--| alter policy "Authenticated users see guest requests" on public.meet_guest_requests using (true);
--| revoke select (id, meet_room_id, guest_name, status, created_at, decided_at, decided_by, left_at) on public.meet_guest_requests from authenticated;
--| grant select on public.meet_guest_requests to anon, authenticated;
--| alter policy meeting_recordings_select on public.meeting_recordings using (((deleted_at IS NULL) AND ((started_by = auth.uid()) OR (EXISTS ( SELECT 1 FROM meeting_recording_recipients r WHERE ((r.recording_id = meeting_recordings.id) AND (r.user_id = auth.uid())))) OR has_role(auth.uid(), 'admin'::text) OR has_grabaciones_global_scope(auth.uid()) OR (has_grabaciones_team_scope(auth.uid()) AND (actor_level(started_by) < actor_level(auth.uid()))))));
--| alter policy meeting_recordings_update on public.meeting_recordings using (((started_by = auth.uid()) OR has_role(auth.uid(), 'admin'::text))) with check (((started_by = auth.uid()) OR has_role(auth.uid(), 'admin'::text)));
--| alter policy meeting_recording_recipients_select on public.meeting_recording_recipients using (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::text)));
--| drop function public.meet_reuniones_de_mi_agencia();
--| drop function public.grabaciones_de_mi_agencia();
--| drop trigger meet_rooms_agencia on public.meet_rooms;
--| drop trigger meet_room_members_misma_agencia on public.meet_room_members;
--| drop trigger meet_room_cohosts_misma_agencia on public.meet_room_cohosts;
--| drop trigger meet_guest_requests_misma_agencia on public.meet_guest_requests;
--| drop trigger calls_agencia on public.calls;
--| drop trigger call_participants_agencia on public.call_participants;
--| drop trigger meeting_recordings_agencia on public.meeting_recordings;
--| drop trigger meeting_recording_recipients_misma_agencia on public.meeting_recording_recipients;
--| drop function public.meet_rooms_agencia();
--| drop function public.meet_misma_agencia();
--| drop function public.calls_agencia();
--| drop function public.call_participants_agencia();
--| drop function public.meeting_recordings_agencia();
--| drop function public.grabacion_misma_agencia();
--| alter table public.meeting_recordings drop column tenant_id;
--| alter table public.calls drop column tenant_id;
--| alter table public.meet_rooms drop column tenant_id;

-- Si alguien tiene tomada una de estas tablas, mejor fallar que dejar a todos
-- esperando detrás del ALTER TABLE.
set local lock_timeout = '5s';

do $$
begin
  if (select count(*) from public.tenants) <> 1 then
    raise exception 'meet_por_agencia: se aplica con UNA sola agencia (hay %): las filas de hoy se asignan a esa', (select count(*) from public.tenants);
  end if;
  if to_regprocedure('public.agencia_de_sala_livekit(text)') is null then
    raise exception 'meet_por_agencia: falta 20261001213000_cowork_por_agencia (agencia_de_sala_livekit); esta va después';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'chat_conversations' and column_name = 'tenant_id') then
    raise exception 'meet_por_agencia: falta 20260930230000_chat_agencia_y_huecos (chat_conversations.tenant_id); esta va después';
  end if;
end $$;

-- ─── 0. Las funciones que se reemplazan tienen que ser las revisadas ─────────
-- agencia_de_sala_livekit y can_moderate_livekit_room: las que deja
-- 20261001213000_cowork_por_agencia. is_livekit_room_owner: la de prod del 01/10.
create table public.meet_por_agencia_respaldo (fn text primary key, def text not null, guardada timestamptz not null default now());
alter table public.meet_por_agencia_respaldo enable row level security;
revoke all on table public.meet_por_agencia_respaldo from public, anon, authenticated;
comment on table public.meet_por_agencia_respaldo is
  'Definiciones de antes de 20261003120000_meet_livekit_por_agencia, para su vuelta atrás. Sin políticas.';

do $$
declare
  r record;
  h text;
begin
  for r in select * from (values
    ('public.agencia_de_sala_livekit(text)', '2f3a884f46fe4902004e9aab90cbf995'),
    ('public.can_moderate_livekit_room(uuid,text)', '0637069af36e75d3c459ce5b30af5baf'),
    ('public.is_livekit_room_owner(uuid,text)', '465987ac81786532ecfd4b6d9b46dd14')
  ) as x(fn, huella) loop
    select md5(p.prosrc) into h from pg_proc p where p.oid = r.fn::regprocedure;
    if h is distinct from r.huella then
      raise exception 'meet_por_agencia: % no es la que se revisó (huella %, se esperaba %): mirar qué cambió antes de aplicar', r.fn, h, r.huella;
    end if;
    insert into public.meet_por_agencia_respaldo (fn, def) values (r.fn, pg_get_functiondef(r.fn::regprocedure));
  end loop;
end $$;

-- ─── 1. La agencia de las reuniones, las llamadas y las grabaciones ─────────
-- Default constante: desde PG 11 queda en el catálogo (attmissingval), sin
-- reescribir filas ni disparar triggers ni Realtime. La FK solo lee. Después se
-- saca el default: las filas nuevas las llenan los triggers de abajo.
do $$
declare
  v_agencia uuid := (select id from public.tenants);
begin
  execute format('alter table public.meet_rooms add column tenant_id uuid not null default %L references public.tenants(id)', v_agencia);
  execute format('alter table public.calls add column tenant_id uuid not null default %L references public.tenants(id)', v_agencia);
  execute format('alter table public.meeting_recordings add column tenant_id uuid not null default %L references public.tenants(id)', v_agencia);
end $$;
alter table public.meet_rooms alter column tenant_id drop default;
alter table public.calls alter column tenant_id drop default;
alter table public.meeting_recordings alter column tenant_id drop default;

create index meet_rooms_agencia_idx on public.meet_rooms (tenant_id);
create index meeting_recordings_agencia_idx on public.meeting_recordings (tenant_id, started_at desc) where deleted_at is null;

comment on column public.meet_rooms.tenant_id is
  'La agencia de la reunión: la de quien la crea (la pone meet_rooms_agencia). No se cambia.';
comment on column public.calls.tenant_id is
  'La agencia de la llamada: la de quien llama, que es la de la conversación (la pone calls_agencia). No se cambia.';
comment on column public.meeting_recordings.tenant_id is
  'La agencia de la grabación: la de la sala grabada, que tiene que ser la de quien graba (la pone meeting_recordings_agencia). No se cambia.';

-- ─── 2. Reuniones de Meet ────────────────────────────────────────────────────
create function public.meet_rooms_agencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_del_creador uuid;
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id
       or new.created_by is distinct from old.created_by
       or new.livekit_room_name is distinct from old.livekit_room_name then
      raise exception 'meet_rooms_agencia: la agencia, quien la creó y la sala de una reunión no cambian' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.livekit_room_name is null or new.livekit_room_name not like 'meet\_%' then
    raise exception 'meet_rooms_agencia: la sala de una reunión de Meet se llama meet_…' using errcode = '23514';
  end if;
  v_del_creador := (select tm.tenant_id from public.tenant_members tm where tm.user_id = new.created_by);
  if v_del_creador is null then
    raise exception 'meet_rooms_agencia: % no es de ninguna agencia, no puede crear reuniones', new.created_by using errcode = '42501';
  end if;
  if new.tenant_id is null then
    new.tenant_id := v_del_creador;
  elsif new.tenant_id <> v_del_creador then
    raise exception 'meet_rooms_agencia: la reunión tiene que ser de la agencia de quien la crea' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger meet_rooms_agencia
  before insert or update of tenant_id, created_by, livekit_room_name on public.meet_rooms
  for each row execute function public.meet_rooms_agencia();

-- Los argumentos son las columnas que nombran a una persona (las que no son
-- NULL tienen que ser de la agencia de la reunión). Si la reunión no existe,
-- decide la clave foránea.
create function public.meet_misma_agencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_col text;
  v_persona uuid;
  v_de_la_reunion uuid;
begin
  select mr.tenant_id into v_de_la_reunion from public.meet_rooms mr where mr.id = new.meet_room_id;
  if v_de_la_reunion is null then
    return new;
  end if;
  foreach v_col in array tg_argv loop
    v_persona := (to_jsonb(new) ->> v_col)::uuid;
    continue when v_persona is null;
    if not exists (select 1 from public.tenant_members tm where tm.user_id = v_persona and tm.tenant_id = v_de_la_reunion) then
      raise exception 'meet_misma_agencia: % no es de la agencia de la reunión % (%.%)', v_persona, new.meet_room_id, tg_table_name, v_col
        using errcode = '42501', hint = 'Alguien de otra agencia entra a una reunión como invitado, por la sala de espera.';
    end if;
  end loop;
  return new;
end $$;

create trigger meet_room_members_misma_agencia before insert or update of meet_room_id, user_id on public.meet_room_members
  for each row execute function public.meet_misma_agencia('user_id');
create trigger meet_room_cohosts_misma_agencia before insert or update of meet_room_id, user_id, granted_by on public.meet_room_cohosts
  for each row execute function public.meet_misma_agencia('user_id', 'granted_by');
create trigger meet_guest_requests_misma_agencia before insert or update of meet_room_id, decided_by on public.meet_guest_requests
  for each row execute function public.meet_misma_agencia('decided_by');

-- Las reuniones de la agencia de quien llama. SECURITY DEFINER y conjunto, como
-- cowork_sesiones_de_mi_agencia: dentro de una política se calcula una vez.
create function public.meet_reuniones_de_mi_agencia()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select mr.id from public.meet_rooms mr where mr.tenant_id = public.current_tenant_id()
$$;

comment on function public.meet_reuniones_de_mi_agencia() is
  'Los id de las reuniones de Meet de la agencia de quien llama. Para políticas.';

alter policy "Creator sees own meet rooms" on public.meet_rooms
  using (created_by = (select auth.uid()) and tenant_id = (select public.current_tenant_id()));
alter policy "Members see meet rooms" on public.meet_rooms
  using (tenant_id = (select public.current_tenant_id())
         and exists (select 1 from public.meet_room_members m
                     where m.meet_room_id = meet_rooms.id and m.user_id = (select auth.uid())));
alter policy "Authenticated users see cohosts" on public.meet_room_cohosts
  using (meet_room_id in (select public.meet_reuniones_de_mi_agencia()));
alter policy "Authenticated users see guest requests" on public.meet_guest_requests
  using (meet_room_id in (select public.meet_reuniones_de_mi_agencia()));

-- M1: el secreto del invitado (y el hash de su IP) no salen por la API. Solo
-- service_role (meet-guest) los lee. Lo que lee MeetGuestGate sigue legible.
revoke select on public.meet_guest_requests from anon, authenticated;
grant select (id, meet_room_id, guest_name, status, created_at, decided_at, decided_by, left_at)
  on public.meet_guest_requests to authenticated;

-- ─── 3. Llamadas del Messenger ───────────────────────────────────────────────
create function public.calls_agencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_de_quien_llama uuid;
  v_de_la_conversacion uuid;
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id
       or new.caller_id is distinct from old.caller_id
       or new.receiver_id is distinct from old.receiver_id
       or new.room_id is distinct from old.room_id
       -- La conversación solo puede pasar a NULL: es la FK (ON DELETE SET NULL).
       or (new.conversation_id is distinct from old.conversation_id and new.conversation_id is not null) then
      raise exception 'calls_agencia: quién llama, a quién, la sala, la conversación y la agencia de una llamada no cambian' using errcode = '42501';
    end if;
    return new;
  end if;

  v_de_quien_llama := (select tm.tenant_id from public.tenant_members tm where tm.user_id = new.caller_id);
  if v_de_quien_llama is null then
    raise exception 'calls_agencia: % no es de ninguna agencia, no puede llamar', new.caller_id using errcode = '42501';
  end if;
  if new.tenant_id is null then
    new.tenant_id := v_de_quien_llama;
  elsif new.tenant_id <> v_de_quien_llama then
    raise exception 'calls_agencia: la llamada tiene que ser de la agencia de quien llama' using errcode = '42501';
  end if;
  -- La sala de una llamada es la de su conversación (useVideoCall): así nadie
  -- se adueña de la sala de una llamada ajena insertando una fila con ella.
  if new.conversation_id is null or new.room_id is distinct from 'call-' || new.conversation_id::text then
    raise exception 'calls_agencia: la sala de una llamada es call-<id de su conversación>' using errcode = '23514';
  end if;
  v_de_la_conversacion := (select c.tenant_id from public.chat_conversations c where c.id = new.conversation_id);
  if v_de_la_conversacion is distinct from v_de_quien_llama then
    raise exception 'calls_agencia: la conversación no es de la agencia de quien llama' using errcode = '42501';
  end if;
  if not exists (select 1 from public.chat_participants p where p.conversation_id = new.conversation_id and p.user_id = new.caller_id) then
    raise exception 'calls_agencia: quien llama no está en la conversación' using errcode = '42501';
  end if;
  if new.receiver_id is not null
     and not exists (select 1 from public.tenant_members tm where tm.user_id = new.receiver_id and tm.tenant_id = v_de_quien_llama) then
    raise exception 'calls_agencia: % no es de la agencia de quien llama', new.receiver_id using errcode = '42501';
  end if;
  return new;
end $$;

create trigger calls_agencia
  before insert or update of tenant_id, caller_id, receiver_id, conversation_id, room_id on public.calls
  for each row execute function public.calls_agencia();

create function public.call_participants_agencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_de_la_llamada uuid;
begin
  if tg_op = 'UPDATE' then
    if new.call_id is distinct from old.call_id or new.user_id is distinct from old.user_id then
      raise exception 'call_participants_agencia: una participación no cambia de llamada ni de persona' using errcode = '42501';
    end if;
    return new;
  end if;
  select c.tenant_id into v_de_la_llamada from public.calls c where c.id = new.call_id;
  if v_de_la_llamada is null then
    return new;   -- no existe: decide la FK
  end if;
  if not exists (select 1 from public.tenant_members tm where tm.user_id = new.user_id and tm.tenant_id = v_de_la_llamada) then
    raise exception 'call_participants_agencia: % no es de la agencia de la llamada %', new.user_id, new.call_id using errcode = '42501';
  end if;
  return new;
end $$;

create trigger call_participants_agencia
  before insert or update of call_id, user_id on public.call_participants
  for each row execute function public.call_participants_agencia();

-- ─── 4. Grabaciones ──────────────────────────────────────────────────────────
create function public.meeting_recordings_agencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_de_quien_graba uuid;
  v_de_la_sala uuid;
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id
       or new.room_name is distinct from old.room_name
       -- started_by solo puede pasar a NULL: es la FK (ON DELETE SET NULL).
       or (new.started_by is distinct from old.started_by and new.started_by is not null) then
      raise exception 'meeting_recordings_agencia: la agencia, la sala y quien grabó no cambian' using errcode = '42501';
    end if;
    return new;
  end if;
  v_de_quien_graba := (select tm.tenant_id from public.tenant_members tm where tm.user_id = new.started_by);
  if v_de_quien_graba is null then
    raise exception 'meeting_recordings_agencia: % no es de ninguna agencia, no puede grabar', new.started_by using errcode = '42501';
  end if;
  v_de_la_sala := public.agencia_de_sala_livekit(new.room_name);
  if v_de_la_sala is distinct from v_de_quien_graba then
    raise exception 'meeting_recordings_agencia: la sala % no es de la agencia de quien graba', new.room_name using errcode = '42501';
  end if;
  if new.tenant_id is null then
    new.tenant_id := v_de_quien_graba;
  elsif new.tenant_id <> v_de_quien_graba then
    raise exception 'meeting_recordings_agencia: la grabación tiene que ser de la agencia de su sala' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger meeting_recordings_agencia
  before insert or update of tenant_id, room_name, started_by on public.meeting_recordings
  for each row execute function public.meeting_recordings_agencia();

create function public.grabacion_misma_agencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_de_la_grabacion uuid;
begin
  select r.tenant_id into v_de_la_grabacion from public.meeting_recordings r where r.id = new.recording_id;
  if v_de_la_grabacion is null then
    return new;   -- no existe: decide la FK
  end if;
  if not exists (select 1 from public.tenant_members tm where tm.user_id = new.user_id and tm.tenant_id = v_de_la_grabacion) then
    raise exception 'grabacion_misma_agencia: % no es de la agencia de la grabación %', new.user_id, new.recording_id
      using errcode = '42501', hint = 'Una grabación se comparte solo con gente de su agencia.';
  end if;
  return new;
end $$;

create trigger meeting_recording_recipients_misma_agencia
  before insert or update of recording_id, user_id on public.meeting_recording_recipients
  for each row execute function public.grabacion_misma_agencia();

-- Las grabaciones de la agencia de quien llama. SECURITY DEFINER: la política de
-- destinatarios no puede mirar meeting_recordings por RLS (su política mira
-- destinatarios: 42P17, 20260822010000).
create function public.grabaciones_de_mi_agencia()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select r.id from public.meeting_recordings r where r.tenant_id = public.current_tenant_id()
$$;

comment on function public.grabaciones_de_mi_agencia() is
  'Los id de las grabaciones de la agencia de quien llama. Para políticas.';

alter policy meeting_recordings_select on public.meeting_recordings
  using ((deleted_at is null)
         and (tenant_id = (select public.current_tenant_id()))
         and ((started_by = auth.uid())
              or (exists (select 1 from public.meeting_recording_recipients r
                          where r.recording_id = meeting_recordings.id and r.user_id = auth.uid()))
              or has_role(auth.uid(), 'admin'::text)
              or has_grabaciones_global_scope(auth.uid())
              or (has_grabaciones_team_scope(auth.uid()) and (actor_level(started_by) < actor_level(auth.uid())))));
alter policy meeting_recordings_update on public.meeting_recordings
  using (((started_by = auth.uid()) or has_role(auth.uid(), 'admin'::text)) and tenant_id = (select public.current_tenant_id()))
  with check (((started_by = auth.uid()) or has_role(auth.uid(), 'admin'::text)) and tenant_id = (select public.current_tenant_id()));
alter policy meeting_recording_recipients_select on public.meeting_recording_recipients
  using ((user_id = auth.uid())
         or (has_role(auth.uid(), 'admin'::text) and recording_id in (select public.grabaciones_de_mi_agencia())));

-- ─── 5. De quién es cada sala de LiveKit, y quién la modera ─────────────────
CREATE OR REPLACE FUNCTION public.agencia_de_sala_livekit(_room text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    -- Las salas de Cowork llevan los 8 primeros caracteres del id de su sesión:
    -- cowork_hub_<s>, cowork_<s>_<n>, cowork_meet_<s>_<m>, cowork_1on1_<s>_<r>.
    -- Por el prefijo se encuentra también una sala ya cerrada (closeRoom borra la
    -- fila de cowork_rooms y la sala de LiveKit puede seguir viva un rato).
    when _room like 'cowork\_%' then (
      select case when count(distinct s.tenant_id) = 1 then min(s.tenant_id::text)::uuid end
      from public.cowork_sessions s
      where left(s.id::text, 8) = substring(_room from '^cowork_(?:hub_|meet_|1on1_)?([0-9a-f]{8})'))
    -- Meet: la agencia de la reunión (20261003120000; antes, la de quien la creó).
    when _room like 'meet\_%' then (
      select mr.tenant_id from public.meet_rooms mr where mr.livekit_room_name = _room)
    -- Llamadas del Messenger: la sala es call-<id de la conversación>, también las
    -- de grupo, que no tienen fila en calls (20261003120000). Si la conversación
    -- ya no existe, la de sus llamadas, si es una sola.
    when _room like 'call-%' then coalesce(
      (select c.tenant_id from public.chat_conversations c
        where c.id = (substring(_room from '^call-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'))::uuid),
      (select case when count(distinct k.tenant_id) = 1 then min(k.tenant_id::text)::uuid end
       from public.calls k where k.room_id = _room))
  end
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

  -- Nadie modera una sala que no es de su agencia (20261003120000): ni un admin,
  -- ni el anfitrión, ni «el que llamó». Una sala que no es de ninguna, nadie.
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = _user_id AND tm.tenant_id = public.agencia_de_sala_livekit(_room)
  ) THEN
    RETURN false;
  END IF;

  -- Un admin modera las salas de SU agencia (20261001213000); antes, cualquiera.
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

CREATE OR REPLACE FUNCTION public.is_livekit_room_owner(_user_id uuid, _room text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL OR _room IS NULL THEN false
    -- Dueño solo de una sala de su agencia (20261003120000).
    WHEN NOT EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = _user_id AND tm.tenant_id = public.agencia_de_sala_livekit(_room)
    ) THEN false
    WHEN _room LIKE 'meet\_%' THEN EXISTS (
      SELECT 1 FROM public.meet_rooms mr
      WHERE mr.livekit_room_name = _room AND mr.created_by = _user_id
    )
    WHEN _room LIKE 'call-%' THEN EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.room_id = _room AND c.caller_id = _user_id
    )
    ELSE false
  END;
$function$;

-- ─── 6. Quién ejecuta qué ────────────────────────────────────────────────────
-- CREATE OR REPLACE conserva los grants; las funciones nuevas nacen ejecutables
-- por PUBLIC y anon (default privileges de Supabase): se cierran a mano.
revoke execute on function public.can_moderate_livekit_room(uuid, text) from public, anon;
grant execute on function public.can_moderate_livekit_room(uuid, text) to authenticated, service_role;

revoke all on function public.meet_reuniones_de_mi_agencia() from public, anon;
grant execute on function public.meet_reuniones_de_mi_agencia() to authenticated, service_role;
revoke all on function public.grabaciones_de_mi_agencia() from public, anon;
grant execute on function public.grabaciones_de_mi_agencia() to authenticated, service_role;

-- Las funciones de trigger no las llama nadie: corren solas.
revoke all on function public.meet_rooms_agencia() from public, anon, authenticated;
revoke all on function public.meet_misma_agencia() from public, anon, authenticated;
revoke all on function public.calls_agencia() from public, anon, authenticated;
revoke all on function public.call_participants_agencia() from public, anon, authenticated;
revoke all on function public.meeting_recordings_agencia() from public, anon, authenticated;
revoke all on function public.grabacion_misma_agencia() from public, anon, authenticated;
