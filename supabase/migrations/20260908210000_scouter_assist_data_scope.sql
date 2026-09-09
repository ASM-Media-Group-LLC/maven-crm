-- SCOUTER ASSIST RESPETA "PERMISOS DE DATOS".
--
-- Las policies de scouter_daily_assignments y scouter_spammer_accounts abrían por
-- NOMBRE DE ROL literal: role IN ('admin','manager','supervisor'). Operations Sales
-- y Closer + quedaban afuera aunque tuvieran "Todos los datos", y el rol `manager`
-- entraba sin tener siquiera el módulo habilitado.
--
-- `scouter_leads` NO se toca: no tiene columna de dueño (id, company_id, tenant_id,
-- model_id, converted_to_contact_id) — los leads son un pool del tenant. Lo que sí
-- tiene dueño es la asignación diaria (spammer_id) y la cuenta de spammer (user_id).

create or replace function public.has_scouter_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
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
$$;

create or replace function public.has_scouter_team_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
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
$$;

grant execute on function public.has_scouter_global_scope(uuid), public.has_scouter_team_scope(uuid)
  to authenticated, service_role;

-- ⚠️ VAN COMO RESTRICTIVE. Las dos policies que había eran PERMISIVAS y las
-- permisivas se suman con OR: la de aislamiento por tenant (solo
-- `tenant_id = current_tenant_id()`) le abría las 112 asignaciones y las 19
-- cuentas de spammer a CUALQUIER usuario del tenant — verificado impersonando a
-- una Chatter, que ni tiene el módulo. Una policy de alcance permisiva quedaba de
-- adorno. Como RESTRICTIVE se AND-ea con la del tenant. Mismo patrón que
-- Contactos/Creadoras/LeadGen (auditoría 18/06). Agujero anterior a este trabajo.

drop policy if exists scouter_daily_assignments_own_or_manager on public.scouter_daily_assignments;
drop policy if exists scouter_daily_assignments_scope on public.scouter_daily_assignments;
create policy scouter_daily_assignments_scope on public.scouter_daily_assignments
  as restrictive for select to authenticated
  using (
    spammer_id = auth.uid()
    or public.has_scouter_global_scope(auth.uid())
    or (public.has_scouter_team_scope(auth.uid())
        and public.actor_level(spammer_id) < public.actor_level(auth.uid()))
  );

drop policy if exists scouter_spammer_accounts_own_or_manager on public.scouter_spammer_accounts;
drop policy if exists scouter_spammer_accounts_scope on public.scouter_spammer_accounts;
create policy scouter_spammer_accounts_scope on public.scouter_spammer_accounts
  as restrictive for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_scouter_global_scope(auth.uid())
    or (public.has_scouter_team_scope(auth.uid())
        and public.actor_level(user_id) < public.actor_level(auth.uid()))
  );
