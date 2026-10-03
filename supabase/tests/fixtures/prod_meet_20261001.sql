-- ════════════════════════════════════════════════════════════════════════════
-- Volcado del catálogo de PROD (proyecto lsagslbkliprespbyhts) del 01/10/2026,
-- SIN DATOS: Meet, Grabaciones y llamadas del Messenger, para probar Meet y
-- Grabaciones por agencia (supabase/tests/meet_por_agencia.ts). Se carga DESPUÉS
-- de fixtures/prod_roles_20261001.sql y fixtures/prod_cowork_20261001.sql, y
-- reemplaza las tablas mínimas que este último trae para can_moderate_livekit_room.
-- Sacado con pg_get_functiondef, pg_get_constraintdef, pg_get_indexdef,
-- pg_get_triggerdef y pg_policies.
--
-- Las 9 tablas tienen las columnas, defaults, restricciones, índices, políticas
-- y triggers de prod. Las funciones son copia textual; el banco recalcula
-- md5(prosrc) de cada una y lo compara con estas huellas.
--
-- Huellas de prod, md5(prosrc):
--   expire_meeting_recordings()=0021e87adcaf5d46bf9b438fea8f0f14
--   gen_meet_code()=7c4b1adfd4548690529c81298cbca397
--   is_call_creator(_user_id uuid, _call_id uuid)=5f8179c1ebed91d9e92782ef61b2aca1
--   is_call_participant(_user_id uuid, _call_id uuid)=3e651722bf32f0e90b63346e329ac8fe
--   is_livekit_room_owner(_user_id uuid, _room text)=465987ac81786532ecfd4b6d9b46dd14
--   set_recording_expiry()=497f7f2aafd9754a13ba5c2b566300cd
--   tg_meet_rooms_set_code()=2791b81ee293aa90c624bfd73271634a
--
-- Stub (NO es de prod): chat_conversations con id y tenant_id, para la clave
-- foránea de calls.conversation_id.
-- ════════════════════════════════════════════════════════════════════════════

set check_function_bodies = off;

drop table public.calls, public.meet_room_cohosts, public.meet_rooms cascade;

create table public.chat_conversations (id uuid primary key default gen_random_uuid(), tenant_id uuid);

-- ─── Tablas (columnas, defaults y NOT NULL de prod) ─────────────────────────
create sequence public.meet_guest_attempts_id_seq;
create table public.call_participants (id uuid default gen_random_uuid() not null, call_id uuid not null, user_id uuid not null, status text default 'ringing'::text not null, joined_at timestamp with time zone default now());
create table public.calls (id uuid default gen_random_uuid() not null, caller_id uuid not null, receiver_id uuid, conversation_id uuid, call_status text default 'ringing'::text not null, call_type text default 'video'::text not null, is_group boolean default false not null, room_id text not null, start_time timestamp with time zone, end_time timestamp with time zone, created_at timestamp with time zone default now() not null);
create table public.meet_guest_attempts (id bigint default nextval('meet_guest_attempts_id_seq'::regclass) not null, ip_hash text not null, ok boolean default false not null, created_at timestamp with time zone default now() not null);
create table public.meet_guest_requests (id uuid default gen_random_uuid() not null, meet_room_id uuid not null, guest_name text not null, guest_token text not null, ip_hash text, status text default 'pending'::text not null, created_at timestamp with time zone default now() not null, decided_at timestamp with time zone, decided_by uuid, left_at timestamp with time zone);
create table public.meet_room_cohosts (meet_room_id uuid not null, user_id uuid not null, granted_by uuid, created_at timestamp with time zone default now() not null);
create table public.meet_room_members (meet_room_id uuid not null, user_id uuid not null, joined_at timestamp with time zone default now() not null, pinned boolean default false not null, sort_order integer);
create table public.meet_rooms (id uuid default gen_random_uuid() not null, code text not null, name text not null, livekit_room_name text not null, created_by uuid not null, created_at timestamp with time zone default now() not null, status text default 'active'::text not null, ended_at timestamp with time zone);
create table public.meeting_recording_recipients (recording_id uuid not null, user_id uuid not null, notified_at timestamp with time zone);
create table public.meeting_recordings (id uuid default gen_random_uuid() not null, room_name text not null, source text default 'cowork'::text not null, title text, started_by uuid not null, started_at timestamp with time zone default now() not null, ended_at timestamp with time zone, duration_seconds integer, size_bytes bigint, storage_provider text default 'vps'::text not null, storage_key text, status text default 'recording'::text not null, expires_at timestamp with time zone, deleted_at timestamp with time zone, error text, created_at timestamp with time zone default now() not null, egress_id text, sala_vacia_desde timestamp with time zone, sin_iniciador_desde timestamp with time zone, detenida_por text);
alter table public.call_participants enable row level security;
alter table public.calls enable row level security;
alter table public.meet_guest_attempts enable row level security;
alter table public.meet_guest_requests enable row level security;
alter table public.meet_room_cohosts enable row level security;
alter table public.meet_room_members enable row level security;
alter table public.meet_rooms enable row level security;
alter table public.meeting_recording_recipients enable row level security;
alter table public.meeting_recordings enable row level security;

