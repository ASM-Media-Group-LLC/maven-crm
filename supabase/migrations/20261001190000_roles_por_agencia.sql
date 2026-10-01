-- ROLES POR AGENCIA (fase 0, entrega 2a del plan «Maven Basic»).
-- Banco: supabase/tests/roles_por_agencia.ts, sobre el catálogo de prod del 01/10
-- (fixtures/prod_roles_20261001.sql, con las huellas de las 56 funciones).
-- Requiere 20261001150000_agencias_base (una persona, una agencia).
--
-- Hasta hoy los roles eran de todo Maven: roles_config.name era único en toda la
-- base, role_groups y role_base_grants tenían el nombre como clave, y las 45
-- funciones que resuelven permisos cruzaban user_roles con esas tablas POR
-- NOMBRE. Una segunda agencia no podía tener su «admin» ni su «Chatter», y el
-- admin de cualquier agencia pasaba los controles de todas.
--
-- Qué cambia:
--   1. user_roles.tenant_id: la agencia de la persona (una sola, ver
--      agencias_base). La pone la base, nunca el pedido: user_roles_agencia la
--      saca de tenant_members, y tenant_members_lleva_la_agencia la actualiza
--      cuando cambia la membresía. Puede ser NULL: el alta crea el rol antes de
--      que admin-user-actions ponga la agencia (y una cuenta del registro público
--      no tiene agencia). Con NULL ningún cruce encuentra su rol: sin permisos.
--   2. roles_config, role_groups y role_base_grants: tenant_id NOT NULL (por
--      defecto la agencia de quien inserta) y las claves pasan a incluirla:
--      UNIQUE (tenant_id, name) y PK (tenant_id, role_name[, base_role]).
--      role_permissions cuelga de roles_config por id: queda de su agencia sola.
--      La agencia de un rol no se cambia nunca (rol_agencia_inmutable).
--   3. Políticas: cada agencia ve y edita solo sus roles, y el admin solo ve los
--      user_roles de su agencia. ALTER POLICY, nunca DROP + CREATE.
--   4. Las 38 funciones que cruzan por nombre suman «y de la misma agencia»
--      (cuatro reglas, una por forma de cruce), y 7 más se ajustan a mano con un
--      reemplazo textual: los 4 triggers de roles, can_manage_user (nadie
--      gestiona a alguien de otra agencia; el último admin se cuenta por
--      agencia), get_closers_roster, list_chatter_evaluators y log_role_change
--      (que no anota como cambio de rol que la base ponga la agencia). Cada
--      función se reescribe desde su definición viva (pg_get_functiondef), como
--      20260929180000_funciones_sin_voseo; si una regla no encaja las veces
--      esperadas, la migración falla. Al final se revisa TODO el esquema: si
--      queda un cruce por nombre sin agencia, o una función que lee las tablas
--      de roles y no está en la lista, también falla.
--      admin_list_user_roles además lista solo a la gente de la agencia de quien
--      llama.
--   5. sembrar_roles_de_agencia(agencia, plan, desde): la plantilla por plan
--      (decisión de Jhon, 01/10). Enterprise: admin, supervisor y employee.
--      Agency suma Chatter, Chatter Supervisor y closer. Copia nombre, tipo de
--      acceso, nivel, permisos y herencias de la agencia de origen. Solo
--      service_role (la va a llamar el panel de plataforma).
--
-- Con una sola agencia el resultado de cada función es el mismo de antes (el
-- banco lo compara persona por persona). ⚠️ Antes de crear la SEGUNDA agencia
-- falta la entrega 2b:
--   · trg_role_groups_sync → la edge role-email-groups arma las listas de
--     correo por NOMBRE de rol: un «Chatter» de otra agencia entraría a la lista
--     de chatters de KASH. email_role_groups y hr_role_cost siguen con el nombre
--     como clave.
--   · Las funciones que listan gente o comparan nombres escritos a mano
--     (get_assignable_closers, get_karma_profile, list_chatters…), y los
--     controles de 'admin' de las edge functions.
--   · Las tablas de datos: que un admin de una agencia sea admin de SU agencia
--     depende de que cada tabla filtre por tenant_id (entregas 3 en adelante).
--
-- Despliegue: el frontend de este PR guarda el tipo de acceso de un rol con
-- UPDATE y, si no existe, INSERT (sirve antes y después de la migración: el
-- upsert por role_name deja de existir con la PK nueva). Conviene aplicar la
-- migración apenas se mergea; manage-user-roles y admin-user-actions filtran el
-- rol por agencia y andan con las dos.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre): restaura cada función
-- desde roles_por_agencia_respaldo (su definición de antes, guardada aquí), las
-- políticas y las claves. Solo sirve con UNA agencia: con dos hay nombres
-- repetidos y las claves viejas no entran.
--| drop function if exists public.sembrar_roles_de_agencia(uuid, text, uuid);
--| do $$ declare r record; begin for r in select def from public.roles_por_agencia_respaldo loop execute r.def; end loop; end $$;
--| drop table public.roles_por_agencia_respaldo;
--| alter policy "Admins can view all user roles" on public.user_roles using (( SELECT has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) AS has_role));
--| alter policy "Authenticated users can view roles_config" on public.roles_config using (true);
--| alter policy "Admins can insert roles_config" on public.roles_config with check (has_role(auth.uid(), 'admin'::app_role));
--| alter policy "Admins can update roles_config" on public.roles_config using (has_role(auth.uid(), 'admin'::app_role));
--| alter policy "Admins can delete roles_config" on public.roles_config using (has_role(auth.uid(), 'admin'::app_role));
--| alter policy "Authenticated users can view role_permissions" on public.role_permissions using (true);
--| alter policy "Admins can insert role_permissions" on public.role_permissions with check (has_role(auth.uid(), 'admin'::app_role));
--| alter policy "Admins can update role_permissions" on public.role_permissions using (has_role(auth.uid(), 'admin'::app_role));
--| alter policy "Admins can delete role_permissions" on public.role_permissions using (has_role(auth.uid(), 'admin'::app_role));
--| alter policy "Anyone authenticated can read role_groups" on public.role_groups using (true);
--| alter policy "Only admins can modify role_groups" on public.role_groups using (is_in_role_group(auth.uid(), 'admin'::text)) with check (is_in_role_group(auth.uid(), 'admin'::text));
--| alter policy "Admins manage role_base_grants" on public.role_base_grants using (is_in_role_group(auth.uid(), 'admin'::text)) with check (is_in_role_group(auth.uid(), 'admin'::text));
--| drop trigger if exists user_roles_agencia on public.user_roles;
--| drop trigger if exists tenant_members_lleva_la_agencia on public.tenant_members;
--| drop trigger if exists roles_config_agencia_inmutable on public.roles_config;
--| drop trigger if exists role_groups_agencia_inmutable on public.role_groups;
--| drop trigger if exists role_base_grants_agencia_inmutable on public.role_base_grants;
--| drop function if exists public.user_roles_agencia();
--| drop function if exists public.tenant_members_lleva_la_agencia();
--| drop function if exists public.rol_agencia_inmutable();
--| alter table public.role_base_grants drop constraint role_base_grants_pkey, add constraint role_base_grants_pkey primary key (role_name, base_role);
--| alter table public.role_base_grants drop column tenant_id;
--| alter table public.role_groups drop constraint role_groups_pkey, add constraint role_groups_pkey primary key (role_name);
--| alter table public.role_groups drop column tenant_id;
--| alter table public.roles_config drop constraint roles_config_agencia_nombre, add constraint roles_config_name_key unique (name);
--| alter table public.roles_config drop column tenant_id;
--| drop index if exists public.user_roles_agencia_rol_idx;
--| alter table public.user_roles drop column tenant_id;

