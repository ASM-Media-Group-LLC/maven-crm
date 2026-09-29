-- ════════════════════════════════════════════════════════════════════════════
-- Fixture: el esquema de PROD del Messenger, tal como estaba el 28/09/2026
-- (proyecto lsagslbkliprespbyhts, PostgreSQL 17.6). SIN DATOS.
--
-- Sale de consultas de catálogo de solo lectura (MCP execute_sql):
--   columnas  → pg_attribute + format_type + pg_get_expr(adbin)
--   CHECK/PK/UNIQUE/FK → pg_get_constraintdef
--   índices   → pg_get_indexdef (los que no vienen de una constraint)
--   triggers  → pg_get_triggerdef
--   funciones → pg_get_functiondef (el cuerpo es prosrc byte a byte)
--   políticas → pg_policies (qual / with_check tal como los desarma prod)
--   grants    → relacl / proacl
--   Realtime  → pg_publication_tables
--
-- Por qué existe: hay tablas, políticas y funciones que se crearon o editaron a
-- mano en prod (20260823160000:5-6). El repo NO es la verdad: por ejemplo, los
-- cuerpos de guard_chat_message_update y delete_chat_message en prod no son byte
-- a byte los de sus migraciones (mismo comportamiento, otro texto), y
-- chat_reactions ya no está en la publicación de Realtime. Los bancos cargan ESTO
-- y después aplican las migraciones reales que todavía no están en prod.
--
-- Huellas de prod del 28/09 (md5). El banco chat_agencia_y_huecos.ts las
-- recalcula sobre la base cargada y FALLA si alguna no coincide: si alguien
-- toca este archivo a mano, o si hay que volver a sacarlo de prod, se nota.
--   md5(prosrc):
--     auth.jwt=2db09c3fc855ba90e71d3ae28cfadae3
--     auth.role=f31486fed08a7402e89d4aa71b0ad273
--     auth.uid=cdef18c69c4f4cbbced2eaf81e628b49
--     public.current_tenant_id=00a55bffb3f8a2b63b65db6a8f6d9584
--     public.delete_chat_message=04e20f8f25fdcba4f1aa1ecf29590fc1
--     public.delete_conversation_cascade=1f2ecf754525d4935e54f4489517d990
--     public.get_last_messages=b3978dee1624e3cf53ce26d949d21a10
--     public.get_mentioned_conversations=b9d0e118740c767c8f271d768001b09f
--     public.get_unread_counts=f05bdef98f03d0cf6646be18873b3f4a
--     public.guard_chat_conversation_meta=04160fc32e18b10e799122d18b1662ac
--     public.guard_chat_conversation_perms=f75b512738ed8e230796d777f795e57c
--     public.guard_chat_message_update=df1a20f7438bc6ff023182931239a0da
--     public.guard_chat_participant_update=fe18a2d866437555e12c67c9c8f3fc6d
--     public.handle_new_user=6f7ff224459a6b23b7f447de571d8b53
--     public.is_chat_admin=a6c3d0f5eb5badd91cbf719efe84fe32
--     public.is_chat_participant=194899e45dfa07fbdde7c4e084c9626b
--     public.is_conversation_creator=4494688cea5dcdc6399926afcec7809a
--     public.is_in_role_group=52c2e225119eed6c6c29b009c56a67fc
--     public.menciona_a=38e72a8b64c2e847123d7c54cbf73432
--     public.messenger_unread_counts=4d00954cffe74acf306d04003cd15be8
--     public.notif_canal_activo=a2d8c2281619ea26b6685c93b449d0cf
--     public.notify_chat_message=1639124f0eceb111f20b65cfd7c40daf
--     public.push_chat_message=115555cdb5f86295e766fc57e56dc7a4
--     public.push_desde_notificacion=23d00da4f99a087e5f4c6a2aab563b8c
--     public.update_updated_at_column=5b733ab523bad442e4b10f836de9e4ba
--     public.user_has_role_name=6db5057c69d953e491c802ce3d2468a2
--     public.validate_notification_fields=a6d6994d5c670cfd39958e0e70617f8c
--   políticas por tabla, md5(string_agg(policyname|permissive|roles|cmd|qual|with_check order by policyname))
--   (user_roles no está: el fixture trae solo una de sus dos políticas):
--     app_flags=6d6522fb47e6c98adb763d9a3d6a8fa3 chat_archived=1a03d768351054a98ddfcbe151479e6a
--     chat_conversations=e7e1889ae41f2ab49ddd369eb476f652 chat_join_requests=cdf3e8969d0b9c822dc31386e4f48cb2
--     chat_message_deletions=ff36159af5ec66c35d1cfda05fdda6b9 chat_messages=ebc158e81b85a49a755dd3f9794b1e2d
--     chat_participants=dc1dcd9c25f44fc5a83eb91da5da895a chat_pinned=19972d99268d775afdfadb172637c704
--     chat_reactions=6ae3779163d470f5c6906977aec7d070 chat_read_receipts=ae4bfe3d78422fc715cac31b57fa3d15
--     chat_space_conversations=44e1c8ad4da07bf99f7053edfe123662 chat_spaces=f5c56d5a50bd12e1a7e568b9ba740048
--     notification_preferences=e39887e5c5efbc241a6c544210d8658f notification_settings=16fe91976ab546c2fc92d04be9af73f8
--     notifications=465582a78e2e4ce7dcd5a2e9e13e7b8c profiles=c2557e9db6870b41531e7046e437ba1c
--     push_subscriptions=7fb313bab317f8928f4d730dce3ea281 tenant_members=10b97e686c7cacd71e681a75d5397dde
--     tenants=0d9b64e8445c66f46ff47b376479a532
--   estructura por tabla: md5 de columnas (string_agg por attnum), de constraints
--   (por conname) y de índices (por pg_get_indexdef):
--     app_flags 489f76213001dca2e0c69a9acec1d901 60ebaab70acdaa743e307909e27408e0 22ac1fe7aa34ace836c920e75b04e820
--     chat_archived ec5fbe44ab758f951909fdfbf6c5c612 28f27cd05603ce46de1fd12ad5c364bc 28aaa5e239333aab764dbbf8bfe88668
--     chat_conversations 02393b7d5dc0bba8957acab2b6bbf9d6 3b4ba4caa7e939817096d3d43184b639 37369f35a91df5a0eb5f9f76094e314c
--     chat_join_requests ab715cab24f1af09dca3897e6da6adc9 433c45f9ebe55da7ea079afcd5b117b9 01a8ff672923df395b88860492fe780c
--     chat_message_deletions e55727a9981350e367cdee2ef30f22d3 424c6041c09b3dbcf0731ad238bb767e c22515e32b3526bbac92f89aa8ecc031
--     chat_messages ab93b6c096b0a881e81e5d0ccc641353 b8937feabf51255befbf2ac9c2a74800 3a49ba6d0064a4b2aeb7d9e1f06dfd8e
--     chat_participants 5ebf1cb4e183a087f63cb8a7b730a43f 92c08a33361bc92eec16b9f1605cd0eb f95c18453270e29d61527e33cbda0e11
--     chat_pinned a17da89a35ffa0709e01693d505951c1 45467e0b7661ad79669708794bddcc28 0999f7ae68b258abec524f10ccd5cb34
--     chat_reactions e629634b6fdad6f2359ee675d052a5fe c809b6a748158be7fdc359fbaa275672 85143ef83535ecec45fa3154b28444a7
--     chat_read_receipts 1ca9eeb5e9a362959abd4d1dd852132a 85d6bd3fc5e0e71a15832e857c7e2ea8 c75012233c90db645a07279bd000b24c
--     chat_space_conversations 2dbd3be08e331022ff4ef9ccc3018001 627175788bd581841168259fd24cee27 0872db071669a22d3e19a68c37229b12
--     chat_spaces 1a65746adb8961aaf12d56dddd6a0dcc 744d9921902ab0a3457c6162d270afe2 255097c508cb3a6fdfb0201720c08296
--     notification_preferences 55b4f928a7172e8b297ebeece6348995 f1ad18565f738aaad6271c00f0529138 cd5b259f1cf22bf5dd93868fd683d684
--     notification_settings 7a9cff60854c80a9de64f6c3ddb64165 34e960c07f7f5a0e28e4daf4ec1df067 85b72ef3b2c208455e9356ad009c3867
--     notifications 49d3ee2875e11898c7f17e6521fdc13d 4fd8f03cd3b0630200fa7f3cbc8df3e6 3107eaf012d0d49ef6c09d95f7fd246d
--     profiles 0c582c7429250f2cdd8a8613271b1580 5be76f3f1b42b39dec742e32fbb639dc 3455f5578ae0b42a2b68fa49a2c687f8
--     push_subscriptions 93851fca26304e90c24a4b2559a70c3c a612b56edf5ac859f4bfccb36f032c55 3103ac9c882a80bedff571c1bc3ba165
--     tenant_members b502a976f58609f909dffaaa71dbfd5b 63084e3811e49cb0b933addbaca578c4 13738a795ad24de855d2b0f7f10c4096
--     tenants 3800e90db855de06bbf612b65d936455 96b1f1d4002bfd8fea1eb6ee8fefd441 0daf19bd3d9ba0ae35eeee522fd9bc17
--     user_roles 0685eff7e99bfe1540160f5eabfb818d d10ed426a96cd6e7b5a53ed55cb75227 3774190c7cf2123d47a3beeb01ae46ca
--   el resto del catálogo, una huella por tema (las consultas exactas están en el
--   banco, en HUELLAS_DE_CATALOGO):
--     catalogo.firma=b59e775a4d0343b66fbf5a1802413148     firma de las 24 funciones de public: argumentos, resultado, DEFINER, volatilidad, SET y grants
--     catalogo.triggers=3cf64039a15f110a2d2eb3bda1e8f618  los 12 triggers de estas tablas y de auth.users (sin los 7 de abajo)
--     catalogo.realtime=42ff79fe5395e99c7b778fb7a8bd143a  las 5 de estas tablas que están en la publicación supabase_realtime
--     catalogo.replica=2daa906efee814962b683d6f19480708   REPLICA IDENTITY de las 20
--     catalogo.rls=1fabacaef5bd418c2ec0141e7fcac729       RLS encendida / forzada de las 20 (ninguna forzada)
--
-- Lo que NO trae, a propósito (no es del Messenger y dispara fuera de él):
--   · profiles: api_webhooks_por_baja, profiles_baja_revoca_correo (AFTER UPDATE OF
--     deleted_at) y profiles_phone_send_verification_trigger (OF phone_e164).
--   · tenants: api_webhooks_por_agencias (AFTER INSERT, webhooks).
--   · user_roles: trg_user_roles_audit, trg_user_roles_check_role_group,
--     trg_user_roles_sync_groups, y la política "Admins can view all user roles"
--     (usa has_role(uuid, app_role)). Queda "Users can view own roles".
--   · Las funciones que solo se llaman fuera de estas rutas: role_groups (lo lee
--     is_in_role_group), puede_ver_modulo y push_notify_enqueue (las llama
--     push_desde_notificacion, que sale en la primera línea con chat_message y
--     chat_mention). Con check_function_bodies = off se crean igual, como en un
--     pg_dump.
--   · chat_messages_rich_respaldo_20260918: el respaldo a mano del texto rico del
--     18/09 (RLS sin políticas, solo postgres y service_role). Nadie la usa.
--
-- Stubs (NO son de prod; sin ellos no carga): los roles de Supabase, el esquema
-- auth (auth.users mínima; auth.uid/role/jwt SÍ son los de prod), net.http_post
-- (anota el pedido en net._pedidos en vez de salir), vault.decrypted_secrets,
-- extensions (vacío) y companies (solo la PK, por la FK de profiles).
-- ════════════════════════════════════════════════════════════════════════════

