-- ════════════════════════════════════════════════════════════════════════════
-- Fixture complementario: lo que la escritura del Messenger por API (PR 2) toca y el
-- fixture del 28/09 (prod_chat_api_20260928.sql) no trae, tal como estaba en PROD el
-- 01/10/2026 (proyecto lsagslbkliprespbyhts, PostgreSQL 17.6). SIN DATOS. Se carga
-- DESPUÉS de prod_chat_api_20260928.sql.
--
-- Sale de consultas de catálogo de solo lectura (MCP execute_sql), las mismas del
-- fixture del 28/09. Las funciones salen de la última migración del repo que las
-- define (con el cambio de 20260929180000_funciones_sin_voseo) y su md5(prosrc) se
-- comparó con el de prod: iguales, salvo get_karma_profile, que en prod NO es la del
-- repo (20260903020000_karma_profile_correo.sql da c7bcc7ae…): va el cuerpo de prod.
--
-- Huellas de prod del 01/10 (md5). El banco api_messenger_escritura.ts las recalcula
-- y FALLA si alguna no coincide: este archivo no se toca a mano.
--   md5(prosrc):
--     public.api_key_consumir=353a899e0a2f28ae9226fad2e84e389a
--     public.api_key_persona_vigente=79d7d3ca85cad5b23e98c6cfed848a43
--     public.api_key_vigente=c53e84af8ec52fe34be55119b9c74d34
--     public.api_keys_actua_como_inmutable=3e675e6e49b9fcaa966bb3f9edfcf047
--     public.api_keys_agencia_inmutable=a58c655962368de90c29b5f2c07152e7
--     public.api_keys_asignar_agencia=58dce6ca6fdf6ab4c639b94965e26c9f
--     public.api_keys_reglas_messenger=5201625d15227803a5514ce235bde6ce
--     public.api_keys_validar_actua_como=4ae306899ead0410e4bd7a4393751f36
--     public.get_karma_profile=1aa22eb9f32d548fa57475c3032a980e
--   estructura (md5 de columnas, de constraints y de índices, como en el del 28/09):
--     api_keys ee5f5ffb9571c368fa7079da6b9cc3b7 8b85a988a5192cf38d3079af172a163f 22861dc019a8762063b1511ed830cbc1
--     role_groups bbcd61486bff17f4c2b733b580b172d9 bcce753ec0d2ed883c40aa2c75571e10 c257873fe7eb7ed7b2200da8e7e7f427
--   triggers de api_keys (sin api_webhooks_por_llave), md5(string_agg(triggerdef:tgenabled order by tgname)):
--     triggers.api_keys=b1a4db74aeb08afda2becfc809e006bf
--   políticas (mismo md5 que el del 28/09; api_keys tiene RLS y ninguna):
--     politicas.role_groups=8ad8fd481b71aeee0fd6db6f80cb29af
--
-- Lo que la migración B reemplaza o compone, después de que prod aplicó la A
-- (20261001053309 chat_agencia_y_huecos). Son iguales a lo que da el fixture del
-- 28/09 más la migración A del repo: el banco lo comprueba con estas huellas.
--     prod.public.chat_conversations_agencia=787e57cece39c55fd9454120710295cb
--     prod.public.chat_directo_con=313452066ef700d6ce5ff7f93dce3cb0
--     prod.public.chat_llave_de_par=49769291058a59603e499895aa5b5f42
--     prod.public.chat_messages_al_insertar=9824248b010057a7db937de08b8ee335
--     prod.public.chat_participants_agencia=4ab319252e16c352e37d5bf81f620496
--     prod.public.delete_chat_message=e1a4cceb224ee0416b116922d7097238
--     prod.public.delete_conversation_cascade=1f2ecf754525d4935e54f4489517d990
--     prod.public.get_unread_counts=9490ed75b728c9faed25028283c1ec30
--     prod.public.guard_chat_message_update=99844384f6c4cf0f3b0ce15c84617e43
--     prod.public.notify_chat_message=1639124f0eceb111f20b65cfd7c40daf
--     prod.public.profiles_nombre_lo_cambia_un_admin=29de494ebf923e2c5969235e088a589e
--     prod.politicas.chat_messages=6c538aeeb778aa6c553a5d597d345d7e
--     prod.politicas.chat_participants=44c880a65f689155cc420e0674deaf13
--   (las políticas de las otras 10 tablas que cerca la B son las del 28/09: mismas huellas.)
--   Y lo del PR 1b (20261001100000_chat_mensajes_de_sistema del repo; en prod, aplicado
--   el 01/10 como 20261001064806 + 20261001065025), que no cambia nada de lo de arriba:
--     prod.public.chat_evento_sistema=2fee1016fc7dbb5fa79d26a3394294ac
--     prod.public.chat_mensajes_de_sistema=a80c8facfca4c273c36c292de58f5c55
--
-- Lo que NO trae, a propósito (no es del Messenger y dispara fuera de él):
--   · api_keys: el trigger api_webhooks_por_llave (AFTER UPDATE OF revoked_at,
--     scopes: detiene webhooks).
--   · role_groups: trg_role_groups_sync_level y trg_role_groups_updated_at.
--
-- Stubs (NO son de prod): las tablas y la función que lee get_karma_profile fuera del
-- Messenger, con solo las columnas que usa y los tipos de prod (mail_credentials,
-- hubstaff_daily_data, hubstaff_members, qa_calls, qa_closers, karma_sends y
-- has_permission, que aquí da false), y pg_cron (cron.job y schedule/unschedule).
-- ════════════════════════════════════════════════════════════════════════════