-- ─── 0. Una sola agencia al aplicar: el relleno va a esa ────────────────────
do $$
declare
  n int;
begin
  select count(*) into n from public.tenants;
  if n <> 1 then
    raise exception 'roles_por_agencia: hay % agencias; el relleno de tenant_id supone exactamente una', n;
  end if;
end $$;

-- ─── 1. La agencia de cada fila de user_roles ───────────────────────────────
alter table public.user_roles add column tenant_id uuid references public.tenants(id) on delete cascade;

-- El relleno no es un cambio de rol: sin el trigger de auditoría, para no dejar
-- 82 «role_changed» de mentira.
alter table public.user_roles disable trigger trg_user_roles_audit;
update public.user_roles ur set tenant_id = tm.tenant_id
from public.tenant_members tm where tm.user_id = ur.user_id;
alter table public.user_roles enable trigger trg_user_roles_audit;

create index user_roles_agencia_rol_idx on public.user_roles (tenant_id, role);

comment on column public.user_roles.tenant_id is
  'La agencia de la persona. La pone la base (user_roles_agencia) desde tenant_members; NULL = sin agencia = sin permisos.';

create function public.user_roles_agencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.tenant_id := (select tm.tenant_id from public.tenant_members tm where tm.user_id = new.user_id);
  return new;