-- ─── Restricciones ───────────────────────────────────────────────────────────
alter table public.call_participants add constraint call_participants_pkey PRIMARY KEY (id);
alter table public.calls add constraint calls_pkey PRIMARY KEY (id);
alter table public.meet_guest_attempts add constraint meet_guest_attempts_pkey PRIMARY KEY (id);
alter table public.meet_guest_requests add constraint meet_guest_requests_guest_token_key UNIQUE (guest_token);
alter table public.meet_guest_requests add constraint meet_guest_requests_pkey PRIMARY KEY (id);
alter table public.meet_guest_requests add constraint meet_guest_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'admitted'::text, 'denied'::text])));
alter table public.meet_room_cohosts add constraint meet_room_cohosts_pkey PRIMARY KEY (meet_room_id, user_id);
alter table public.meet_room_members add constraint meet_room_members_pkey PRIMARY KEY (meet_room_id, user_id);
alter table public.meet_rooms add constraint meet_rooms_livekit_room_name_key UNIQUE (livekit_room_name);
alter table public.meet_rooms add constraint meet_rooms_pkey PRIMARY KEY (id);
alter table public.meet_rooms add constraint meet_rooms_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text])));
alter table public.meeting_recording_recipients add constraint meeting_recording_recipients_pkey PRIMARY KEY (recording_id, user_id);
alter table public.meeting_recordings add constraint meeting_recordings_pkey PRIMARY KEY (id);
alter table public.meeting_recordings add constraint meeting_recordings_source_chk CHECK ((source = ANY (ARRAY['cowork'::text, 'meet'::text])));
alter table public.meeting_recordings add constraint meeting_recordings_status_chk CHECK ((status = ANY (ARRAY['recording'::text, 'processing'::text, 'ready'::text, 'failed'::text, 'deleted'::text])));
alter table public.call_participants add constraint call_participants_call_id_fkey FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE;
alter table public.call_participants add constraint call_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.calls add constraint calls_caller_id_fkey FOREIGN KEY (caller_id) REFERENCES auth.users(id);
alter table public.calls add constraint calls_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE SET NULL;
alter table public.calls add constraint calls_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id);
alter table public.meet_guest_requests add constraint meet_guest_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id);
alter table public.meet_guest_requests add constraint meet_guest_requests_meet_room_id_fkey FOREIGN KEY (meet_room_id) REFERENCES meet_rooms(id) ON DELETE CASCADE;
alter table public.meet_room_cohosts add constraint meet_room_cohosts_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id);
alter table public.meet_room_cohosts add constraint meet_room_cohosts_meet_room_id_fkey FOREIGN KEY (meet_room_id) REFERENCES meet_rooms(id) ON DELETE CASCADE;
alter table public.meet_room_cohosts add constraint meet_room_cohosts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.meet_room_members add constraint meet_room_members_meet_room_id_fkey FOREIGN KEY (meet_room_id) REFERENCES meet_rooms(id) ON DELETE CASCADE;
alter table public.meet_room_members add constraint meet_room_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.meet_rooms add constraint meet_rooms_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.meeting_recording_recipients add constraint meeting_recording_recipients_recording_id_fkey FOREIGN KEY (recording_id) REFERENCES meeting_recordings(id) ON DELETE CASCADE;
alter table public.meeting_recording_recipients add constraint meeting_recording_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.meeting_recordings add constraint meeting_recordings_started_by_fkey FOREIGN KEY (started_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_call_participants_call_id ON public.call_participants USING btree (call_id);
CREATE INDEX idx_call_participants_user_id ON public.call_participants USING btree (user_id);
CREATE INDEX idx_calls_caller_id ON public.calls USING btree (caller_id);
CREATE INDEX idx_calls_conversation_id ON public.calls USING btree (conversation_id);
CREATE INDEX idx_calls_receiver_id ON public.calls USING btree (receiver_id);
CREATE INDEX idx_meet_guest_attempts_ip ON public.meet_guest_attempts USING btree (ip_hash, created_at DESC);
CREATE INDEX idx_meet_guest_requests_pending ON public.meet_guest_requests USING btree (meet_room_id) WHERE (status = 'pending'::text);
CREATE INDEX idx_meet_guest_requests_room ON public.meet_guest_requests USING btree (meet_room_id, created_at DESC);
CREATE INDEX idx_meet_room_members_user ON public.meet_room_members USING btree (user_id, pinned DESC, sort_order, joined_at DESC);
CREATE INDEX idx_meet_rooms_creator_active ON public.meet_rooms USING btree (created_by, created_at DESC) WHERE (status = 'active'::text);
CREATE INDEX meeting_recordings_egress_idx ON public.meeting_recordings USING btree (egress_id) WHERE (egress_id IS NOT NULL);
CREATE INDEX meeting_recordings_expiry_idx ON public.meeting_recordings USING btree (expires_at) WHERE (deleted_at IS NULL);
CREATE INDEX meeting_recordings_started_by_idx ON public.meeting_recordings USING btree (started_by, started_at DESC) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX uq_meet_rooms_code ON public.meet_rooms USING btree (code);

-- ─── Funciones (copia textual de prod) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_meeting_recordings()
 RETURNS TABLE(id uuid, storage_key text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.id, r.storage_key
  FROM public.meeting_recordings r
  WHERE r.deleted_at IS NULL
    AND r.expires_at IS NOT NULL
    AND r.expires_at < now()
    AND r.status = 'ready'
  ORDER BY r.expires_at
  LIMIT 200;
$function$;

CREATE OR REPLACE FUNCTION public.gen_meet_code()
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
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.meet_rooms WHERE code = candidate);
  END LOOP;
  RETURN candidate;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_call_creator(_user_id uuid, _call_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.calls
    WHERE id = _call_id AND caller_id = _user_id
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_call_participant(_user_id uuid, _call_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.call_participants
    WHERE user_id = _user_id AND call_id = _call_id
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_livekit_room_owner(_user_id uuid, _room text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL OR _room IS NULL THEN false
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

CREATE OR REPLACE FUNCTION public.set_recording_expiry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := COALESCE(NEW.started_at, now()) + interval '90 days';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_meet_rooms_set_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := public.gen_meet_code();
  END IF;
  RETURN NEW;
END;
$function$;

-- ─── Grants de funciones como en prod ───────────────────────────────────────
revoke execute on function public.expire_meeting_recordings() from public, anon, authenticated;
revoke execute on function public.gen_meet_code() from public, anon, authenticated;
revoke execute on function public.is_livekit_room_owner(uuid, text) from public, anon;

-- ─── Políticas ───────────────────────────────────────────────────────────────
create policy "Call creators can delete participants" on public.call_participants as permissive for delete to authenticated using (is_call_creator(auth.uid(), call_id));
create policy "Call creators can insert participants" on public.call_participants as permissive for insert to authenticated with check ((is_call_creator(auth.uid(), call_id) OR (user_id = auth.uid())));
create policy "Users can update their own participation" on public.call_participants as permissive for update to authenticated using (((user_id = auth.uid()) OR is_call_creator(auth.uid(), call_id)));
create policy "Users can view their call participations" on public.call_participants as permissive for select to authenticated using (((user_id = auth.uid()) OR is_call_creator(auth.uid(), call_id)));
create policy "Participants can update calls" on public.calls as permissive for update to authenticated using (((caller_id = auth.uid()) OR (receiver_id = auth.uid()) OR is_call_participant(auth.uid(), id)));
create policy "Users can create calls" on public.calls as permissive for insert to authenticated with check ((caller_id = auth.uid()));
create policy "Users can view calls they participate in" on public.calls as permissive for select to authenticated using (((caller_id = auth.uid()) OR (receiver_id = auth.uid()) OR is_call_participant(auth.uid(), id)));
create policy "Authenticated users see guest requests" on public.meet_guest_requests as permissive for select to authenticated using (true);
create policy "Authenticated users see cohosts" on public.meet_room_cohosts as permissive for select to authenticated using (true);
create policy "Own meet memberships" on public.meet_room_members as permissive for select to authenticated using ((user_id = auth.uid()));
create policy "Creator sees own meet rooms" on public.meet_rooms as permissive for select to authenticated using ((created_by = auth.uid()));
create policy "Members see meet rooms" on public.meet_rooms as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM meet_room_members m
  WHERE ((m.meet_room_id = meet_rooms.id) AND (m.user_id = auth.uid())))));
create policy meeting_recording_recipients_select on public.meeting_recording_recipients as permissive for select to authenticated using (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::text)));
create policy meeting_recordings_select on public.meeting_recordings as permissive for select to authenticated using (((deleted_at IS NULL) AND ((started_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM meeting_recording_recipients r
  WHERE ((r.recording_id = meeting_recordings.id) AND (r.user_id = auth.uid())))) OR has_role(auth.uid(), 'admin'::text) OR has_grabaciones_global_scope(auth.uid()) OR (has_grabaciones_team_scope(auth.uid()) AND (actor_level(started_by) < actor_level(auth.uid()))))));
create policy meeting_recordings_update on public.meeting_recordings as permissive for update to authenticated using (((started_by = auth.uid()) OR has_role(auth.uid(), 'admin'::text))) with check (((started_by = auth.uid()) OR has_role(auth.uid(), 'admin'::text)));

-- ─── Triggers ────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_meet_rooms_set_code BEFORE INSERT ON public.meet_rooms FOR EACH ROW EXECUTE FUNCTION tg_meet_rooms_set_code();
CREATE TRIGGER trg_recording_expiry BEFORE INSERT ON public.meeting_recordings FOR EACH ROW EXECUTE FUNCTION set_recording_expiry();