set check_function_bodies = off;

-- ─── Stubs ───────────────────────────────────────────────────────────────────
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb,
  raw_app_meta_data jsonb,
  banned_until timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- ⚠️ «select » lleva un espacio al final en las tres, como en prod: la huella lo mira.
CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$;

CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$;

CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

create schema net;
create table net._pedidos (id bigserial primary key, url text, headers jsonb, body jsonb, creado timestamptz default now());
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language sql as $f$ insert into net._pedidos(url, headers, body) values (url, headers, body) returning id $f$;

create schema vault;
create table vault.secrets (name text primary key, decrypted_secret text);
create view vault.decrypted_secrets as select name, decrypted_secret from vault.secrets;
insert into vault.secrets values ('cron_internal_token', 'token-falso-del-banco');

create schema extensions;

create table public.companies (id uuid primary key);

-- ─── Tablas (columnas, defaults y NOT NULL de prod) ─────────────────────────
create table public.app_flags (key text not null, enabled boolean default false not null, note text, updated_at timestamp with time zone default now() not null);
create table public.chat_archived (id uuid default gen_random_uuid() not null, user_id uuid not null, conversation_id uuid not null, created_at timestamp with time zone default now());
create table public.chat_conversations (id uuid default gen_random_uuid() not null, type text default 'direct'::text not null, name text, description text, avatar_url text, created_by uuid not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null, msg_permission text default 'all'::text not null, members_visibility text default 'all'::text not null, info_permission text default 'admins'::text not null, add_permission text default 'admins'::text not null, require_approval boolean default false not null);
create table public.chat_join_requests (id uuid default gen_random_uuid() not null, conversation_id uuid not null, user_id uuid not null, requested_by uuid not null, created_at timestamp with time zone default now() not null);
create table public.chat_message_deletions (message_id uuid not null, conversation_id uuid not null, sender_id uuid not null, deleted_by uuid not null, deleted_at timestamp with time zone default now() not null, content text, type text, file_url text, file_name text, file_size bigint);
create table public.chat_messages (id uuid default gen_random_uuid() not null, conversation_id uuid not null, sender_id uuid not null, content text, type text default 'text'::text not null, file_url text, file_name text, file_size bigint, reply_to_id uuid, is_edited boolean default false not null, is_deleted boolean default false not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null, album_id uuid, is_thread_reply boolean default false not null, content_rich jsonb);
create table public.chat_participants (id uuid default gen_random_uuid() not null, conversation_id uuid not null, user_id uuid not null, role text default 'member'::text not null, joined_at timestamp with time zone default now() not null, last_read_at timestamp with time zone, is_muted boolean default false not null, notifications_mode text default 'all'::text not null);
create table public.chat_pinned (id uuid default gen_random_uuid() not null, user_id uuid not null, conversation_id uuid not null, pinned_at timestamp with time zone default now(), "position" integer default 0 not null);
create table public.chat_reactions (id uuid default gen_random_uuid() not null, message_id uuid not null, user_id uuid not null, emoji text not null, created_at timestamp with time zone default now() not null);
create table public.chat_read_receipts (id uuid default gen_random_uuid() not null, message_id uuid not null, user_id uuid not null, read_at timestamp with time zone, delivered_at timestamp with time zone);
create table public.chat_space_conversations (id uuid default gen_random_uuid() not null, space_id uuid not null, conversation_id uuid not null, added_at timestamp with time zone default now(), sort_order integer default 0);
create table public.chat_spaces (id uuid default gen_random_uuid() not null, name text not null, icon text default '💬'::text, color text default '#6366f1'::text, created_by uuid not null, created_at timestamp with time zone default now(), updated_at timestamp with time zone default now(), sort_order integer default 0);
create table public.notification_preferences (id uuid default gen_random_uuid() not null, user_id uuid not null, module text not null, notification_type text not null, channel_in_app boolean default true, channel_email boolean default false, is_enabled boolean default true, created_at timestamp with time zone default now(), updated_at timestamp with time zone default now(), channel_push boolean default true not null, channel_digest boolean default false not null, delivery_mode text default 'all'::text not null);
create table public.notification_settings (id uuid default gen_random_uuid() not null, user_id uuid not null, notifications_enabled boolean default true not null, realtime_enabled boolean default true not null, group_similar boolean default false not null, auto_mark_read_on_open boolean default false not null, sound_enabled boolean default false not null, show_critical_banners boolean default true not null, dnd_enabled boolean default false not null, dnd_start_time time without time zone, dnd_end_time time without time zone, dnd_allow_critical boolean default true not null, digest_enabled boolean default false not null, digest_frequency text default 'daily'::text not null, digest_time time without time zone default '09:00:00'::time without time zone not null, digest_channel text default 'in_app'::text not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null, push_enabled boolean default false not null);
create table public.notifications (id uuid default gen_random_uuid() not null, user_id uuid, type text not null, title text not null, message text, reference_id uuid, reference_type text, is_read boolean default false not null, created_at timestamp with time zone default now() not null, module_origin text, priority text default 'medium'::text, status text default 'new'::text, deep_link_url text, required_permission_module text, required_permission_submodule text, visibility_scope text default 'personal'::text, role_target text, automation_key text);
create table public.profiles (id uuid not null, full_name text, avatar_url text, company_id uuid, created_at timestamp with time zone default now(), phone_e164 text, whatsapp_push_name text, whatsapp_verified_at timestamp with time zone, whatsapp_lid text, is_owner boolean default false not null, ai_daily_quota_override integer, avatar_seed text, ui_skin text, ui_prefs jsonb, status_text text, status_expires_at timestamp with time zone, status text, status_color text, deleted_at timestamp with time zone, deleted_by uuid);
create table public.push_subscriptions (id uuid default gen_random_uuid() not null, user_id uuid not null, endpoint text not null, p256dh text not null, auth text not null, user_agent text, created_at timestamp with time zone default now() not null);
create table public.tenant_members (user_id uuid not null, tenant_id uuid not null, role text default 'member'::text not null, created_at timestamp with time zone default now() not null);
create table public.tenants (id uuid default gen_random_uuid() not null, slug text not null, name text not null, active boolean default true not null, created_at timestamp with time zone default now() not null);
create table public.user_roles (id uuid default gen_random_uuid() not null, user_id uuid not null, role text not null);