end $$;

create trigger user_roles_agencia
  before insert or update on public.user_roles
  for each row execute function public.user_roles_agencia();

-- Cuando cambia la membresía, los roles de esa persona se recalculan (el trigger
-- de arriba vuelve a leer tenant_members).
create function public.tenant_members_lleva_la_agencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.user_roles set tenant_id = null where user_id = old.user_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.user_roles set tenant_id = null where user_id = new.user_id;
  end if;
  return null;
end $$;

create trigger tenant_members_lleva_la_agencia
  after insert or update or delete on public.tenant_members
  for each row execute function public.tenant_members_lleva_la_agencia();

-- ─── 2. roles_config, role_groups y role_base_grants por agencia ────────────
alter table public.roles_config add column tenant_id uuid references public.tenants(id) on delete cascade;
alter table public.roles_config disable trigger update_roles_config_updated_at;
update public.roles_config set tenant_id = (select id from public.tenants);
alter table public.roles_config enable trigger update_roles_config_updated_at;
alter table public.roles_config
  alter column tenant_id set not null,
  alter column tenant_id set default public.current_tenant_id(),
  drop constraint roles_config_name_key,
  add constraint roles_config_agencia_nombre unique (tenant_id, name);

alter table public.role_groups add column tenant_id uuid references public.tenants(id) on delete cascade;
alter table public.role_groups disable trigger trg_role_groups_updated_at;
update public.role_groups set tenant_id = (select id from public.tenants);
alter table public.role_groups enable trigger trg_role_groups_updated_at;
alter table public.role_groups
  alter column tenant_id set not null,
  alter column tenant_id set default public.current_tenant_id(),
  drop constraint role_groups_pkey,
  add constraint role_groups_pkey primary key (tenant_id, role_name);

alter table public.role_base_grants add column tenant_id uuid references public.tenants(id) on delete cascade;
update public.role_base_grants set tenant_id = (select id from public.tenants);
alter table public.role_base_grants
  alter column tenant_id set not null,
  alter column tenant_id set default public.current_tenant_id(),
  drop constraint role_base_grants_pkey,
  add constraint role_base_grants_pkey primary key (tenant_id, role_name, base_role);

create function public.rol_agencia_inmutable()
returns trigger
language plpgsql
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'rol_agencia_inmutable: la agencia de un rol no se cambia' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger roles_config_agencia_inmutable before update of tenant_id on public.roles_config
  for each row execute function public.rol_agencia_inmutable();
create trigger role_groups_agencia_inmutable before update of tenant_id on public.role_groups
  for each row execute function public.rol_agencia_inmutable();
create trigger role_base_grants_agencia_inmutable before update of tenant_id on public.role_base_grants
  for each row execute function public.rol_agencia_inmutable();

-- ─── 3. Cada agencia ve y edita sus roles ───────────────────────────────────
alter policy "Admins can view all user roles" on public.user_roles
  using ((select public.has_role((select auth.uid()), 'admin'::public.app_role))
         and tenant_id = (select public.current_tenant_id()));

alter policy "Authenticated users can view roles_config" on public.roles_config
  using (tenant_id = (select public.current_tenant_id()));
