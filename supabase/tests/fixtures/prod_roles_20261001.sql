-- ════════════════════════════════════════════════════════════════════════════
-- Volcado del catálogo de PROD (proyecto lsagslbkliprespbyhts) del 01/10/2026,
-- SIN DATOS: lo que hace falta para probar los roles por agencia
-- (supabase/tests/roles_por_agencia.ts). Sacado con pg_get_functiondef,
-- pg_get_constraintdef, pg_get_triggerdef y pg_policies.
--
-- Las 56 funciones son copia textual de prod. El banco recalcula md5(prosrc) de
-- cada una y lo compara con estas huellas: si alguna no coincide, falla. El
-- fixture no se toca a mano; si prod cambia, se vuelve a sacar.
--
-- Huellas de prod, md5(prosrc):
--   actor_level(_user_id uuid)=f102ab61f98ebfde2183bad23703b16f
--   admin_list_user_roles()=ef599c0657addbcb2c37a0bc1b4d8b76
--   blu_is_management(p_uid uuid)=253689fa8c533bb8589240f46439a09e
--   can_access_chatters_qa(p_uid uuid)=62ecc9a88f9f417ccfb9bff156a308a3
--   can_create_cowork_session(_user_id uuid)=4f2177cb41943e88d7fbeca4b9250746
--   can_manage_user(_caller uuid, _target uuid, _action text, _new_role text)=aa38effdeb4b147ab3ed605aa3b18de5
--   can_manage_users(_user_id uuid)=0628717a91a81fe417b8bccbc1e1c238
--   can_see_contact_phone()=7cefd52537c78075dce9f088db977454
--   can_use_blu_mp(p_uid uuid)=1f0b83e44537f4956dbf8b3d78c7f9db
--   can_use_module_function(_user_id uuid, _module text, _submodule text, _fallback_group text)=5eb2279b47e4f33bed554d47bf6236f2
--   closer_scope_agent_ids()=5ca29aaac09164ea4177ed9f2822908f
--   franja_de_tipo(_is_admin boolean, _is_manager boolean, _is_supervisor boolean)=6703a59d891477c37d94015f666c68ef
--   get_closers_roster()=3ba9471f227d1fd38fc38113812f2c9c
--   get_karma_profile(target uuid)=1aa22eb9f32d548fa57475c3032a980e
--   has_chatter_evaluator_access(_user_id uuid)=e82ed610ed40dee67813f11ec110e2ba
--   has_chatter_global_scope(_user_id uuid)=cae01820954c8bc735ebccb8c67e6c65
--   has_closer_global_scope(_user_id uuid)=fba5bce4df934857a14a0c0613f2ac2c
--   has_company_qa_global_scope(_user_id uuid)=65d30869897afe7bc5fa9d729f18e669
--   has_contactos_global_scope(_user_id uuid)=763e5e8cd90b3d89ed4fca9740f8677b
--   has_cowork_global_scope(_user_id uuid)=1adfbf5897d00fdc1044d7a9b083a1b7
--   has_cowork_team_scope(_user_id uuid)=172de8c83f69c41d0d377d5bd828920f
--   has_creators_global_scope(_user_id uuid)=610974b897af4cdbe39a17a09ef86ebd
--   has_finanzas_access(_user_id uuid)=089adc1f3426c189d0e2c16e5122115e
--   has_grabaciones_global_scope(_user_id uuid)=a77c99d906d006f49dc143893a9beb83
--   has_grabaciones_team_scope(_user_id uuid)=311eb85c5da586072e12e32f52c52694
--   has_hr_access(_user_id uuid)=709582e50889c462656f7ae4929087a2
--   has_leadgen_global_scope(_user_id uuid)=063b2b40f9b3abea876448f26adee926
--   has_permission(_user_id uuid, _module text, _submodule text)=febd7c07d2de0b5b703a870ef40ebbcd
--   has_promolog_global_scope(_user_id uuid)=9958ccde82af32187181ed59774886cf
--   has_qa_global_scope(_user_id uuid)=00cc865b1b8a0e863a0a89639c9cec99
--   has_role(_user_id uuid, _role app_role)=575d8fc1ab9a03bd958a37d2323ae586
--   has_role(_user_id uuid, _role text)=187cdbd4697d1acd03d74ea744df5e56
--   has_scouter_global_scope(_user_id uuid)=9543a52add984455e8826442810c3e73
--   has_scouter_team_scope(_user_id uuid)=2bcd569ea49c6cdc485231571477410c
--   has_telefonos_global_scope(_user_id uuid)=6285da3693ffe7d5ce7734cee512d597
--   has_tg_inbox_global_scope(_user_id uuid)=b0ee1d8d35ba93e9f4b8689e0cc8982a
--   has_wa_inbox_global_scope(_user_id uuid)=78e6ec31dbfbc7b5eabd601169d60205
--   is_in_role_group(_user_id uuid, _group text)=52c2e225119eed6c6c29b009c56a67fc
--   is_phone_privileged()=3f862d6f01fc3999aaa7dfd8c77f68e1
--   list_chatter_evaluators()=9ce7f0c2573312fd5c5b4d102abb9188
--   log_role_change()=64e3904793bb67e691e4dbf6a6482488
--   mail_recipient_directory()=7a1992863df1a22bd6aab276ad28f24c
--   my_can_manage_user(_target uuid, _action text, _new_role text)=9b7aaf90f9b4ce8a773287b456f86f18
--   nivel_por_tipo(_is_admin boolean, _is_manager boolean, _is_supervisor boolean)=f839961d689f0abc0dc0d1dfe6bbb613
--   puede_ver_modulo(_user_id uuid, _module text, _submodule text)=ad00670e2329875743728d9b17ec094f
--   target_level(_user_id uuid)=40e78499895dc8c79450f73f9b586bce
--   tg_role_groups_sync_level()=8de6747ca3fdddab8de63747c26cedfd
--   tg_role_groups_updated_at()=5b733ab523bad442e4b10f836de9e4ba
--   tg_roles_config_guard_level()=f8544bf655e0266a5fb51bbbab0f2984
--   tg_roles_config_level_en_franja()=74da38a54026146b209cb5de5d093521
--   tg_roles_config_sync_role_groups()=323d1f0a16957b66b052d5fb2ec96efc
--   tg_user_roles_check_role_group()=2dcecad5139f2c0233990f866e0fcf37
--   trg_role_groups_sync()=8d8ae0f3f7beecf8fcd0cbc9e2c2ea7b
--   update_updated_at_column()=5b733ab523bad442e4b10f836de9e4ba
--   user_has_role_name(_user_id uuid, _role_name text)=6db5057c69d953e491c802ce3d2468a2
--   wa_copilot_try_consume(_user_id uuid)=22a288c56b52e5a8cfedf8cb0b62c28d
--
-- Además de prod: current_tenant_id y handle_new_user (las mismas del fixture del
-- Messenger), las políticas de tenants/tenant_members, y la intercalación
-- "es-x-icu" (en PGlite no hay ICU: es un stub con locale C, solo para que
-- list_chatter_evaluators se pueda crear).
--
-- Stubs (NO son de prod): los roles de Supabase, auth (mínima; uid/role/jwt SÍ
-- son los de prod), net.http_post (anota el pedido en net._pedidos), vault,
-- audit_log (solo las columnas que escribe log_role_change) y profiles (solo las
-- columnas que leen estas funciones).
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
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

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