-- ─── PK, UNIQUE y CHECK ──────────────────────────────────────────────────────
alter table public.app_flags add constraint app_flags_pkey PRIMARY KEY (key);
alter table public.chat_archived add constraint chat_archived_pkey PRIMARY KEY (id);
alter table public.chat_archived add constraint chat_archived_user_id_conversation_id_key UNIQUE (user_id, conversation_id);
alter table public.chat_conversations add constraint chat_conversations_pkey PRIMARY KEY (id);
alter table public.chat_conversations add constraint chat_conversations_add_permission_chk CHECK ((add_permission = ANY (ARRAY['all'::text, 'admins'::text])));
alter table public.chat_conversations add constraint chat_conversations_info_permission_chk CHECK ((info_permission = ANY (ARRAY['all'::text, 'admins'::text])));
alter table public.chat_conversations add constraint chat_conversations_members_visibility_chk CHECK ((members_visibility = ANY (ARRAY['all'::text, 'admins'::text])));
alter table public.chat_conversations add constraint chat_conversations_msg_permission_chk CHECK ((msg_permission = ANY (ARRAY['all'::text, 'admins'::text])));
alter table public.chat_conversations add constraint chat_conversations_type_check CHECK ((type = ANY (ARRAY['direct'::text, 'group'::text])));
alter table public.chat_join_requests add constraint chat_join_requests_pkey PRIMARY KEY (id);
alter table public.chat_join_requests add constraint chat_join_requests_conversation_id_user_id_key UNIQUE (conversation_id, user_id);
alter table public.chat_message_deletions add constraint chat_message_deletions_pkey PRIMARY KEY (message_id);
alter table public.chat_messages add constraint chat_messages_pkey PRIMARY KEY (id);
alter table public.chat_messages add constraint chat_messages_type_check CHECK ((type = ANY (ARRAY['text'::text, 'image'::text, 'file'::text, 'system'::text])));
alter table public.chat_participants add constraint chat_participants_pkey PRIMARY KEY (id);
alter table public.chat_participants add constraint chat_participants_conversation_id_user_id_key UNIQUE (conversation_id, user_id);
alter table public.chat_participants add constraint chat_participants_notifications_mode_check CHECK ((notifications_mode = ANY (ARRAY['all'::text, 'mentions'::text, 'none'::text])));
alter table public.chat_participants add constraint chat_participants_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text])));
alter table public.chat_pinned add constraint chat_pinned_pkey PRIMARY KEY (id);
alter table public.chat_pinned add constraint chat_pinned_user_id_conversation_id_key UNIQUE (user_id, conversation_id);
alter table public.chat_reactions add constraint chat_reactions_pkey PRIMARY KEY (id);
alter table public.chat_reactions add constraint chat_reactions_message_id_user_id_emoji_key UNIQUE (message_id, user_id, emoji);
alter table public.chat_read_receipts add constraint chat_read_receipts_pkey PRIMARY KEY (id);
alter table public.chat_read_receipts add constraint chat_read_receipts_message_id_user_id_key UNIQUE (message_id, user_id);
alter table public.chat_space_conversations add constraint chat_space_conversations_pkey PRIMARY KEY (id);
alter table public.chat_space_conversations add constraint chat_space_conversations_space_id_conversation_id_key UNIQUE (space_id, conversation_id);
alter table public.chat_spaces add constraint chat_spaces_pkey PRIMARY KEY (id);
alter table public.notification_preferences add constraint notification_preferences_pkey PRIMARY KEY (id);
alter table public.notification_preferences add constraint notification_preferences_user_id_module_notification_type_key UNIQUE (user_id, module, notification_type);
alter table public.notification_settings add constraint notification_settings_pkey PRIMARY KEY (id);
alter table public.notification_settings add constraint notification_settings_user_id_key UNIQUE (user_id);
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_phone_e164_format CHECK (((phone_e164 IS NULL) OR (phone_e164 ~ '^\+[0-9]{8,16}$'::text)));
alter table public.profiles add constraint profiles_status_color_valido CHECK (((status_color IS NULL) OR (status_color = ANY (ARRAY['verde'::text, 'amarillo'::text, 'naranja'::text, 'rojo'::text, 'rosa'::text, 'morado'::text, 'azul'::text, 'turquesa'::text]))));
alter table public.profiles add constraint profiles_status_valido CHECK (((status IS NULL) OR (status = ANY (ARRAY['available'::text, 'busy'::text, 'away'::text, 'offline'::text]))));
alter table public.push_subscriptions add constraint push_subscriptions_pkey PRIMARY KEY (id);
alter table public.push_subscriptions add constraint push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint);
alter table public.tenant_members add constraint tenant_members_pkey PRIMARY KEY (user_id, tenant_id);
alter table public.tenants add constraint tenants_pkey PRIMARY KEY (id);
alter table public.tenants add constraint tenants_slug_key UNIQUE (slug);
alter table public.user_roles add constraint user_roles_pkey PRIMARY KEY (id);
alter table public.user_roles add constraint user_roles_user_id_role_key UNIQUE (user_id, role);