alter policy "Admins can insert roles_config" on public.roles_config
  with check ((select public.has_role((select auth.uid()), 'admin'::public.app_role))
              and tenant_id = (select public.current_tenant_id()));
-- Sin WITH CHECK, como en prod: en un UPDATE el USING vale también para la fila nueva.
alter policy "Admins can update roles_config" on public.roles_config
  using ((select public.has_role((select auth.uid()), 'admin'::public.app_role))
         and tenant_id = (select public.current_tenant_id()));
alter policy "Admins can delete roles_config" on public.roles_config
  using ((select public.has_role((select auth.uid()), 'admin'::public.app_role))
         and tenant_id = (select public.current_tenant_id()));

alter policy "Authenticated users can view role_permissions" on public.role_permissions
  using (exists (select 1 from public.roles_config rc
                 where rc.id = role_permissions.role_id and rc.tenant_id = (select public.current_tenant_id())));
alter policy "Admins can insert role_permissions" on public.role_permissions
  with check ((select public.has_role((select auth.uid()), 'admin'::public.app_role))
              and exists (select 1 from public.roles_config rc
                          where rc.id = role_permissions.role_id and rc.tenant_id = (select public.current_tenant_id())));
alter policy "Admins can update role_permissions" on public.role_permissions
  using ((select public.has_role((select auth.uid()), 'admin'::public.app_role))
         and exists (select 1 from public.roles_config rc
                     where rc.id = role_permissions.role_id and rc.tenant_id = (select public.current_tenant_id())));
alter policy "Admins can delete role_permissions" on public.role_permissions
  using ((select public.has_role((select auth.uid()), 'admin'::public.app_role))
         and exists (select 1 from public.roles_config rc
                     where rc.id = role_permissions.role_id and rc.tenant_id = (select public.current_tenant_id())));

alter policy "Anyone authenticated can read role_groups" on public.role_groups
  using (tenant_id = (select public.current_tenant_id()));
alter policy "Only admins can modify role_groups" on public.role_groups
  using ((select public.is_in_role_group((select auth.uid()), 'admin'::text))
         and tenant_id = (select public.current_tenant_id()))
  with check ((select public.is_in_role_group((select auth.uid()), 'admin'::text))
              and tenant_id = (select public.current_tenant_id()));

alter policy "Admins manage role_base_grants" on public.role_base_grants
  using ((select public.is_in_role_group((select auth.uid()), 'admin'::text))
         and tenant_id = (select public.current_tenant_id()))
  with check ((select public.is_in_role_group((select auth.uid()), 'admin'::text))
              and tenant_id = (select public.current_tenant_id()));

-- ─── 4. Las funciones: el cruce por nombre, dentro de la agencia ────────────
-- Respaldo de cada definición tal como estaba (la vuelta atrás las restaura).
create table public.roles_por_agencia_respaldo (fn text primary key, def text not null, guardada timestamptz not null default now());
alter table public.roles_por_agencia_respaldo enable row level security;
revoke all on table public.roles_por_agencia_respaldo from public, anon, authenticated;
comment on table public.roles_por_agencia_respaldo is
  'Definiciones de antes de 20261001190000_roles_por_agencia, para su vuelta atrás. Sin políticas: solo postgres y service_role.';