create collation "es-x-icu" (locale = 'C');

create type public.app_role as enum ('admin', 'manager', 'employee', 'supervisor', 'agent', 'closer', 'spammer');

create table public.audit_log (id uuid primary key default gen_random_uuid(), user_id uuid, action text, target_type text, target_id text, details jsonb, created_at timestamptz default now());
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, full_name text, avatar_url text, created_at timestamptz default now());

-- ─── Tablas (columnas, defaults y NOT NULL de prod) ─────────────────────────
create table public.tenants (id uuid default gen_random_uuid() not null, slug text not null, name text not null, active boolean default true not null, created_at timestamp with time zone default now() not null);
create table public.tenant_members (user_id uuid not null, tenant_id uuid not null, role text default 'member'::text not null, created_at timestamp with time zone default now() not null);
create table public.user_roles (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  role text not null);
create table public.roles_config (
  id uuid not null default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  ai_daily_quota integer default 20,
  level integer not null default 20);
create table public.role_permissions (
  id uuid not null default gen_random_uuid(),
  role_id uuid not null,
  module text not null,
  submodule text,
  can_access boolean not null default true,
  data_scope text not null default 'all'::text,
  created_at timestamp with time zone not null default now());
create table public.role_groups (
  role_name text not null,
  is_admin boolean not null default false,
  is_manager_or_above boolean not null default false,
  is_supervisor_or_above boolean not null default false,
  is_member boolean not null default true,
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now());
create table public.role_base_grants (
  role_name text not null,
  base_role text not null,
  note text,
  created_at timestamp with time zone not null default now());

-- ─── Constraints ─────────────────────────────────────────────────────────────
alter table public.tenants add constraint tenants_pkey PRIMARY KEY (id);
alter table public.tenants add constraint tenants_slug_key UNIQUE (slug);
alter table public.tenant_members add constraint tenant_members_pkey PRIMARY KEY (user_id, tenant_id);
alter table public.tenant_members add constraint tenant_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table public.tenant_members add constraint tenant_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.user_roles add constraint user_roles_pkey PRIMARY KEY (id);
alter table public.user_roles add constraint user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.user_roles add constraint user_roles_user_id_role_key UNIQUE (user_id, role);
alter table public.roles_config add constraint roles_config_level_range CHECK (((level >= 0) AND (level <= 100)));
alter table public.roles_config add constraint roles_config_name_key UNIQUE (name);
alter table public.roles_config add constraint roles_config_pkey PRIMARY KEY (id);
alter table public.role_permissions add constraint role_permissions_pkey PRIMARY KEY (id);
alter table public.role_permissions add constraint role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles_config(id) ON DELETE CASCADE;
alter table public.role_groups add constraint role_groups_pkey PRIMARY KEY (role_name);
alter table public.role_base_grants add constraint role_base_grants_pkey PRIMARY KEY (role_name, base_role);

CREATE INDEX tenant_members_tenant_idx ON public.tenant_members USING btree (tenant_id);
CREATE INDEX tenant_members_user_idx ON public.tenant_members USING btree (user_id);
CREATE INDEX idx_role_permissions_role_id ON public.role_permissions USING btree (role_id);

-- ─── Funciones (copia textual de prod) ──────────────────────────────────────
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