-- ─── FK (ojo: chat_participants.user_id y chat_messages.sender_id NO tienen, ni
--     chat_conversations.created_by: pre-chequeo 5 del diseño) ───────────────
alter table public.chat_archived add constraint chat_archived_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
alter table public.chat_archived add constraint chat_archived_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.chat_join_requests add constraint chat_join_requests_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
alter table public.chat_message_deletions add constraint chat_message_deletions_message_id_fkey FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE;
alter table public.chat_messages add constraint chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
alter table public.chat_messages add constraint chat_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES chat_messages(id) ON DELETE SET NULL;
alter table public.chat_participants add constraint chat_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
alter table public.chat_pinned add constraint chat_pinned_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
alter table public.chat_pinned add constraint chat_pinned_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.chat_reactions add constraint chat_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE;
alter table public.chat_read_receipts add constraint chat_read_receipts_message_id_fkey FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE;
alter table public.chat_space_conversations add constraint chat_space_conversations_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
alter table public.chat_space_conversations add constraint chat_space_conversations_space_id_fkey FOREIGN KEY (space_id) REFERENCES chat_spaces(id) ON DELETE CASCADE;
alter table public.chat_spaces add constraint chat_spaces_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.notification_preferences add constraint notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.notification_settings add constraint notification_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.profiles add constraint profiles_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.push_subscriptions add constraint push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.tenant_members add constraint tenant_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table public.tenant_members add constraint tenant_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.user_roles add constraint user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ─── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_chat_archived_conversation_id ON public.chat_archived USING btree (conversation_id);
CREATE INDEX chat_message_deletions_conv_idx ON public.chat_message_deletions USING btree (conversation_id);
CREATE INDEX idx_chat_messages_conversation ON public.chat_messages USING btree (conversation_id, created_at DESC);
CREATE INDEX idx_chat_messages_created_at_desc ON public.chat_messages USING btree (created_at DESC) WHERE (is_deleted = false);
CREATE INDEX idx_chat_messages_reply_to_id ON public.chat_messages USING btree (reply_to_id);
CREATE INDEX idx_chat_messages_sender ON public.chat_messages USING btree (sender_id);
CREATE INDEX idx_chat_participants_conversation ON public.chat_participants USING btree (conversation_id);
CREATE INDEX idx_chat_participants_user ON public.chat_participants USING btree (user_id);
CREATE INDEX idx_chat_pinned_conversation_id ON public.chat_pinned USING btree (conversation_id);
CREATE INDEX idx_chat_reactions_message ON public.chat_reactions USING btree (message_id);
CREATE INDEX idx_chat_read_receipts_message ON public.chat_read_receipts USING btree (message_id);
CREATE INDEX idx_chat_space_conversations_conversation_id ON public.chat_space_conversations USING btree (conversation_id);
CREATE INDEX idx_chat_spaces_created_by ON public.chat_spaces USING btree (created_by);
CREATE INDEX idx_notifications_created_at_desc ON public.notifications USING btree (created_at DESC);
CREATE INDEX idx_notifications_module ON public.notifications USING btree (module_origin);
CREATE INDEX idx_notifications_priority ON public.notifications USING btree (priority);
CREATE INDEX idx_notifications_user_status ON public.notifications USING btree (user_id, status);
CREATE UNIQUE INDEX idx_notifications_automation_key ON public.notifications USING btree (automation_key) WHERE (automation_key IS NOT NULL);
CREATE INDEX idx_profiles_company_id ON public.profiles USING btree (company_id);
CREATE INDEX profiles_deleted_at_idx ON public.profiles USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX profiles_whatsapp_lid_idx ON public.profiles USING btree (whatsapp_lid) WHERE (whatsapp_lid IS NOT NULL);
CREATE INDEX profiles_whatsapp_push_name_idx ON public.profiles USING btree (lower(whatsapp_push_name)) WHERE (whatsapp_push_name IS NOT NULL);
CREATE UNIQUE INDEX profiles_phone_e164_unique ON public.profiles USING btree (phone_e164) WHERE (phone_e164 IS NOT NULL);
CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions USING btree (user_id);
CREATE INDEX tenant_members_tenant_idx ON public.tenant_members USING btree (tenant_id);
CREATE INDEX tenant_members_user_idx ON public.tenant_members USING btree (user_id);