-- Cuántas veces aplica cada regla en cada función (R1..R4, ver abajo).
create temp table _roles_reglas (fn text primary key, esperado int[] not null) on commit drop;
insert into _roles_reglas values
  ('public.actor_level(uuid)', '{1,0,0,0}'),
  ('public.admin_list_user_roles()', '{1,1,0,0}'),
  ('public.blu_is_management(uuid)', '{0,1,0,0}'),
  ('public.can_access_chatters_qa(uuid)', '{1,0,0,0}'),
  ('public.can_create_cowork_session(uuid)', '{1,0,0,0}'),
  ('public.can_manage_user(uuid,uuid,text,text)', '{0,1,0,0}'),
  ('public.can_see_contact_phone()', '{1,0,0,0}'),
  ('public.can_use_blu_mp(uuid)', '{1,0,0,0}'),
  ('public.can_use_module_function(uuid,text,text,text)', '{1,0,0,0}'),
  ('public.closer_scope_agent_ids()', '{0,1,1,0}'),
  ('public.get_closers_roster()', '{0,0,0,0}'),
  ('public.get_karma_profile(uuid)', '{0,1,0,0}'),
  ('public.has_chatter_evaluator_access(uuid)', '{1,0,0,0}'),
  ('public.has_chatter_global_scope(uuid)', '{1,0,0,0}'),
  ('public.has_closer_global_scope(uuid)', '{1,0,0,0}'),
  ('public.has_company_qa_global_scope(uuid)', '{1,0,0,0}'),
  ('public.has_contactos_global_scope(uuid)', '{1,0,0,0}'),
  ('public.has_cowork_global_scope(uuid)', '{1,0,0,0}'),
  ('public.has_cowork_team_scope(uuid)', '{1,0,0,0}'),
  ('public.has_creators_global_scope(uuid)', '{2,0,0,0}'),
  ('public.has_finanzas_access(uuid)', '{1,0,0,0}'),
  ('public.has_grabaciones_global_scope(uuid)', '{1,0,0,0}'),
  ('public.has_grabaciones_team_scope(uuid)', '{1,0,0,0}'),
  ('public.has_hr_access(uuid)', '{1,0,0,0}'),
  ('public.has_leadgen_global_scope(uuid)', '{1,0,0,0}'),
  ('public.has_permission(uuid,text,text)', '{1,0,0,0}'),
  ('public.has_promolog_global_scope(uuid)', '{1,0,0,0}'),
  ('public.has_qa_global_scope(uuid)', '{1,0,0,0}'),
  ('public.has_role(uuid,app_role)', '{0,0,0,1}'),
  ('public.has_role(uuid,text)', '{0,0,0,1}'),
  ('public.has_scouter_global_scope(uuid)', '{1,0,0,0}'),
  ('public.has_scouter_team_scope(uuid)', '{1,0,0,0}'),
  ('public.has_telefonos_global_scope(uuid)', '{1,0,0,0}'),
  ('public.has_tg_inbox_global_scope(uuid)', '{2,0,0,0}'),
  ('public.has_wa_inbox_global_scope(uuid)', '{2,0,0,0}'),
  ('public.is_in_role_group(uuid,text)', '{0,1,0,0}'),
  ('public.list_chatter_evaluators()', '{0,0,0,0}'),
  ('public.log_role_change()', '{0,0,0,0}'),
  ('public.puede_ver_modulo(uuid,text,text)', '{1,0,0,0}'),
  ('public.target_level(uuid)', '{1,0,0,0}'),
  ('public.tg_role_groups_sync_level()', '{0,0,0,0}'),
  ('public.tg_roles_config_level_en_franja()', '{0,0,0,0}'),
  ('public.tg_roles_config_sync_role_groups()', '{0,0,0,0}'),
  ('public.tg_user_roles_check_role_group()', '{0,0,0,0}'),
  ('public.wa_copilot_try_consume(uuid)', '{1,0,0,0}');

-- Los reemplazos textuales a mano: el texto de prod (viejo) tiene que estar
-- exactamente una vez, después de aplicar las reglas.
create temp table _roles_reemplazos (fn text not null, orden int not null, viejo text not null, nuevo text not null, primary key (fn, orden)) on commit drop;
insert into _roles_reemplazos values
('public.can_manage_user(uuid,uuid,text,text)', 1,
$q$  IF NOT public.can_manage_users(_caller) THEN
    RETURN jsonb_build_object('allowed', false, 'reason','no_user_management_permission');
  END IF;
$q$,
$q$  IF NOT public.can_manage_users(_caller) THEN
    RETURN jsonb_build_object('allowed', false, 'reason','no_user_management_permission');
  END IF;
  -- Otra agencia: nadie gestiona a quien no es de la suya (20261001190000).
  IF _target IS NOT NULL
     AND (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = _target)
         IS DISTINCT FROM (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = _caller) THEN
    RETURN jsonb_build_object('allowed', false, 'reason','other_agency');
  END IF;
$q$),
('public.can_manage_user(uuid,uuid,text,text)', 2,
$q$    LEFT JOIN public.role_groups rg ON rg.role_name = rc.name
    WHERE rc.name = _new_role AND rc.is_active;$q$,
$q$    LEFT JOIN public.role_groups rg ON rg.role_name = rc.name AND rg.tenant_id = rc.tenant_id
    WHERE rc.name = _new_role AND rc.is_active
      AND rc.tenant_id = (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = _caller);$q$),