set check_function_bodies = off;

-- ─── Stubs ───────────────────────────────────────────────────────────────────
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $f$ insert into cron.job(jobname, schedule, command) values (n, s, c) returning jobid $f$;
create function cron.unschedule(n text) returns boolean language sql as $f$ delete from cron.job where jobname = n returning true $f$;
create table public.mail_credentials (user_id uuid, email_address text, revoked_at timestamp with time zone);
create table public.hubstaff_daily_data (hubstaff_user_id text, date date, tracked_seconds integer, overall_activity integer);
create table public.hubstaff_members (profile_id uuid, hubstaff_user_id text);
create table public.qa_calls (closer_id uuid, call_date date, claude_score integer);
create table public.qa_closers (id uuid, profile_id uuid);
create table public.karma_sends (giver_id uuid, recipient_id uuid);
create function public.has_permission(_user_id uuid, _module text, _submodule text default null) returns boolean
  language sql stable as $f$ select false $f$;

-- ─── Tablas (columnas, defaults y NOT NULL de prod) ─────────────────────────
create table public.api_keys (id uuid default gen_random_uuid() not null, name text not null, key_prefix text not null, key_hash text not null, scopes text[] default '{}'::text[] not null, created_by uuid, created_by_email text, created_at timestamp with time zone default now() not null, last_used_at timestamp with time zone, request_count bigint default 0 not null, expires_at timestamp with time zone, revoked_at timestamp with time zone, revoked_by uuid, ip_whitelist text[] default '{}'::text[] not null, last_four text, tenant_id uuid not null, acts_as_user_id uuid not null, limite_por_hora integer default 1000 not null, ventana_inicio timestamp with time zone, ventana_pedidos integer default 0 not null, limite_por_minuto integer default 60 not null, minuto_inicio timestamp with time zone, minuto_pedidos integer default 0 not null);
create table public.role_groups (role_name text not null, is_admin boolean default false not null, is_manager_or_above boolean default false not null, is_supervisor_or_above boolean default false not null, is_member boolean default true not null, description text, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);