-- ─── RLS, REPLICA IDENTITY y Realtime ────────────────────────────────────────
alter table public.app_flags enable row level security;
alter table public.chat_archived enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_join_requests enable row level security;
alter table public.chat_message_deletions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_pinned enable row level security;
alter table public.chat_reactions enable row level security;
alter table public.chat_read_receipts enable row level security;
alter table public.chat_space_conversations enable row level security;
alter table public.chat_spaces enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.profiles enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.tenant_members enable row level security;
alter table public.tenants enable row level security;
alter table public.user_roles enable row level security;

alter table public.chat_conversations replica identity full;
alter table public.chat_messages replica identity full;
alter table public.chat_participants replica identity full;
alter table public.chat_pinned replica identity full;
alter table public.chat_reactions replica identity full;
alter table public.chat_read_receipts replica identity full;
alter table public.chat_space_conversations replica identity full;
alter table public.chat_spaces replica identity full;

create publication supabase_realtime for table public.chat_conversations, public.chat_join_requests, public.chat_messages, public.chat_participants, public.notifications;

-- ─── Funciones (cuerpos de prod) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tenant_id
  FROM public.tenant_members
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.is_chat_admin(_user_id uuid, _conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE user_id = _user_id AND conversation_id = _conversation_id AND role = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_chat_participant(_user_id uuid, _conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE user_id = _user_id AND conversation_id = _conversation_id
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_conversation_creator(_user_id uuid, _conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE id = _conversation_id AND created_by = _user_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_in_role_group(_user_id uuid, _group text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_groups rg ON rg.role_name = ur.role
    WHERE ur.user_id = _user_id
      AND CASE _group
        WHEN 'admin'               THEN rg.is_admin
        WHEN 'manager_or_above'    THEN rg.is_manager_or_above
        WHEN 'supervisor_or_above' THEN rg.is_supervisor_or_above
        WHEN 'member'              THEN rg.is_member
        ELSE false
      END
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_has_role_name(_user_id uuid, _role_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = _role_name
  )
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_chat_conversation_meta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.name        IS DISTINCT FROM OLD.name
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.avatar_url  IS DISTINCT FROM OLD.avatar_url)
     AND auth.uid() IS NOT NULL
     AND NOT is_chat_admin(auth.uid(), OLD.id)
     AND OLD.created_by <> auth.uid()
  THEN
    RAISE EXCEPTION 'Solo un admin del grupo puede editar sus datos';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_chat_conversation_perms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.msg_permission     IS DISTINCT FROM OLD.msg_permission
      OR NEW.members_visibility IS DISTINCT FROM OLD.members_visibility
      OR NEW.info_permission  IS DISTINCT FROM OLD.info_permission
      OR NEW.add_permission   IS DISTINCT FROM OLD.add_permission
      OR NEW.require_approval IS DISTINCT FROM OLD.require_approval)
     AND NOT public.is_chat_admin(auth.uid(), OLD.id) THEN
    RAISE EXCEPTION 'Solo un admin puede cambiar los permisos del grupo';
  END IF;
  IF (NEW.name IS DISTINCT FROM OLD.name
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url)
     AND OLD.type = 'group'
     AND coalesce(OLD.info_permission, 'admins') = 'admins'
     AND NOT public.is_chat_admin(auth.uid(), OLD.id) THEN
    RAISE EXCEPTION 'Solo un admin puede editar la información del grupo';
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.guard_chat_message_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
  THEN RAISE EXCEPTION 'No autorizado: no se puede mover un mensaje ni cambiar su autor'; END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.guard_chat_participant_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id)
     AND NOT public.is_chat_admin(auth.uid(), OLD.conversation_id)
  THEN RAISE EXCEPTION 'No autorizado: solo un admin del grupo puede cambiar el rol o la membresia'; END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.menciona_a(p_content text, p_full_name text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select p_content is not null
     and nullif(btrim(p_full_name), '') is not null
     and p_content ~* ('(^|[^[:alnum:]_])@' || regexp_replace(btrim(p_full_name), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '($|[^[:alnum:]_])');
$function$;

CREATE OR REPLACE FUNCTION public.notif_canal_activo(p_user uuid, p_type text, p_canal text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select coalesce(np.is_enabled, true)
       and case p_canal
             when 'push'   then coalesce(np.channel_push, true)
             when 'in_app' then coalesce(np.channel_in_app, true)
             when 'email'  then coalesce(np.channel_email, false)
             else true
           end
    from notification_preferences np
    where np.user_id = p_user and np.notification_type = p_type
    order by np.updated_at desc nulls last
    limit 1
  ), p_canal <> 'email');  -- sin fila: in_app y push encendidos, correo apagado
$function$;

CREATE OR REPLACE FUNCTION public.notify_chat_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  participant record;
  sender_name text;
  conv_name text;
  msg_preview text;
  es_mencion boolean;
begin
  select full_name into sender_name from profiles where id = new.sender_id;
  sender_name := coalesce(sender_name, 'Alguien');

  select name into conv_name from chat_conversations where id = new.conversation_id;

  if new.content is not null and new.content != '' then
    msg_preview := left(new.content, 100);
  else
    msg_preview := '📎 Archivo';
  end if;

  for participant in
    select cp.user_id, p.full_name
    from chat_participants cp
    left join profiles p on p.id = cp.user_id
    where cp.conversation_id = new.conversation_id
      and cp.user_id != new.sender_id
      and cp.is_muted = false
  loop
    es_mencion := public.menciona_a(new.content, participant.full_name);
    insert into notifications (
      user_id, type, title, message, reference_id, reference_type,
      module_origin, priority, status, deep_link_url, required_permission_module
    ) values (
      participant.user_id,
      case when es_mencion then 'chat_mention' else 'chat_message' end,
      case
        when es_mencion and conv_name is not null then sender_name || ' te mencionó en ' || conv_name
        when es_mencion then sender_name || ' te mencionó'
        when conv_name is not null then sender_name || ' en ' || conv_name
        else sender_name
      end,
      msg_preview,
      new.conversation_id,
      'conversation',
      'messenger',
      case when es_mencion then 'high' else 'low' end,
      'new',
      '/messenger?c=' || new.conversation_id || '&m=' || new.id,
      'Messenger'
    );
  end loop;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.push_chat_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_recipients uuid[];
  v_token text;
begin
  if new.type = 'system' or new.is_deleted then
    return null;
  end if;

  select array_agg(cp.user_id) into v_recipients
  from chat_participants cp
  join notification_settings ns
    on ns.user_id = cp.user_id
   and ns.push_enabled
   and ns.notifications_enabled
  where cp.conversation_id = new.conversation_id
    and cp.user_id <> new.sender_id
    and not cp.is_muted
    and cp.notifications_mode <> 'none'
    and public.notif_canal_activo(cp.user_id, 'chat_message', 'push')
    and exists (select 1 from push_subscriptions ps where ps.user_id = cp.user_id);

  if v_recipients is null then
    return null;
  end if;

  begin
    select decrypted_secret into v_token
      from vault.decrypted_secrets
     where name = 'cron_internal_token';

    perform net.http_post(
      url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/web-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Token', v_token
      ),
      body := jsonb_build_object(
        'action', 'notify',
        'kind', 'chat_message',
        'recipient_ids', to_jsonb(v_recipients),
        'ref', jsonb_build_object(
          'message_id', new.id,
          'conversation_id', new.conversation_id,
          'sender_id', new.sender_id
        )
      ),
      timeout_milliseconds := 10000
    );
  exception when others then
    raise warning 'push_chat_message: % (mensaje %)', sqlerrm, new.id;
  end;

  return null;
end
$function$;

CREATE OR REPLACE FUNCTION public.validate_notification_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.priority IS NOT NULL AND NEW.priority NOT IN ('high', 'medium', 'low') THEN
    RAISE EXCEPTION 'Invalid priority: %', NEW.priority;
  END IF;
  IF NEW.status IS NOT NULL AND NEW.status NOT IN ('new', 'read', 'archived') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  IF NEW.visibility_scope IS NOT NULL AND NEW.visibility_scope NOT IN ('personal', 'team', 'global') THEN
    RAISE EXCEPTION 'Invalid visibility_scope: %', NEW.visibility_scope;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.push_desde_notificacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.user_id is null or new.type is null or new.type in ('chat_message', 'chat_mention') then
    return null;
  end if;
  if new.required_permission_module is not null
     and not public.puede_ver_modulo(new.user_id, new.required_permission_module, new.required_permission_submodule) then
    return null;
  end if;
  if exists (
    select 1 from notifications n
    where n.user_id = new.user_id and n.type = new.type
      and date_trunc('minute', n.created_at) = date_trunc('minute', new.created_at)
      and (n.created_at, n.id) < (new.created_at, new.id)
  ) then
    return null;
  end if;
  perform public.push_notify_enqueue(
    new.type,
    array[new.user_id],
    jsonb_build_object('notification_id', new.id, 'reference_type', new.reference_type, 'reference_id', new.reference_id),
    coalesce(nullif(new.title, ''), 'Maven'),
    coalesce(new.message, ''),
    coalesce(nullif(new.deep_link_url, ''), '/notificaciones'),
    'notif-' || new.id,
    case when new.priority in ('critical', 'high') then 'normal' else 'low' end
  );
  return null;
end
$function$;

CREATE OR REPLACE FUNCTION public.delete_chat_message(p_message_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller uuid := auth.uid();
  m record;
begin
  if v_caller is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select id, conversation_id, sender_id, content, type, file_url, file_name, file_size, is_deleted
    into m
  from chat_messages
  where id = p_message_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if m.is_deleted then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if m.sender_id <> v_caller then
    return jsonb_build_object('ok', false, 'error', 'not_author');
  end if;

  insert into chat_message_deletions (
    message_id, conversation_id, sender_id, deleted_by,
    content, type, file_url, file_name, file_size
  ) values (
    m.id, m.conversation_id, m.sender_id, v_caller,
    m.content, m.type, m.file_url, m.file_name, m.file_size
  )
  on conflict (message_id) do nothing;

  update chat_messages
     set is_deleted = true, content = null, file_url = null, file_name = null
   where id = m.id;

  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_conversation_cascade(_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _msg_ids uuid[];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM chat_conversations c
    JOIN chat_participants p ON p.conversation_id = c.id AND p.user_id = auth.uid()
    WHERE c.id = _conversation_id
      AND (c.type = 'direct' OR p.role = 'admin')
  ) THEN
    RAISE EXCEPTION 'No autorizado para eliminar esta conversación';
  END IF;

  SELECT array_agg(id) INTO _msg_ids
  FROM chat_messages
  WHERE conversation_id = _conversation_id;

  IF _msg_ids IS NOT NULL AND array_length(_msg_ids, 1) > 0 THEN
    DELETE FROM chat_reactions WHERE message_id = ANY(_msg_ids);
    DELETE FROM chat_read_receipts WHERE message_id = ANY(_msg_ids);
  END IF;

  DELETE FROM chat_pinned WHERE conversation_id = _conversation_id;
  DELETE FROM chat_archived WHERE conversation_id = _conversation_id;
  DELETE FROM chat_space_conversations WHERE conversation_id = _conversation_id;
  DELETE FROM chat_messages WHERE conversation_id = _conversation_id;
  DELETE FROM chat_participants WHERE conversation_id = _conversation_id;
  DELETE FROM notifications WHERE reference_id = _conversation_id AND reference_type = 'conversation';
  DELETE FROM chat_conversations WHERE id = _conversation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_unread_counts(_user_id uuid)
 RETURNS TABLE(conversation_id uuid, unread_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT cp.conversation_id, COUNT(cm.id) AS unread_count
  FROM chat_participants cp
  LEFT JOIN chat_messages cm ON cm.conversation_id = cp.conversation_id
    AND cm.sender_id != _user_id AND cm.is_deleted = false
    AND (cp.last_read_at IS NULL OR cm.created_at > cp.last_read_at)
  WHERE cp.user_id = _user_id AND _user_id = (SELECT auth.uid())
  GROUP BY cp.conversation_id;
$function$;

CREATE OR REPLACE FUNCTION public.messenger_unread_counts()
 RETURNS TABLE(conversation_id uuid, unread_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select cp.conversation_id, u.n::integer
    from public.chat_participants cp
   cross join lateral (
     select count(*) as n
       from (select 1
               from public.chat_messages cm
              where cm.conversation_id = cp.conversation_id
                and cm.created_at > coalesce(cp.last_read_at, '-infinity'::timestamptz)
                and cm.sender_id <> cp.user_id
                and not cm.is_deleted
              limit 101) x
   ) u
   where cp.user_id = (select auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.get_last_messages(_user_id uuid)
 RETURNS SETOF chat_messages
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT cm.*
  FROM chat_participants cp
  CROSS JOIN LATERAL (
    SELECT m.*
    FROM chat_messages m
    WHERE m.conversation_id = cp.conversation_id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) cm
  WHERE cp.user_id = _user_id
    AND _user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.get_mentioned_conversations(_user_id uuid, _nombre text, _nombre_pila text)
 RETURNS TABLE(conversation_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT cp.conversation_id
  FROM chat_participants cp
  JOIN chat_messages cm ON cm.conversation_id = cp.conversation_id
  WHERE cp.user_id = _user_id
    AND _user_id = auth.uid()
    AND cm.is_deleted = false
    AND cm.sender_id <> _user_id
    AND (cp.last_read_at IS NULL OR cm.created_at > cp.last_read_at)
    AND (
      position(lower('@' || _nombre) in lower(cm.content)) > 0
      OR position(lower('@' || _nombre_pila) in lower(cm.content)) > 0
    );
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  default_tenant_id uuid;
BEGIN
  -- 1. Profile (compat con flow original)
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;

  -- 2. User role (compat con flow original)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee')
  ON CONFLICT DO NOTHING;

  -- 3. Tenant membership — single-tenant default a ASM Tech.
  -- Si ASM Tech no existe (instalación nueva sin seed), dejamos
  -- el INSERT silencioso. Multi-tenant: cambiar la lógica acá.
  SELECT id INTO default_tenant_id
  FROM public.tenants
  WHERE slug = 'asm-tech' AND active = true
  LIMIT 1;

  IF default_tenant_id IS NOT NULL THEN
    INSERT INTO public.tenant_members (user_id, tenant_id, role)
    VALUES (NEW.id, default_tenant_id, 'member')
    ON CONFLICT (user_id, tenant_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- ─── Grants de funciones distintos del de por defecto (proacl de prod) ──────
revoke all on function public.delete_conversation_cascade(uuid) from public, anon;
revoke all on function public.get_last_messages(uuid) from public;
revoke all on function public.get_mentioned_conversations(uuid, text, text) from public;
revoke all on function public.get_unread_counts(uuid) from public, anon;
revoke all on function public.messenger_unread_counts() from public, anon;
revoke all on function public.notif_canal_activo(uuid, text, text) from public, anon;
revoke all on function public.push_chat_message() from public, anon, authenticated;

-- ─── Triggers ────────────────────────────────────────────────────────────────
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER trg_guard_chat_conversation_meta BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION guard_chat_conversation_meta();
CREATE TRIGGER trg_guard_chat_conversation_perms BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION guard_chat_conversation_perms();
CREATE TRIGGER update_chat_conversations_updated_at BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER on_chat_message_notify AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION notify_chat_message();
CREATE TRIGGER on_chat_message_push AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION push_chat_message();
CREATE TRIGGER trg_guard_chat_message_update BEFORE UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION guard_chat_message_update();
CREATE TRIGGER update_chat_messages_updated_at BEFORE UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_guard_chat_participant_update BEFORE UPDATE ON public.chat_participants FOR EACH ROW EXECUTE FUNCTION guard_chat_participant_update();
CREATE TRIGGER update_notification_settings_updated_at BEFORE UPDATE ON public.notification_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER on_notification_push AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION push_desde_notificacion();
CREATE TRIGGER trg_validate_notification_fields BEFORE INSERT OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION validate_notification_fields();

-- ─── Políticas (qual / with_check como los desarma prod) ────────────────────
create policy app_flags_read on public.app_flags as permissive for select to authenticated using (true);

create policy "Users can delete own archived" on public.chat_archived as permissive for delete to authenticated using ((auth.uid() = user_id));
create policy "Users can insert own archived" on public.chat_archived as permissive for insert to authenticated with check ((auth.uid() = user_id));
create policy "Users can view own archived" on public.chat_archived as permissive for select to authenticated using ((auth.uid() = user_id));

create policy "Admins can delete conversations" on public.chat_conversations as permissive for delete to public using ((( SELECT auth.uid() AS uid) = created_by));
create policy "Admins can update group conversations" on public.chat_conversations as permissive for update to public using (is_chat_participant(( SELECT auth.uid() AS uid), id));
create policy "Authenticated users can create conversations" on public.chat_conversations as permissive for insert to public with check ((( SELECT auth.uid() AS uid) = created_by));
create policy "Users can view their conversations" on public.chat_conversations as permissive for select to public using (is_chat_participant(( SELECT auth.uid() AS uid), id));

create policy "create join request" on public.chat_join_requests as permissive for insert to authenticated with check (((requested_by = auth.uid()) AND is_chat_participant(auth.uid(), conversation_id) AND (EXISTS ( SELECT 1
   FROM chat_conversations c
  WHERE ((c.id = chat_join_requests.conversation_id) AND (c.type = 'group'::text) AND (c.add_permission = 'all'::text) AND (c.require_approval = true))))));
create policy "delete join request" on public.chat_join_requests as permissive for delete to authenticated using ((is_chat_admin(auth.uid(), conversation_id) OR (requested_by = auth.uid())));
create policy "view join requests" on public.chat_join_requests as permissive for select to authenticated using ((is_chat_admin(auth.uid(), conversation_id) OR (requested_by = auth.uid())));

create policy "admins read deleted content" on public.chat_message_deletions as permissive for select to authenticated using (is_in_role_group(auth.uid(), 'admin'::text));

create policy "Announcement groups only admins post" on public.chat_messages as restrictive for insert to authenticated with check (((type = 'system'::text) OR is_chat_admin(( SELECT auth.uid() AS uid), conversation_id) OR (NOT (EXISTS ( SELECT 1
   FROM chat_conversations c
  WHERE ((c.id = chat_messages.conversation_id) AND (c.type = 'group'::text) AND (c.msg_permission = 'admins'::text)))))));
create policy "Users can delete their own messages" on public.chat_messages as permissive for delete to public using ((( SELECT auth.uid() AS uid) = sender_id));
create policy "Users can send messages to their conversations" on public.chat_messages as permissive for insert to public with check ((is_chat_participant(( SELECT auth.uid() AS uid), conversation_id) AND (( SELECT auth.uid() AS uid) = sender_id)));
create policy "Users can update their own messages" on public.chat_messages as permissive for update to public using ((( SELECT auth.uid() AS uid) = sender_id)) with check (((( SELECT auth.uid() AS uid) = sender_id) AND is_chat_participant(( SELECT auth.uid() AS uid), conversation_id)));
create policy "Users can view messages in their conversations" on public.chat_messages as permissive for select to public using (is_chat_participant(( SELECT auth.uid() AS uid), conversation_id));

create policy "Admins can remove participants" on public.chat_participants as permissive for delete to authenticated using ((is_chat_admin(( SELECT auth.uid() AS uid), conversation_id) OR (( SELECT auth.uid() AS uid) = user_id)));
create policy "Users can add participants" on public.chat_participants as permissive for insert to authenticated with check ((((( SELECT auth.uid() AS uid) = user_id) AND is_conversation_creator(( SELECT auth.uid() AS uid), conversation_id)) OR is_chat_admin(( SELECT auth.uid() AS uid), conversation_id) OR (is_chat_participant(( SELECT auth.uid() AS uid), conversation_id) AND (EXISTS ( SELECT 1
   FROM chat_conversations c
  WHERE ((c.id = chat_participants.conversation_id) AND (c.type = 'group'::text) AND (c.add_permission = 'all'::text)))))));
create policy "Users can update their own participation" on public.chat_participants as permissive for update to public using ((( SELECT auth.uid() AS uid) = user_id) OR is_chat_admin(( SELECT auth.uid() AS uid), conversation_id));
create policy "Users can view participants of their conversations" on public.chat_participants as permissive for select to public using (is_chat_participant(( SELECT auth.uid() AS uid), conversation_id));

create policy "Users can manage their own pins" on public.chat_pinned as permissive for all to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));

create policy "Users can add reactions" on public.chat_reactions as permissive for insert to public with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM chat_messages m
  WHERE ((m.id = chat_reactions.message_id) AND is_chat_participant(auth.uid(), m.conversation_id))))));
create policy "Users can remove their reactions" on public.chat_reactions as permissive for delete to public using ((auth.uid() = user_id));
create policy "Users can view reactions in their conversations" on public.chat_reactions as permissive for select to public using ((EXISTS ( SELECT 1
   FROM chat_messages m
  WHERE ((m.id = chat_reactions.message_id) AND is_chat_participant(auth.uid(), m.conversation_id)))));

create policy "Users can mark messages as read" on public.chat_read_receipts as permissive for insert to public with check (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM chat_messages m
  WHERE ((m.id = chat_read_receipts.message_id) AND is_chat_participant(( SELECT auth.uid() AS uid), m.conversation_id))))));