('public.can_manage_user(uuid,uuid,text,text)', 3,
$q$    WHERE rg.is_admin;
    IF v_admin_count <= 1 THEN$q$,
$q$    WHERE rg.is_admin
      AND ur.tenant_id = (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = _target);
    IF v_admin_count <= 1 THEN$q$),
('public.admin_list_user_roles()', 1,
$q$  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
$q$,
$q$  FROM public.profiles p
  JOIN public.tenant_members tm ON tm.user_id = p.id AND tm.tenant_id = public.current_tenant_id()
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
$q$),
('public.get_closers_roster()', 1,
$q$       where g.role_name = ur.role and g.base_role = 'closer'$q$,
$q$       where g.role_name = ur.role and g.tenant_id = ur.tenant_id and g.base_role = 'closer'$q$),
('public.list_chatter_evaluators()', 1,
$q$    SELECT DISTINCT rc.name
    FROM public.role_permissions rp$q$,
$q$    SELECT DISTINCT rc.tenant_id, rc.name
    FROM public.role_permissions rp$q$),
('public.list_chatter_evaluators()', 2,
$q$    UNION
    SELECT 'admin'
  ),$q$,
$q$    UNION
    SELECT t.id, 'admin' FROM public.tenants t
  ),$q$),
('public.list_chatter_evaluators()', 3,
$q$    WHERE ur.role IN (SELECT name FROM evaluator_role_names)$q$,
$q$    WHERE (ur.tenant_id, ur.role) IN (SELECT tenant_id, name FROM evaluator_role_names)$q$),
('public.log_role_change()', 1,
$q$  elsif TG_OP = 'UPDATE' then
    insert into public.audit_log$q$,
$q$  elsif TG_OP = 'UPDATE' then
    -- Que la base ponga la agencia (user_roles_agencia) no es un cambio de rol.
    if NEW.role is not distinct from OLD.role then
      return NEW;
    end if;
    insert into public.audit_log$q$),
('public.tg_role_groups_sync_level()', 1,
$q$     where name = new.role_name;$q$,
$q$     where name = new.role_name and tenant_id = new.tenant_id;$q$),
('public.tg_roles_config_level_en_franja()', 1,
$q$    into f from public.role_groups rg where rg.role_name = new.name;$q$,
$q$    into f from public.role_groups rg where rg.role_name = new.name and rg.tenant_id = new.tenant_id;$q$),
('public.tg_roles_config_sync_role_groups()', 1,
$q$    INSERT INTO public.role_groups (role_name, is_member, description)
    VALUES (NEW.name, true, NEW.description)
    ON CONFLICT (role_name) DO NOTHING;$q$,
$q$    INSERT INTO public.role_groups (tenant_id, role_name, is_member, description)
    VALUES (NEW.tenant_id, NEW.name, true, NEW.description)
    ON CONFLICT (tenant_id, role_name) DO NOTHING;$q$),
('public.tg_roles_config_sync_role_groups()', 2,
$q$      (role_name, is_admin, is_manager_or_above, is_supervisor_or_above, is_member, description, created_at, updated_at)
    SELECT NEW.name, is_admin,$q$,
$q$      (tenant_id, role_name, is_admin, is_manager_or_above, is_supervisor_or_above, is_member, description, created_at, updated_at)
    SELECT NEW.tenant_id, NEW.name, is_admin,$q$),
('public.tg_roles_config_sync_role_groups()', 3,
$q$    FROM public.role_groups WHERE role_name = OLD.name
    ON CONFLICT (role_name) DO NOTHING;$q$,
$q$    FROM public.role_groups WHERE role_name = OLD.name AND tenant_id = OLD.tenant_id
    ON CONFLICT (tenant_id, role_name) DO NOTHING;$q$),