-- ─── PK, UNIQUE, CHECK y FK ──────────────────────────────────────────────────
alter table public.api_keys add constraint api_keys_pkey PRIMARY KEY (id);
alter table public.api_keys add constraint api_keys_key_hash_key UNIQUE (key_hash);
alter table public.api_keys add constraint api_keys_limite_por_hora_check CHECK ((limite_por_hora > 0));
alter table public.api_keys add constraint api_keys_limite_por_minuto_check CHECK ((limite_por_minuto > 0));
alter table public.api_keys add constraint api_keys_acts_as_user_id_fkey FOREIGN KEY (acts_as_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.api_keys add constraint api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.api_keys add constraint api_keys_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.api_keys add constraint api_keys_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table public.role_groups add constraint role_groups_pkey PRIMARY KEY (role_name);

-- ─── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX api_keys_tenant_id_idx ON public.api_keys USING btree (tenant_id);
CREATE INDEX api_keys_key_hash_idx ON public.api_keys USING btree (key_hash);

-- ─── RLS y grants de tabla (relacl de prod) ─────────────────────────────────
alter table public.api_keys enable row level security;
alter table public.role_groups enable row level security;
revoke all on table public.api_keys from anon, authenticated;

-- ─── Funciones (cuerpos de prod) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.api_key_consumir(_id uuid)
 RETURNS TABLE(permitido boolean, limite integer, restantes integer, reinicio timestamp with time zone, actua_como uuid, usuario_activo boolean, limite_minuto integer, motivo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _hora   timestamptz := date_trunc('hour', now());
  _minuto timestamptz := date_trunc('minute', now());
begin
  -- ⚠️ Las ventanas SOLO avanzan. now() es el del inicio de la transacción: un
  -- pedido que arrancó a las 12:00:59,998 puede escribir DESPUÉS de uno de las
  -- 12:01:00,001. Con "=" y "set = _minuto", el viejo encontraba la ventana 12:01,
  -- la creía distinta, se colaba y la hacía volver a 12:00 con 1 (se perdía la
  -- cuenta del minuto nuevo). Con ">=" y greatest(), el viejo cuenta en la ventana
  -- más nueva y respeta su límite.
  return query
  update public.api_keys k
     set ventana_pedidos = case when k.ventana_inicio >= _hora then k.ventana_pedidos + 1 else 1 end,
         ventana_inicio  = greatest(coalesce(k.ventana_inicio, _hora), _hora),
         minuto_pedidos  = case when k.minuto_inicio >= _minuto then k.minuto_pedidos + 1 else 1 end,
         minuto_inicio   = greatest(coalesce(k.minuto_inicio, _minuto), _minuto),
         request_count   = k.request_count + 1,
         last_used_at    = now()
   where k.id = _id
     and not (coalesce(k.ventana_inicio >= _hora, false) and k.ventana_pedidos >= k.limite_por_hora)
     and not (coalesce(k.minuto_inicio >= _minuto, false) and k.minuto_pedidos >= k.limite_por_minuto)
  returning true,
            k.limite_por_hora,
            greatest(k.limite_por_hora - k.ventana_pedidos, 0),
            k.ventana_inicio + interval '1 hour',
            k.acts_as_user_id,
            public.api_key_persona_vigente(k.acts_as_user_id, k.tenant_id),
            k.limite_por_minuto,
            null::text;
  if found then
    return;
  end if;

  -- Sin cupo (o la llave no existe: cero filas). Solo lectura.
  return query
  select false,
         k.limite_por_hora,
         case when coalesce(k.ventana_inicio >= _hora, false)
              then greatest(k.limite_por_hora - k.ventana_pedidos, 0)
              else k.limite_por_hora end,
         case when coalesce(k.ventana_inicio >= _hora, false) and k.ventana_pedidos >= k.limite_por_hora
              then greatest(k.ventana_inicio, _hora) + interval '1 hour'
              else greatest(coalesce(k.minuto_inicio, _minuto), _minuto) + interval '1 minute' end,
         k.acts_as_user_id,
         public.api_key_persona_vigente(k.acts_as_user_id, k.tenant_id),
         k.limite_por_minuto,
         case when coalesce(k.ventana_inicio >= _hora, false) and k.ventana_pedidos >= k.limite_por_hora
              then 'hora' else 'minuto' end
    from public.api_keys k
   where k.id = _id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.api_key_persona_vigente(_usuario uuid, _agencia uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.profiles p where p.id = _usuario and p.deleted_at is null)
     and not exists (select 1 from auth.users u where u.id = _usuario and u.banned_until > now())
     and exists (select 1 from public.tenant_members tm
                  where tm.user_id = _usuario and tm.tenant_id = _agencia);
$function$;

CREATE OR REPLACE FUNCTION public.api_key_vigente(_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.api_key_persona_vigente(k.acts_as_user_id, k.tenant_id)
    from public.api_keys k
   where k.id = _id;
$function$;

CREATE OR REPLACE FUNCTION public.api_keys_actua_como_inmutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.acts_as_user_id is distinct from old.acts_as_user_id then
    raise exception 'api_keys: una llave no puede cambiar de identidad; crea otra';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.api_keys_agencia_inmutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'api_keys: una llave no puede cambiar de agencia';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.api_keys_asignar_agencia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n int;
begin
  if new.created_by is null then
    raise exception 'api_keys: una llave tiene que tener creador para saber de qué agencia es';
  end if;

  if new.tenant_id is not null then
    -- Viene explícita: tiene que ser una agencia de quien la crea.
    if not exists (
      select 1 from public.tenant_members
       where user_id = new.created_by and tenant_id = new.tenant_id
    ) then
      raise exception 'api_keys: la agencia indicada no es una agencia de quien crea la llave';
    end if;
    return new;
  end if;

  select count(*) into n from public.tenant_members where user_id = new.created_by;
  if n = 0 then
    raise exception 'api_keys: quien crea la llave no pertenece a ninguna agencia';
  elsif n > 1 then
    -- Adivinar acá es justo cómo se termina entregando la agencia equivocada.
    raise exception 'api_keys: quien crea la llave pertenece a varias agencias; hay que indicar tenant_id';
  end if;

  select tenant_id into new.tenant_id
    from public.tenant_members where user_id = new.created_by;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.api_keys_reglas_messenger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _tiene boolean := exists (select 1 from unnest(new.scopes) s where s like 'messenger:%');
  _tenia boolean := tg_op = 'UPDATE' and exists (select 1 from unnest(old.scopes) s where s like 'messenger:%');
begin
  if not _tiene then
    return new;
  end if;
  if tg_op = 'UPDATE' and not _tenia then
    raise exception 'api_keys: el permiso de Messenger solo se puede poner al crear una llave nueva';
  end if;
  -- Lee las conversaciones de QUIEN LA CREA, nunca las de otra persona. coalesce:
  -- este trigger corre antes que api_keys_validar_actua_como (orden alfabético), que
  -- es el que completa acts_as_user_id con created_by cuando viene vacío.
  if tg_op = 'INSERT' and coalesce(new.acts_as_user_id, new.created_by) is distinct from new.created_by then
    raise exception 'api_keys: una llave con Messenger lee las conversaciones de quien la crea, no las de otra persona';
  end if;
  if coalesce(cardinality(new.ip_whitelist), 0) = 0 then
    raise exception 'api_keys: una llave con Messenger necesita IPs fijas';
  end if;
  if exists (select 1 from unnest(new.ip_whitelist) ip where ip like '%/%') then
    raise exception 'api_keys: una llave con Messenger va con IPs exactas, sin rangos';
  end if;
  if new.expires_at is null then
    raise exception 'api_keys: una llave con Messenger necesita fecha de vencimiento';
  end if;
  if tg_op = 'INSERT' and (new.expires_at <= now() or new.expires_at > now() + interval '90 days') then
    raise exception 'api_keys: una llave con Messenger vence en el futuro y a 90 días como máximo';
  end if;
  if tg_op = 'UPDATE' and new.expires_at > old.expires_at then
    raise exception 'api_keys: a una llave con Messenger no se le extiende el vencimiento; crea otra';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.api_keys_validar_actua_como()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.acts_as_user_id is null then
    new.acts_as_user_id := new.created_by;
  end if;
  if new.acts_as_user_id is null then
    raise exception 'api_keys: una llave tiene que actuar como un usuario';
  end if;
  if not exists (
    select 1 from public.tenant_members
     where user_id = new.acts_as_user_id and tenant_id = new.tenant_id
  ) then
    raise exception 'api_keys: la llave no puede actuar como alguien de otra agencia';
  end if;
  if not exists (
    select 1 from public.profiles where id = new.acts_as_user_id and deleted_at is null
  ) or exists (
    select 1 from auth.users where id = new.acts_as_user_id and banned_until > now()
  ) then
    raise exception 'api_keys: el usuario como el que actúa la llave no está activo';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_karma_profile(target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller   uuid := auth.uid();
  v_is_admin boolean;
  v_role text; v_role_label text;
  v_name text; v_avatar text; v_seed text; v_created timestamptz;
  v_email text; v_viewer_can_mail boolean := false;
  s_constancia boolean := false;
  s_actividad boolean := false;
  s_productividad boolean := false;
  s_rendimiento boolean := false;
  s_companerismo boolean := false;
  v_sent int := 0; v_recv int := 0; v_active_days int := 0;
  v_hub_act int := null; v_hub_hours numeric := null;
  v_givers int := 0; v_eligible int := 0; v_vote_pct int := 0;
  v_viewer_sent boolean := false;
  v_special boolean := false;
  v_stars_count int := 0;
  result jsonb;
begin
  v_is_admin := exists (
    select 1 from user_roles ur
    join role_groups rg on rg.role_name = ur.role
    where ur.user_id = v_caller and rg.is_admin = true
  );

  select full_name, avatar_url, avatar_seed, created_at
    into v_name, v_avatar, v_seed, v_created
  from profiles where id = target;
  if not found then
    return jsonb_build_object('error','not_found');
  end if;

  select coalesce(
    (select c.email_address from mail_credentials c where c.user_id = target and c.revoked_at is null limit 1),
    (select u.email from auth.users u where u.id = target)
  ) into v_email;

  v_viewer_can_mail :=
    exists (select 1 from mail_credentials c where c.user_id = v_caller and c.revoked_at is null)
    and public.has_permission(v_caller, 'Correo');

  select role into v_role from user_roles where user_id = target limit 1;
  v_role_label := case v_role
    when 'agent' then 'Chatter'
    when 'closer' then 'Closer'
    when 'manager' then 'Manager'
    when 'admin' then 'Admin'
    when 'supervisor' then 'Supervisor'
    when 'employee' then 'Empleado'
    when 'spammer' then 'Warming'
    else coalesce(v_role, 'Miembro')
  end;

  s_constancia := v_created is not null and v_created <= now() - interval '6 months';

  select count(*), count(distinct (created_at at time zone 'UTC')::date)
    into v_sent, v_active_days
  from chat_messages
  where sender_id = target and is_deleted = false and type <> 'system'
    and created_at >= now() - interval '30 days';
  s_actividad := v_sent >= 100 and v_active_days >= 10;

  select count(*) into v_recv
  from chat_messages m
  where m.sender_id <> target and m.is_deleted = false and m.type <> 'system'
    and m.created_at >= now() - interval '30 days'
    and m.conversation_id in (select conversation_id from chat_participants where user_id = target);

  select round(avg(d.overall_activity))::int, round(sum(d.tracked_seconds)/3600.0, 1)
    into v_hub_act, v_hub_hours
  from hubstaff_daily_data d
  join hubstaff_members hm on hm.hubstaff_user_id = d.hubstaff_user_id
  where hm.profile_id = target and d.tracked_seconds > 0
    and d.date >= current_date - 30;
  s_productividad := v_hub_act is not null and v_hub_act >= 65 and coalesce(v_hub_hours,0) >= 40;

  select (avg(qc.claude_score) / 10.0) >= 9 into s_rendimiento
  from qa_calls qc
  join qa_closers qcl on qcl.id = qc.closer_id
  where qcl.profile_id = target
    and qc.claude_score is not null
    and date_trunc('month', qc.call_date) = date_trunc('month', current_date - interval '1 month');
  s_rendimiento := coalesce(s_rendimiento, false);

  select count(distinct user_id) into v_eligible
  from user_roles
  where user_id <> target and role not in ('spammer','Warming');

  select count(*) into v_givers from karma_sends where recipient_id = target;
  v_viewer_sent := exists(select 1 from karma_sends where recipient_id = target and giver_id = v_caller);
  if v_eligible > 0 then v_vote_pct := round(100.0 * v_givers / v_eligible); end if;

  s_companerismo := v_eligible > 0 and v_givers >= ceil(0.20 * v_eligible);
  v_special := v_eligible > 0 and v_givers > 0.70 * v_eligible;

  v_stars_count := s_rendimiento::int + s_actividad::int + s_constancia::int
                 + s_productividad::int + s_companerismo::int;

  result := jsonb_build_object(
    'user_id', target, 'name', v_name, 'avatar_url', v_avatar, 'avatar_seed', v_seed,
    'role', v_role_label,
    'email', v_email, 'viewer_can_mail', v_viewer_can_mail,
    'stars', jsonb_build_object(
      'rendimiento', s_rendimiento, 'actividad', s_actividad, 'constancia', s_constancia,
      'productividad', s_productividad, 'companerismo', s_companerismo
    ),
    'stars_count', v_stars_count, 'special', v_special, 'vote_pct', v_vote_pct,
    'viewer_has_sent', v_viewer_sent, 'is_self', target = v_caller, 'viewer_is_admin', v_is_admin
  );

  if v_is_admin then
    result := result || jsonb_build_object('admin', jsonb_build_object(
      'msgs_sent_30d', v_sent, 'msgs_recv_30d', v_recv, 'active_days_30d', v_active_days,
      'hub_activity_30d', v_hub_act, 'hub_hours_30d', v_hub_hours,
      'karma_givers', v_givers, 'eligible', v_eligible,
      'criteria', jsonb_build_object(
        'rendimiento',   jsonb_build_object('met', s_rendimiento,   'label','Rendimiento',  'rule','QA mensual >= 9'),
        'actividad',     jsonb_build_object('met', s_actividad,     'label','Actividad',    'rule','>= 100 msgs / 30 dias en >= 10 dias'),
        'constancia',    jsonb_build_object('met', s_constancia,    'label','Constancia',   'rule','>= 6 meses en el equipo'),
        'productividad', jsonb_build_object('met', s_productividad, 'label','Productividad','rule','Hubstaff >= 65% act. y >= 40h'),
        'companerismo',  jsonb_build_object('met', s_companerismo,  'label','Companerismo', 'rule','karma de >= 20% del equipo')
      )
    ));
  end if;

  return result;
end;
$function$;

-- ─── Grants de funciones distintos del de por defecto (proacl de prod) ──────
revoke all on function public.api_key_consumir(uuid) from public, anon, authenticated;
revoke all on function public.api_key_persona_vigente(uuid, uuid) from public, anon, authenticated;
revoke all on function public.api_key_vigente(uuid) from public, anon, authenticated;
revoke all on function public.api_keys_actua_como_inmutable() from public, anon, authenticated;
revoke all on function public.api_keys_agencia_inmutable() from public, anon, authenticated;
revoke all on function public.api_keys_asignar_agencia() from public, anon, authenticated;
revoke all on function public.api_keys_reglas_messenger() from public, anon, authenticated;
revoke all on function public.api_keys_validar_actua_como() from public, anon, authenticated;

-- ─── Triggers ────────────────────────────────────────────────────────────────
CREATE TRIGGER api_keys_actua_como_inmutable BEFORE UPDATE OF acts_as_user_id ON public.api_keys FOR EACH ROW EXECUTE FUNCTION api_keys_actua_como_inmutable();
CREATE TRIGGER api_keys_agencia_inmutable BEFORE UPDATE OF tenant_id ON public.api_keys FOR EACH ROW EXECUTE FUNCTION api_keys_agencia_inmutable();
CREATE TRIGGER api_keys_asignar_agencia BEFORE INSERT ON public.api_keys FOR EACH ROW EXECUTE FUNCTION api_keys_asignar_agencia();
CREATE TRIGGER api_keys_reglas_messenger BEFORE INSERT OR UPDATE OF scopes, ip_whitelist, expires_at ON public.api_keys FOR EACH ROW EXECUTE FUNCTION api_keys_reglas_messenger();
CREATE TRIGGER api_keys_validar_actua_como BEFORE INSERT ON public.api_keys FOR EACH ROW EXECUTE FUNCTION api_keys_validar_actua_como();

-- ─── Políticas (qual / with_check como los desarma prod) ────────────────────
create policy "Anyone authenticated can read role_groups" on public.role_groups as permissive for select to authenticated using (true);
create policy "Only admins can modify role_groups" on public.role_groups as permissive for all to authenticated using (is_in_role_group(auth.uid(), 'admin'::text)) with check (is_in_role_group(auth.uid(), 'admin'::text));

reset check_function_bodies;