create policy "Users can update their own receipts" on public.chat_read_receipts as permissive for update to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "Users can view read receipts in their conversations" on public.chat_read_receipts as permissive for select to public using ((EXISTS ( SELECT 1
   FROM chat_messages m
  WHERE ((m.id = chat_read_receipts.message_id) AND is_chat_participant(( SELECT auth.uid() AS uid), m.conversation_id)))));

create policy "Users can manage space conversations via space ownership" on public.chat_space_conversations as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM chat_spaces
  WHERE ((chat_spaces.id = chat_space_conversations.space_id) AND (chat_spaces.created_by = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM chat_spaces
  WHERE ((chat_spaces.id = chat_space_conversations.space_id) AND (chat_spaces.created_by = auth.uid())))));

create policy "Users can manage their own spaces" on public.chat_spaces as permissive for all to authenticated using ((created_by = auth.uid())) with check ((created_by = auth.uid()));

create policy "Users manage own notification preferences" on public.notification_preferences as permissive for all to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create policy "Users can insert own notification settings" on public.notification_settings as permissive for insert to authenticated with check ((user_id = auth.uid()));
create policy "Users can update own notification settings" on public.notification_settings as permissive for update to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Users can view own notification settings" on public.notification_settings as permissive for select to authenticated using ((user_id = auth.uid()));