('public.tg_roles_config_sync_role_groups()', 4,
$q$    UPDATE public.user_roles SET role = NEW.name WHERE role = OLD.name;$q$,
$q$    UPDATE public.user_roles SET role = NEW.name WHERE role = OLD.name AND tenant_id = OLD.tenant_id;$q$),
('public.tg_roles_config_sync_role_groups()', 5,
$q$    DELETE FROM public.role_groups WHERE role_name = OLD.name;$q$,
$q$    DELETE FROM public.role_groups WHERE role_name = OLD.name AND tenant_id = OLD.tenant_id;$q$),
('public.tg_user_roles_check_role_group()', 1,
$q$SELECT 1 FROM public.role_groups WHERE role_name = NEW.role)$q$,
$q$SELECT 1 FROM public.role_groups WHERE role_name = NEW.role AND tenant_id = NEW.tenant_id)$q$),
('public.tg_user_roles_check_role_group()', 2,
$q$Agregalo a role_groups$q$,
$q$Agrégalo a role_groups$q$);

do $$
declare
  -- Las cuatro formas de cruzar por nombre. El «(?!::|…)» evita aplicar dos veces
  -- y que la regla corte un «ur.role::text» por la mitad.
  reglas text[][] := array[
    [$r$(roles_config\s+rc\s+on\s+rc\.name\s*=\s*ur\.role(?:::text)?)(?!::|\s+and\s+rc\.tenant_id)$r$,
     $r$\1 and rc.tenant_id = ur.tenant_id$r$],
    [$r$(role_groups\s+rg\s+on\s+rg\.role_name\s*=\s*ur\.role(?:::text)?)(?!::|\s+and\s+rg\.tenant_id)$r$,
     $r$\1 and rg.tenant_id = ur.tenant_id$r$],
    [$r$(role_groups\s+rg2\s+on\s+rg2\.role_name\s*=\s*ur2\.role(?:::text)?)(?!::|\s+and\s+rg2\.tenant_id)$r$,
     $r$\1 and rg2.tenant_id = ur2.tenant_id$r$],
    [$r$(role_base_grants\s+g\s+on\s+g\.role_name\s*=\s*ur\.role(?:::text)?)(?!::|\s+and\s+g\.tenant_id)$r$,
     $r$\1 and g.tenant_id = ur.tenant_id$r$]
  ];
  r record;
  m record;
  def text;
  texto text;
  n int;
  i int;
  quedan text;
begin
  for r in select * from _roles_reglas order by fn loop
    def := pg_get_functiondef(r.fn::regprocedure);
    insert into public.roles_por_agencia_respaldo (fn, def) values (r.fn, def);
    texto := def;
    for i in 1 .. 4 loop
      select count(*) into n from regexp_matches(texto, reglas[i][1], 'gi');
      if n <> r.esperado[i] then
        raise exception 'roles_por_agencia: % tiene % cruce(s) de la regla R%, se esperaban %', r.fn, n, i, r.esperado[i];
      end if;
      texto := regexp_replace(texto, reglas[i][1], reglas[i][2], 'gi');
    end loop;
    for m in select viejo, nuevo as reemplazo from _roles_reemplazos where fn = r.fn order by orden loop
      n := (length(texto) - length(replace(texto, m.viejo, ''))) / length(m.viejo);
      if n <> 1 then
        raise exception 'roles_por_agencia: en % el texto a reemplazar aparece % vez/veces (tiene que ser 1): %', r.fn, n, left(m.viejo, 80);
      end if;
      texto := replace(texto, m.viejo, m.reemplazo);
    end loop;
    if texto = def then
      raise exception 'roles_por_agencia: % no cambió', r.fn;
    end if;
    execute texto;
  end loop;

  -- Ningún cruce por nombre sin agencia en TODO el esquema.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into quedan
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and (p.prosrc ~* reglas[1][1] or p.prosrc ~* reglas[2][1] or p.prosrc ~* reglas[3][1] or p.prosrc ~* reglas[4][1]);
  if quedan is not null then
    raise exception 'roles_por_agencia: quedan cruces por nombre sin agencia en: %', quedan;
  end if;

  -- Ninguna función que lea las tablas de roles y no esté en la lista (una
  -- función nueva en prod tendría que revisarse antes).
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into quedan
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.prosrc ~* $r$\m(roles_config|role_groups|role_base_grants|role_permissions)\M$r$
    and p.oid not in (select fn::regprocedure from _roles_reglas)
    and p.oid not in ('public.user_roles_agencia()'::regprocedure, 'public.tenant_members_lleva_la_agencia()'::regprocedure);
  if quedan is not null then
    raise exception 'roles_por_agencia: estas funciones leen las tablas de roles y no están revisadas: %', quedan;
  end if;
