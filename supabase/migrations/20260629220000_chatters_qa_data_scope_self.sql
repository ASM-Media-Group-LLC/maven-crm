-- BUG #2: honrar data_scope "ver solo datos propios" en Chatters QA (Company QA).
-- Antes la RLS de chatter_scorecards/chatter_qa_reports era can_access_chatters_qa() = todo-o-nada.
-- Link usuario↔chatter = EMAIL (login Maven = email de BLU del chatter) → blu_employee_id.
-- Verificado: supervisor (scope='all') ve todo; rol Chatter (scope='self') ve solo su blu_employee_id.

-- (1) scope global de Company QA (módulo "Agency QA"). admin/management, o NINGÚN rol del user
--     pone data_scope != 'all' en la fila module-level (submodule IS NULL) de Agency QA — que es
--     donde lo lee usePermissions.dataScope y donde el owner marcó 'self' para el rol Chatter.
--     Sin fila restrictiva → global (no rompe roles preexistentes).
create or replace function public.has_company_qa_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.blu_is_management(_user_id)
    or exists (select 1 from public.user_roles ur where ur.user_id=_user_id and ur.role='admin')
    or not exists (
      select 1 from public.user_roles ur
      join public.roles_config rc on rc.name = ur.role
      join public.role_permissions rp on rp.role_id = rc.id
      where ur.user_id=_user_id and rp.module='Agency QA' and rp.submodule is null
        and coalesce(rp.data_scope,'all') <> 'all'
    );
$$;

-- (2) blu_employee_id del usuario actual vía su email (auth.users → chatter_performance).
create or replace function public.my_chatter_blu_employee_id()
returns bigint language sql stable security definer set search_path = public as $$
  select cp.blu_employee_id
  from auth.users au
  join public.chatter_performance cp on lower(btrim(cp.email)) = lower(btrim(au.email))
  where au.id = auth.uid() and cp.blu_employee_id is not null
  limit 1;
$$;
revoke all on function public.has_company_qa_global_scope(uuid) from public, anon;
revoke all on function public.my_chatter_blu_employee_id() from public, anon;
grant execute on function public.has_company_qa_global_scope(uuid) to authenticated;
grant execute on function public.my_chatter_blu_employee_id() to authenticated;

-- (3) backfill blu_employee_id en scorecards por nombre (único por blu_employee_id → seguro).
--     Los que no matchean por nombre quedan NULL (su chatter no los verá hasta limpiar el nombre;
--     los supervisores SÍ los ven, el filtro solo aplica a scope='self').
update public.chatter_scorecards sc
set blu_employee_id = cp.blu_employee_id
from public.chatter_performance cp
where sc.blu_employee_id is null
  and lower(btrim(cp.name)) = lower(btrim(sc.chatter_name))
  and cp.blu_employee_id is not null;

-- (4) RLS SELECT: global ve todo; scope='self' solo su blu_employee_id. write/delete sin cambio.
alter policy chatter_scorecards_select on public.chatter_scorecards using (
  can_access_chatters_qa(auth.uid())
  and (public.has_company_qa_global_scope(auth.uid())
       or blu_employee_id = public.my_chatter_blu_employee_id())
);
alter policy chatter_qa_reports_select on public.chatter_qa_reports using (
  can_access_chatters_qa(auth.uid())
  and (public.has_company_qa_global_scope(auth.uid())
       or blu_employee_id = public.my_chatter_blu_employee_id())
);