CREATE OR REPLACE FUNCTION public.actor_level(_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(MAX(rc.level), 0)
  FROM public.user_roles ur
  JOIN public.roles_config rc ON rc.name = ur.role::text AND rc.is_active
  WHERE ur.user_id = _user_id;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_list_user_roles()
 RETURNS TABLE(user_id uuid, role text, level integer, is_admin boolean, manageable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_caller uuid := auth.uid(); v_level int; v_is_admin boolean;
BEGIN
  IF NOT public.can_manage_users(v_caller) THEN
    RAISE EXCEPTION 'insufficient_privilege: se requiere permiso de gestión de usuarios'
      USING ERRCODE = '42501';
  END IF;
  v_level := public.actor_level(v_caller);
  v_is_admin := public.is_in_role_group(v_caller,'admin');

  RETURN QUERY
  SELECT p.id,
         ur.role::text,
         CASE WHEN ur.role IS NULL THEN 0 ELSE COALESCE(rc.level, 999) END,
         COALESCE(rg.is_admin,false),
         (p.id <> v_caller AND (v_is_admin OR v_level >
            CASE WHEN ur.role IS NULL THEN 0 ELSE COALESCE(rc.level,999) END))
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  LEFT JOIN public.roles_config rc ON rc.name = ur.role::text
  LEFT JOIN public.role_groups  rg ON rg.role_name = ur.role::text;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.blu_is_management(p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_roles ur
    left join public.role_groups rg on rg.role_name = ur.role
    where ur.user_id = p_uid
      and (ur.role in ('admin', 'manager', 'owner') or rg.is_manager_or_above = true)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_chatters_qa(p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    public.blu_is_management(p_uid)
    or exists (
      select 1
      from public.user_roles ur
      join public.roles_config rc on rc.name = ur.role
      join public.role_permissions rp on rp.role_id = rc.id
      where ur.user_id = p_uid
        and rp.module = 'Agency QA'
        and rp.submodule = 'Chatters QA'
        and rp.can_access = true
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_create_cowork_session(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles_config rc ON rc.name = ur.role
    JOIN public.role_permissions rp ON rp.role_id = rc.id
    WHERE ur.user_id = _user_id
      AND rc.is_active = true
      AND rp.module = 'Cowork'
      AND rp.can_access = true
  )
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_user(_caller uuid, _target uuid, _action text, _new_role text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_level int; v_target_level int; v_new_role_level int;
  v_is_admin boolean; v_target_is_admin boolean; v_new_role_is_admin boolean;
  v_admin_count int; v_effective_role text; v_ctx jsonb;
BEGIN
  -- Allowlist: una acción no declarada se DENIEGA acá, no queda abierta por olvido.
  IF _action IS NULL OR _action NOT IN
     ('assign_role','remove_role','delete_user','reset_password',
      'update_profile','create_user','list_users') THEN
    RETURN jsonb_build_object('allowed', false, 'reason','unknown_action');
  END IF;
  IF _caller IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason','no_caller');
  END IF;
  IF NOT public.can_manage_users(_caller) THEN
    RETURN jsonb_build_object('allowed', false, 'reason','no_user_management_permission');
  END IF;

  v_is_admin     := public.is_in_role_group(_caller,'admin');
  v_caller_level := public.actor_level(_caller);
  v_target_level := CASE WHEN _target IS NULL THEN NULL ELSE public.target_level(_target) END;
  v_ctx := jsonb_build_object('caller_level',v_caller_level,'target_level',v_target_level);

  -- Si el rol pedido es el que YA tiene, no es asignación: así "editar el nombre"
  -- (que el front manda siempre con role) no se convierte en cambio de rol.
  IF _new_role IS NOT NULL AND _target IS NOT NULL THEN
    SELECT ur.role::text INTO v_effective_role
    FROM public.user_roles ur WHERE ur.user_id = _target LIMIT 1;
    IF v_effective_role = _new_role THEN _new_role := NULL; END IF;
  END IF;

  IF _action IN ('assign_role','create_user','update_profile') AND _new_role IS NOT NULL THEN
    SELECT rc.level, COALESCE(rg.is_admin,false)
      INTO v_new_role_level, v_new_role_is_admin
    FROM public.roles_config rc
    LEFT JOIN public.role_groups rg ON rg.role_name = rc.name
    WHERE rc.name = _new_role AND rc.is_active;

    IF v_new_role_level IS NULL THEN
      RETURN jsonb_build_object('allowed',false,'reason','invalid_or_inactive_role')||v_ctx;
    END IF;
    -- ESTRICTO (decisión de Jhon): >= , no >. Un supervisor no puede nombrar a otro
    -- supervisor, ni HHRR a otro HHRR. Solo el admin saltea la escalera.
    IF NOT v_is_admin AND v_new_role_level >= v_caller_level THEN
      RETURN jsonb_build_object('allowed',false,'reason','role_at_or_above_caller_level',
                                'new_role_level',v_new_role_level)||v_ctx;
    END IF;
  END IF;

  IF _action = 'create_user' THEN
    RETURN jsonb_build_object('allowed',true,'reason','ok')||v_ctx;
  END IF;
  IF _action = 'list_users' THEN
    RETURN jsonb_build_object('allowed',true,'reason','ok')||v_ctx;
  END IF;
  IF _target IS NULL THEN
    RETURN jsonb_build_object('allowed',false,'reason','no_target')||v_ctx;
  END IF;

  IF _target = _caller THEN
    IF _action = 'update_profile' AND _new_role IS NULL THEN
      RETURN jsonb_build_object('allowed',true,'reason','self_profile_ok')||v_ctx;
    END IF;
    RETURN jsonb_build_object('allowed',false,'reason','self_target_not_allowed')||v_ctx;
  END IF;

  v_target_is_admin := public.is_in_role_group(_target,'admin');

  -- Último admin: decide por role_groups.is_admin (fuente de verdad), no por level.
  IF v_target_is_admin AND (
       _action IN ('delete_user','remove_role')
       OR (_action IN ('assign_role','update_profile')
           AND _new_role IS NOT NULL AND NOT COALESCE(v_new_role_is_admin,false))
     ) THEN
    SELECT COUNT(DISTINCT ur.user_id) INTO v_admin_count
    FROM public.user_roles ur JOIN public.role_groups rg ON rg.role_name = ur.role::text
    WHERE rg.is_admin;
    IF v_admin_count <= 1 THEN
      RETURN jsonb_build_object('allowed',false,'reason','last_admin')||v_ctx;
    END IF;
  END IF;

  IF v_is_admin THEN
    RETURN jsonb_build_object('allowed',true,'reason','admin_bypass')||v_ctx;
  END IF;
  IF v_caller_level > v_target_level THEN
    RETURN jsonb_build_object('allowed',true,'reason','ok')||v_ctx;
  END IF;
  RETURN jsonb_build_object('allowed',false,
    'reason', CASE WHEN v_target_level = 999 THEN 'unknown_target_role'
                   ELSE 'target_level_not_below_caller' END)||v_ctx;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_users(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    _user_id IS NOT NULL
    AND public.can_use_module_function(_user_id,'Administración','Usuarios','manager_or_above')
    AND public.actor_level(_user_id) > 0, false);
$function$
;

CREATE OR REPLACE FUNCTION public.can_see_contact_phone()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_phone_privileged()
    or exists (
      select 1
      from public.user_roles ur
      join public.roles_config rc
        on rc.name = ur.role and rc.is_active
      join public.role_permissions rp
        on rp.role_id = rc.id
      where ur.user_id = auth.uid()
        and rp.module = 'Contactos'
        and rp.submodule = 'Ver Teléfonos'
        and rp.can_access = true
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_use_blu_mp(p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    public.blu_is_management(p_uid)
    or exists (
      select 1
      from public.user_roles ur
      join public.roles_config rc on rc.name = ur.role
      join public.role_permissions rp on rp.role_id = rc.id
      where ur.user_id = p_uid
        and rp.can_access = true
        and (
          (rp.module = 'Mensajes Pro' and rp.submodule is null)
          or (rp.module = 'Agency QA' and rp.submodule = 'Chatters QA')
        )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_use_module_function(_user_id uuid, _module text, _submodule text, _fallback_group text DEFAULT 'supervisor_or_above'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_explicit boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_in_role_group(_user_id, 'admin') THEN
    RETURN true;
  END IF;

  SELECT rp.can_access INTO v_explicit
  FROM public.user_roles ur
  JOIN public.roles_config rc ON rc.name = ur.role AND rc.is_active
  JOIN public.role_permissions rp ON rp.role_id = rc.id
  WHERE ur.user_id = _user_id
    AND rp.module = _module
    AND rp.submodule = _submodule
  ORDER BY rp.can_access DESC
  LIMIT 1;

  IF v_explicit IS NOT NULL THEN
    RETURN v_explicit;
  END IF;

  RETURN public.is_in_role_group(_user_id, _fallback_group);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.closer_scope_agent_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    -- Manager o superior: sin restricción (no toca nada de lo que ya existía).
    when exists (
      select 1 from public.user_roles ur
      join public.role_groups rg on rg.role_name = ur.role::text
      where ur.user_id = auth.uid() and rg.is_manager_or_above
    ) then null
    -- Closer Supervisor: él mismo + todos los que NO son supervisores
    -- (closers rasos, LLG, agents). Excluye a sus pares y a quien esté por encima.
    when exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role::text = 'Closer Supervisor'
    ) then (
      select array_agg(distinct p.id)
      from public.profiles p
      where p.id = auth.uid()
         or not exists (
              select 1 from public.user_roles ur2
              join public.role_groups rg2 on rg2.role_name = ur2.role::text
              where ur2.user_id = p.id and rg2.is_supervisor_or_above
            )
    )
    -- Cualquier otro rol: sin cambios respecto de lo que ya hacía el frontend.
    else null
  end
$function$
;

CREATE OR REPLACE FUNCTION public.franja_de_tipo(_is_admin boolean, _is_manager boolean, _is_supervisor boolean)
 RETURNS integer[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when coalesce(_is_admin, false) then array[100, 100]
              when coalesce(_is_manager, false) then array[80, 99]
              when coalesce(_is_supervisor, false) then array[50, 79]
              else array[20, 49] end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_closers_roster()
 RETURNS TABLE(id uuid, full_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (public.is_in_role_group(auth.uid(), 'supervisor_or_above')
          or public.has_closer_global_scope(auth.uid())) then
    return;
  end if;
  return query
  select ur.user_id, coalesce(p.full_name, '(sin nombre)')
  from public.user_roles ur
  left join public.profiles p on p.id = ur.user_id
  where ur.role = 'closer'
     or exists (
       select 1 from public.role_base_grants g
       where g.role_name = ur.role and g.base_role = 'closer'
     )
  order by p.full_name asc nulls last;
end; $function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.has_chatter_evaluator_access(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    -- Admin bypass: mismo comportamiento que el frontend (admin ve todo)
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.role = 'admin'
    )
    OR
    -- Permiso explícito Chatters → Evaluator o acceso al módulo entero
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles_config rc ON rc.name = ur.role
      JOIN public.role_permissions rp ON rp.role_id = rc.id
      WHERE ur.user_id = _user_id
        AND rp.module = 'Chatters'
        AND (rp.submodule = 'Evaluator' OR rp.submodule IS NULL)
        AND rp.can_access = true
    );
$function$
;

CREATE OR REPLACE FUNCTION public.has_chatter_global_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles_config rc ON rc.name = ur.role
      JOIN public.role_permissions rp ON rp.role_id = rc.id
      WHERE ur.user_id = _user_id
        AND rp.module = 'Chatters'
        AND (rp.submodule = 'Evaluator' OR rp.submodule IS NULL)
        AND rp.can_access = true
        AND COALESCE(rp.data_scope, 'all') = 'all'
    );
$function$
;

CREATE OR REPLACE FUNCTION public.has_closer_global_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_in_role_group(_user_id,'admin') or exists (
    select 1 from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id and rp.module = 'Closers' and rp.submodule is null
      and rp.can_access and coalesce(rp.data_scope,'all') <> 'self');
$function$
;

CREATE OR REPLACE FUNCTION public.has_company_qa_global_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_in_role_group(_user_id,'admin') or exists (
    select 1 from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id and rp.module = 'Company QA' and rp.submodule is null
      and rp.can_access and coalesce(rp.data_scope,'all') <> 'self');
$function$
;

CREATE OR REPLACE FUNCTION public.has_contactos_global_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_in_role_group(_user_id,'admin') or exists (
    select 1 from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id and rp.module = 'Contactos' and rp.submodule is null
      and rp.can_access and coalesce(rp.data_scope,'all') <> 'self');
$function$
;

CREATE OR REPLACE FUNCTION public.has_cowork_global_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'admin')
      or exists (
        select 1
        from public.user_roles ur
        join public.roles_config rc on rc.name = ur.role
        join public.role_permissions rp on rp.role_id = rc.id
        where ur.user_id = _user_id
          and rp.module = 'Cowork' and rp.submodule is null
          and rp.can_access = true
          and coalesce(rp.data_scope, 'all') = 'all'
      );
$function$
;

CREATE OR REPLACE FUNCTION public.has_cowork_team_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id
      and rp.module = 'Cowork' and rp.submodule is null
      and rp.can_access = true
      and rp.data_scope = 'subordinates'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_creators_global_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_in_role_group(_user_id,'admin')
    OR ( NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles_config rc ON rc.name=ur.role
                     JOIN public.role_permissions rp ON rp.role_id=rc.id
                     WHERE ur.user_id=_user_id AND rp.module='Creadores' AND rp.submodule IS NULL AND rp.data_scope='self')
         AND ( public.is_in_role_group(_user_id,'supervisor_or_above')
               OR EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles_config rc ON rc.name=ur.role
                          JOIN public.role_permissions rp ON rp.role_id=rc.id
                          WHERE ur.user_id=_user_id AND rp.module='Creadores' AND rp.submodule IS NULL
                            AND rp.can_access AND rp.data_scope IS DISTINCT FROM 'self') ) );
$function$
;

CREATE OR REPLACE FUNCTION public.has_finanzas_access(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_in_role_group(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles_config rc ON rc.name = ur.role
      JOIN public.role_permissions rp ON rp.role_id = rc.id
      WHERE ur.user_id = _user_id AND rp.module = 'Finanzas' AND rp.can_access = true
    );
$function$
;

CREATE OR REPLACE FUNCTION public.has_grabaciones_global_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'admin')
      or exists (
        select 1
        from public.user_roles ur
        join public.roles_config rc on rc.name = ur.role
        join public.role_permissions rp on rp.role_id = rc.id
        where ur.user_id = _user_id
          and rp.module = 'Grabaciones' and rp.submodule is null
          and rp.can_access = true
          and coalesce(rp.data_scope, 'all') = 'all'
      );
$function$
;

CREATE OR REPLACE FUNCTION public.has_grabaciones_team_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id
      and rp.module = 'Grabaciones' and rp.submodule is null
      and rp.can_access = true
      and rp.data_scope = 'subordinates'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_hr_access(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_in_role_group(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles_config rc ON rc.name = ur.role
      JOIN public.role_permissions rp ON rp.role_id = rc.id
      WHERE ur.user_id = _user_id AND rp.module = 'HR' AND rp.can_access = true
    );
$function$
;

CREATE OR REPLACE FUNCTION public.has_leadgen_global_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_in_role_group(_user_id,'admin') or exists (
    select 1 from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id and rp.module = 'LeadGen' and rp.submodule is null
      and rp.can_access and coalesce(rp.data_scope,'all') <> 'self');
$function$
;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _submodule text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role_id uuid;
  v_val boolean;
begin
  if public.is_in_role_group(_user_id, 'admin') then
    return true;
  end if;

  select rc.id into v_role_id
  from public.user_roles ur
  join public.roles_config rc on rc.name = ur.role and rc.is_active
  where ur.user_id = _user_id
  limit 1;

  if v_role_id is null then
    return false;
  end if;

  if _submodule is not null then
    select rp.can_access into v_val
    from public.role_permissions rp
    where rp.role_id = v_role_id and rp.module = _module and rp.submodule = _submodule
    limit 1;
    if v_val is not null then
      return v_val;
    end if;
  end if;

  select rp.can_access into v_val
  from public.role_permissions rp
  where rp.role_id = v_role_id and rp.module = _module and rp.submodule is null
  limit 1;
  if v_val is not null then
    return v_val;
  end if;

  select bool_or(rp.can_access) into v_val
  from public.role_permissions rp
  where rp.role_id = v_role_id and rp.module = _module;

  return coalesce(v_val, false);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_promolog_global_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_in_role_group(_user_id, 'admin') or exists (
    select 1
    from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id
      and rp.module = 'Promolog'
      and rp.submodule is null
      and rp.can_access
      and coalesce(rp.data_scope, 'all') <> 'self'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_qa_global_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_in_role_group(_user_id,'admin') or exists (
    select 1 from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id and rp.module = 'Agency QA' and rp.submodule is null
      and rp.can_access and coalesce(rp.data_scope,'all') <> 'self');
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role::text
  )
  or case _role::text
    when 'admin'      then public.is_in_role_group(_user_id, 'admin')
    when 'manager'    then public.is_in_role_group(_user_id, 'manager_or_above')
    when 'supervisor' then public.is_in_role_group(_user_id, 'supervisor_or_above')
    else exists (
      select 1
      from public.user_roles ur
      join public.role_base_grants g on g.role_name = ur.role
      where ur.user_id = _user_id and g.base_role = _role::text
    )
  end
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
  or case _role
    when 'admin'      then public.is_in_role_group(_user_id, 'admin')
    when 'manager'    then public.is_in_role_group(_user_id, 'manager_or_above')
    when 'supervisor' then public.is_in_role_group(_user_id, 'supervisor_or_above')
    else exists (
      select 1
      from public.user_roles ur
      join public.role_base_grants g on g.role_name = ur.role
      where ur.user_id = _user_id and g.base_role = _role
    )
  end
$function$
;

CREATE OR REPLACE FUNCTION public.has_scouter_global_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'admin')
      or exists (
        select 1
        from public.user_roles ur
        join public.roles_config rc on rc.name = ur.role
        join public.role_permissions rp on rp.role_id = rc.id
        where ur.user_id = _user_id
          and rp.module = 'Scouter Assist' and rp.submodule is null
          and rp.can_access = true
          and coalesce(rp.data_scope, 'all') = 'all'
      );
$function$
;

CREATE OR REPLACE FUNCTION public.has_scouter_team_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id
      and rp.module = 'Scouter Assist' and rp.submodule is null
      and rp.can_access = true
      and rp.data_scope = 'subordinates'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_telefonos_global_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles_config rc ON rc.name = ur.role
      JOIN public.role_permissions rp ON rp.role_id = rc.id
      WHERE ur.user_id = _user_id
        AND rp.module = 'Telefonos'
        AND (rp.submodule = 'Dispositivos' OR rp.submodule IS NULL)
        AND rp.can_access = true
        AND COALESCE(rp.data_scope, 'all') = 'all'
    );
$function$
;

CREATE OR REPLACE FUNCTION public.has_tg_inbox_global_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_in_role_group(_user_id, 'admin')
    OR (
      public.is_in_role_group(_user_id, 'supervisor_or_above')
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles_config rc ON rc.name = ur.role
        JOIN public.role_permissions rp ON rp.role_id = rc.id
        WHERE ur.user_id = _user_id
          AND rp.module = 'Telegram'
          AND rp.submodule IS NULL
          AND rp.data_scope = 'self'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles_config rc ON rc.name = ur.role
        JOIN public.role_permissions rp ON rp.role_id = rc.id
        WHERE ur.user_id = _user_id
          AND rp.module = 'Telegram'
          AND rp.submodule IS NULL
          AND rp.can_access = false
      )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.has_wa_inbox_global_scope(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_in_role_group(_user_id, 'admin')
    OR (
      public.is_in_role_group(_user_id, 'supervisor_or_above')
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles_config rc ON rc.name = ur.role
        JOIN public.role_permissions rp ON rp.role_id = rc.id
        WHERE ur.user_id = _user_id
          AND rp.module = 'WhatsApp'
          AND rp.submodule IS NULL
          AND rp.data_scope = 'self'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles_config rc ON rc.name = ur.role
        JOIN public.role_permissions rp ON rp.role_id = rc.id
        WHERE ur.user_id = _user_id
          AND rp.module = 'WhatsApp'
          AND rp.submodule IS NULL
          AND rp.can_access = false
      )
    );
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.is_phone_privileged()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role', false) or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin') $function$
;

CREATE OR REPLACE FUNCTION public.list_chatter_evaluators()
 RETURNS TABLE(user_id uuid, full_name text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH evaluator_role_names AS (
    SELECT DISTINCT rc.name
    FROM public.role_permissions rp
    JOIN public.roles_config rc ON rc.id = rp.role_id
    WHERE rp.module = 'Chatters'
      AND (rp.submodule = 'Evaluator' OR rp.submodule IS NULL)
      AND rp.can_access = true
    UNION
    SELECT 'admin'
  ),
  evaluator_user_ids AS (
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN (SELECT name FROM evaluator_role_names)
  )
  SELECT
    p.id AS user_id,
    COALESCE(p.full_name, 'Sin nombre') AS full_name,
    p.avatar_url
  FROM public.profiles p
  WHERE p.id IN (SELECT user_id FROM evaluator_user_ids)
  ORDER BY COALESCE(p.full_name, 'zzz') COLLATE "es-x-icu";
$function$
;

CREATE OR REPLACE FUNCTION public.log_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if TG_OP = 'INSERT' then
    insert into public.audit_log (user_id, action, target_type, target_id, details)
    values (NEW.user_id, 'role_assigned', 'user', NEW.user_id::text,
            jsonb_build_object('role', NEW.role));
    return NEW;
  elsif TG_OP = 'DELETE' then
    insert into public.audit_log (user_id, action, target_type, target_id, details)
    values (OLD.user_id, 'role_removed', 'user', OLD.user_id::text,
            jsonb_build_object('role', OLD.role));
    return OLD;
  elsif TG_OP = 'UPDATE' then
    insert into public.audit_log (user_id, action, target_type, target_id, details)
    values (NEW.user_id, 'role_changed', 'user', NEW.user_id::text,
            jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role));
    return NEW;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mail_recipient_directory()
 RETURNS TABLE(email text, nombre text, tipo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with permitido as (
    select 1 from public.mail_credentials
    where user_id = auth.uid() and revoked_at is null
    limit 1
  )
  -- Compañeros (excluye al que llama: uno no se escribe a sí mismo desde el "Para")
  select lower(u.email)::text,
         coalesce(nullif(btrim(p.full_name), ''), split_part(u.email, '@', 1))::text,
         'persona'::text
  from auth.users u
  join public.profiles p on p.id = u.id
  where exists (select 1 from permitido)
    and u.deleted_at is null
    and u.email is not null
    and (lower(u.email) like '%@maven-ai.me' or lower(u.email) like '%@unlok.me')
    and u.id <> auth.uid()
  union all
  -- Listas de distribución por rol, solo las que existen de verdad en Zoho
  select lower(g.group_email)::text, g.group_name::text, 'grupo'::text
  from public.email_role_groups g
  where exists (select 1 from permitido)
    and g.enabled
    and g.zgid is not null
$function$
;

CREATE OR REPLACE FUNCTION public.my_can_manage_user(_target uuid, _action text, _new_role text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.can_manage_user(auth.uid(), _target, _action, _new_role);
$function$
;

CREATE OR REPLACE FUNCTION public.nivel_por_tipo(_is_admin boolean, _is_manager boolean, _is_supervisor boolean)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when coalesce(_is_admin, false) then 100
              when coalesce(_is_manager, false) then 80
              when coalesce(_is_supervisor, false) then 50
              else 20 end;
$function$
;

CREATE OR REPLACE FUNCTION public.puede_ver_modulo(_user_id uuid, _module text, _submodule text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role_id uuid;
begin
  if _module is null then
    return true;
  end if;
  if public.is_in_role_group(_user_id, 'admin') then
    return true;
  end if;
  select rc.id into v_role_id
  from public.user_roles ur
  join public.roles_config rc on rc.name = ur.role and rc.is_active
  where ur.user_id = _user_id
  limit 1;
  if _module in ('Dashboard', 'Messenger', 'Cowork', 'Meet', 'Correo', 'Grabaciones') then
    if v_role_id is null or not exists (
      select 1 from public.role_permissions rp where rp.role_id = v_role_id and rp.module = _module
    ) then
      return true;
    end if;
  end if;
  return public.has_permission(_user_id, _module, _submodule);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.target_level(_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id) THEN 0
    ELSE COALESCE((SELECT MAX(COALESCE(rc.level, 999))
                   FROM public.user_roles ur
                   LEFT JOIN public.roles_config rc ON rc.name = ur.role::text
                   WHERE ur.user_id = _user_id), 999)
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_role_groups_sync_level()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT'
     or public.nivel_por_tipo(old.is_admin, old.is_manager_or_above, old.is_supervisor_or_above)
        is distinct from public.nivel_por_tipo(new.is_admin, new.is_manager_or_above, new.is_supervisor_or_above)
  then
    update public.roles_config
       set level = public.nivel_por_tipo(new.is_admin, new.is_manager_or_above, new.is_supervisor_or_above)
     where name = new.role_name;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_role_groups_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_roles_config_guard_level()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND NEW.level IS DISTINCT FROM OLD.level
     AND auth.uid() IS NOT NULL AND NOT public.is_in_role_group(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'solo un admin puede cambiar el nivel de un rol' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' AND auth.uid() IS NOT NULL
     AND NOT public.is_in_role_group(auth.uid(),'admin') THEN
    NEW.level := LEAST(COALESCE(NEW.level,10), public.actor_level(auth.uid()));
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_roles_config_level_en_franja()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare f int[];
begin
  select public.franja_de_tipo(rg.is_admin, rg.is_manager_or_above, rg.is_supervisor_or_above)
    into f from public.role_groups rg where rg.role_name = new.name;
  if f is not null and (new.level < f[1] or new.level > f[2]) then
    raise exception 'El nivel % está fuera de la franja de su tipo (%–%).', new.level, f[1], f[2]
      using errcode = '23514';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_roles_config_sync_role_groups()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.role_groups (role_name, is_member, description)
    VALUES (NEW.name, true, NEW.description)
    ON CONFLICT (role_name) DO NOTHING;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name THEN
    INSERT INTO public.role_groups
      (role_name, is_admin, is_manager_or_above, is_supervisor_or_above, is_member, description, created_at, updated_at)
    SELECT NEW.name, is_admin, is_manager_or_above, is_supervisor_or_above, is_member, NEW.description, created_at, now()
    FROM public.role_groups WHERE role_name = OLD.name
    ON CONFLICT (role_name) DO NOTHING;

    UPDATE public.user_roles SET role = NEW.name WHERE role = OLD.name;

    DELETE FROM public.role_groups WHERE role_name = OLD.name;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_user_roles_check_role_group()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.role_groups WHERE role_name = NEW.role) THEN
    RAISE WARNING 'role "%" no está registrado en public.role_groups — las RLS policies que usan is_in_role_group() no lo cubrirán. Agregalo a role_groups con los flags apropiados.', NEW.role;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_role_groups_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/role-email-groups',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := '{"action":"sync"}'::jsonb,
    timeout_milliseconds := 60000
  );
  return null;
end
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.wa_copilot_try_consume(_user_id uuid)
 RETURNS TABLE(allowed boolean, used integer, lim integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today     date := (now() at time zone 'America/Bogota')::date;
  v_lim       int;
  v_used      int;
  v_unlimited boolean := false;
begin
  if public.is_in_role_group(_user_id, 'manager_or_above') then
    v_unlimited := true;
  else
    select p.ai_daily_quota_override into v_lim
      from public.profiles p where p.id = _user_id;
    if v_lim is null then
      select rc.ai_daily_quota into v_lim
        from public.user_roles ur
        join public.roles_config rc on rc.name = ur.role and rc.is_active
        where ur.user_id = _user_id
        limit 1;
    end if;
    v_lim := coalesce(v_lim, 20);
  end if;

  select count into v_used
    from public.wa_copilot_usage
    where user_id = _user_id and usage_date = v_today;
  v_used := coalesce(v_used, 0);

  if not v_unlimited and v_used >= v_lim then
    return query select false, v_used, v_lim;
    return;
  end if;

  insert into public.wa_copilot_usage (user_id, usage_date, count)
    values (_user_id, v_today, 1)
    on conflict (user_id, usage_date)
    do update set count = public.wa_copilot_usage.count + 1;

  return query select true, v_used + 1, case when v_unlimited then null else v_lim end;
end;
$function$
;

-- ─── Triggers (pg_get_triggerdef de prod) ───────────────────────────────────
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER trg_user_roles_audit AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION log_role_change();
CREATE TRIGGER trg_user_roles_check_role_group AFTER INSERT OR UPDATE OF role ON public.user_roles FOR EACH ROW EXECUTE FUNCTION tg_user_roles_check_role_group();
CREATE TRIGGER trg_user_roles_sync_groups AFTER INSERT OR DELETE OR UPDATE OF role ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION trg_role_groups_sync();
CREATE TRIGGER trg_roles_config_level_en_franja BEFORE UPDATE OF level ON public.roles_config FOR EACH ROW EXECUTE FUNCTION tg_roles_config_level_en_franja();
CREATE TRIGGER trg_roles_config_sync_groups AFTER INSERT OR UPDATE OF is_active, name ON public.roles_config FOR EACH STATEMENT EXECUTE FUNCTION trg_role_groups_sync();
CREATE TRIGGER trg_roles_config_guard_level BEFORE INSERT OR UPDATE ON public.roles_config FOR EACH ROW EXECUTE FUNCTION tg_roles_config_guard_level();
CREATE TRIGGER trg_roles_config_sync_insert AFTER INSERT ON public.roles_config FOR EACH ROW EXECUTE FUNCTION tg_roles_config_sync_role_groups();
CREATE TRIGGER trg_roles_config_sync_rename AFTER UPDATE OF name ON public.roles_config FOR EACH ROW EXECUTE FUNCTION tg_roles_config_sync_role_groups();
CREATE TRIGGER update_roles_config_updated_at BEFORE UPDATE ON public.roles_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_role_groups_updated_at BEFORE UPDATE ON public.role_groups FOR EACH ROW EXECUTE FUNCTION tg_role_groups_updated_at();
CREATE TRIGGER trg_role_groups_sync_level AFTER INSERT OR UPDATE OF is_admin, is_manager_or_above, is_supervisor_or_above ON public.role_groups FOR EACH ROW EXECUTE FUNCTION tg_role_groups_sync_level();

-- ─── RLS y políticas (pg_policies de prod) ──────────────────────────────────
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.user_roles enable row level security;
alter table public.roles_config enable row level security;
alter table public.role_permissions enable row level security;
alter table public.role_groups enable row level security;
alter table public.role_base_grants enable row level security;

create policy tenants_self_visible on public.tenants as permissive for select to authenticated using ((id IN ( SELECT tenant_members.tenant_id FROM tenant_members WHERE (tenant_members.user_id = auth.uid()))));
create policy tenant_members_own on public.tenant_members as permissive for select to authenticated using ((user_id = auth.uid()));
create policy "Users can view own roles" on public.user_roles as permissive for select to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "Admins can view all user roles" on public.user_roles as permissive for select to authenticated using (( SELECT has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) AS has_role));
create policy "Admins can insert roles_config" on public.roles_config as permissive for insert to authenticated with check (has_role(auth.uid(), 'admin'::app_role));
create policy "Admins can delete roles_config" on public.roles_config as permissive for delete to authenticated using (has_role(auth.uid(), 'admin'::app_role));
create policy "Admins can update roles_config" on public.roles_config as permissive for update to authenticated using (has_role(auth.uid(), 'admin'::app_role));
create policy "Authenticated users can view roles_config" on public.roles_config as permissive for select to authenticated using (true);
create policy "Admins can delete role_permissions" on public.role_permissions as permissive for delete to authenticated using (has_role(auth.uid(), 'admin'::app_role));
create policy "Admins can insert role_permissions" on public.role_permissions as permissive for insert to authenticated with check (has_role(auth.uid(), 'admin'::app_role));
create policy "Admins can update role_permissions" on public.role_permissions as permissive for update to authenticated using (has_role(auth.uid(), 'admin'::app_role));
create policy "Authenticated users can view role_permissions" on public.role_permissions as permissive for select to authenticated using (true);
create policy "Anyone authenticated can read role_groups" on public.role_groups as permissive for select to authenticated using (true);
create policy "Only admins can modify role_groups" on public.role_groups as permissive for all to authenticated using (is_in_role_group(auth.uid(), 'admin'::text)) with check (is_in_role_group(auth.uid(), 'admin'::text));
create policy "Admins manage role_base_grants" on public.role_base_grants as permissive for all to authenticated using (is_in_role_group(auth.uid(), 'admin'::text)) with check (is_in_role_group(auth.uid(), 'admin'::text));

set check_function_bodies = on;