end $$;

-- ─── 5. Los roles con los que nace una agencia ──────────────────────────────
create function public.sembrar_roles_de_agencia(_agencia uuid, _plan text, _desde uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  nombres text[];
  n text;
  origen public.roles_config;
  nuevo_id uuid;
  creados int := 0;
begin
  if _plan = 'enterprise' then
    nombres := array['admin', 'supervisor', 'employee'];
  elsif _plan = 'agency' then
    nombres := array['admin', 'supervisor', 'employee', 'Chatter', 'Chatter Supervisor', 'closer'];
  else
    raise exception 'sembrar_roles_de_agencia: plan desconocido «%» (enterprise o agency)', _plan;
  end if;
  if _agencia is null or _desde is null or _agencia = _desde then
    raise exception 'sembrar_roles_de_agencia: hacen falta una agencia de destino y otra de origen, distintas';
  end if;
  if not exists (select 1 from public.tenants where id = _agencia) then
    raise exception 'sembrar_roles_de_agencia: la agencia % no existe', _agencia;
  end if;

  foreach n in array nombres loop
    select * into origen from public.roles_config where tenant_id = _desde and name = n;
    if not found then
      raise exception 'sembrar_roles_de_agencia: la agencia de origen no tiene el rol «%»', n;
    end if;

    nuevo_id := null;
    insert into public.roles_config (tenant_id, name, description, is_active, is_system, ai_daily_quota, level)
    values (_agencia, origen.name, origen.description, true, origen.is_system, origen.ai_daily_quota, origen.level)
    on conflict (tenant_id, name) do nothing
    returning id into nuevo_id;
    continue when nuevo_id is null;  -- ya lo tenía: no se pisa

    -- El tipo de acceso (el trigger de alta creó la fila como «empleado»).
    update public.role_groups g
       set is_admin = o.is_admin, is_manager_or_above = o.is_manager_or_above,
           is_supervisor_or_above = o.is_supervisor_or_above, is_member = o.is_member,
           description = o.description
      from public.role_groups o
     where g.tenant_id = _agencia and g.role_name = n and o.tenant_id = _desde and o.role_name = n;
    -- El nivel fino dentro de la franja: el trigger de role_groups lo devolvió a la base del tipo.
    update public.roles_config set level = origen.level where id = nuevo_id;

    insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
    select nuevo_id, rp.module, rp.submodule, rp.can_access, rp.data_scope
    from public.role_permissions rp where rp.role_id = origen.id;

    insert into public.role_base_grants (tenant_id, role_name, base_role, note)
    select _agencia, g.role_name, g.base_role, g.note
    from public.role_base_grants g where g.tenant_id = _desde and g.role_name = n
    on conflict do nothing;

    creados := creados + 1;
  end loop;
  return creados;
end $$;

comment on function public.sembrar_roles_de_agencia(uuid, text, uuid) is
  'Crea en una agencia nueva los roles de la plantilla de su plan (enterprise o agency), copiados de la agencia de origen. Solo service_role.';

revoke all on function public.sembrar_roles_de_agencia(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.sembrar_roles_de_agencia(uuid, text, uuid) to service_role;
revoke all on function public.user_roles_agencia() from public, anon, authenticated;
revoke all on function public.tenant_members_lleva_la_agencia() from public, anon, authenticated;