create policy "Authenticated users can insert notifications" on public.notifications as permissive for insert to authenticated with check (true);
create policy "Users can delete own notifications" on public.notifications as permissive for delete to public using ((( SELECT auth.uid() AS uid) = user_id));
create policy "Users can update own notifications" on public.notifications as permissive for update to public using (((( SELECT auth.uid() AS uid) = user_id) OR ((user_id IS NULL) AND (role_target IS NOT NULL) AND user_has_role_name(( SELECT auth.uid() AS uid), role_target))));
create policy "Users can view own or role-targeted notifications" on public.notifications as permissive for select to public using (((( SELECT auth.uid() AS uid) = user_id) OR ((user_id IS NULL) AND (role_target IS NOT NULL) AND user_has_role_name(( SELECT auth.uid() AS uid), role_target))));

create policy "Authenticated users can view all profiles" on public.profiles as permissive for select to authenticated using (true);
create policy "Users can insert own profile" on public.profiles as permissive for insert to authenticated with check ((( SELECT auth.uid() AS uid) = id));
create policy "Users can update own profile" on public.profiles as permissive for update to authenticated using ((( SELECT auth.uid() AS uid) = id));

create policy "gestionar las propias suscripciones push" on public.push_subscriptions as permissive for all to public using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "ver las propias suscripciones push" on public.push_subscriptions as permissive for select to public using ((user_id = auth.uid()));

create policy tenant_members_own on public.tenant_members as permissive for select to authenticated using ((user_id = auth.uid()));

create policy tenants_self_visible on public.tenants as permissive for select to authenticated using ((id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));

create policy "Users can view own roles" on public.user_roles as permissive for select to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));

reset check_function_bodies;
