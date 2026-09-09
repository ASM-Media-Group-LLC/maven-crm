-- Cinco helpers de alcance concedían "ve todo" a quien NO tiene el módulo.
--
-- Dos formas mal escritas:
--   · INVERTIDA (Closers, Company QA): "admin OR NOT EXISTS(fila con data_scope='self')".
--     Quien no tiene el módulo tampoco tiene esa fila → PASA. No configurar nada
--     daba acceso total.
--   · POR TIPO (Contactos, LeadGen, Agency QA): concedían a cualquiera de tipo
--     supervisor_or_above, tenga o no el módulo.
--
-- Forma correcta (la que ya usan los 9 helpers sanos): admin, o el módulo
-- habilitado con alcance distinto de 'self'.
--
-- Medido antes de aplicar. Pierden el "ve todo" — y NINGUNO tiene una sola fila
-- propia en esos módulos (verificado en las 5 tablas):
--   Company QA 23 · Closers 16 · Agency QA 9 · Contactos 7 · LeadGen 7
-- Conservan lo suyo quienes sí trabajan ahí: Warming (199 closers, 5.604 leadgen),
-- Team Leader (49/50/56), Operations Sales (4 + 10 de historial).

create or replace function public.has_closer_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_in_role_group(_user_id,'admin') or exists (
    select 1 from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id and rp.module = 'Closers' and rp.submodule is null
      and rp.can_access and coalesce(rp.data_scope,'all') <> 'self');
$$;

create or replace function public.has_company_qa_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_in_role_group(_user_id,'admin') or exists (
    select 1 from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id and rp.module = 'Company QA' and rp.submodule is null
      and rp.can_access and coalesce(rp.data_scope,'all') <> 'self');
$$;

create or replace function public.has_qa_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_in_role_group(_user_id,'admin') or exists (
    select 1 from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id and rp.module = 'Agency QA' and rp.submodule is null
      and rp.can_access and coalesce(rp.data_scope,'all') <> 'self');
$$;

create or replace function public.has_contactos_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_in_role_group(_user_id,'admin') or exists (
    select 1 from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id and rp.module = 'Contactos' and rp.submodule is null
      and rp.can_access and coalesce(rp.data_scope,'all') <> 'self');
$$;

create or replace function public.has_leadgen_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_in_role_group(_user_id,'admin') or exists (
    select 1 from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id and rp.module = 'LeadGen' and rp.submodule is null
      and rp.can_access and coalesce(rp.data_scope,'all') <> 'self');
$$;

-- El pool sin asignar (2.214 de 2.729, stage='Nuevo') estaba abierto a CUALQUIER
-- usuario con sesión, sin chequeo de módulo. Era el resto que quedaba tras
-- corregir el helper: por eso una manager y Finanzas seguían viendo 2.214. Sigue
-- visible para los closers —de ahí toman leads con "Tomar"— pero exigiendo el módulo.
drop policy if exists "Closers can view unassigned pool" on public.closer_creators;
create policy "Closers can view unassigned pool" on public.closer_creators
  for select to authenticated
  using (assigned_to is null and stage = 'Nuevo' and has_permission(auth.uid(), 'Closers'));

drop policy if exists closer_creators_scope_select on public.closer_creators;
create policy closer_creators_scope_select on public.closer_creators
  as restrictive for select to authenticated
  using (
    has_closer_global_scope(auth.uid())
    or assigned_to = auth.uid()
    or created_by = auth.uid()
    or (assigned_to is null and stage = 'Nuevo' and has_permission(auth.uid(), 'Closers'))
  );

-- El historial de contactos tenía SOLO permisivas, una con
-- `is_in_role_group(supervisor_or_above) OR has_closer_global_scope`, que abría
-- las 1.615 filas a cualquier supervisor sin el módulo.
drop policy if exists closer_contact_history_scope on public.closer_contact_history;
create policy closer_contact_history_scope on public.closer_contact_history
  as restrictive for select to authenticated
  using (
    has_closer_global_scope(auth.uid())
    or created_by = auth.uid()
    or exists (select 1 from public.closer_creators c
               where c.id = closer_contact_history.creator_id and c.assigned_to = auth.uid())
  );
