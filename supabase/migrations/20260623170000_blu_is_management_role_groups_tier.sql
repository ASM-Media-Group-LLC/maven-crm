-- Ampliar blu_is_management: además de los roles literales admin/manager/owner,
-- reconocer cualquier rol cuyo tier en role_groups sea is_manager_or_above = true.
-- Así un rol custom de tier management (ej. "Coordinador QA") puede leer la data de
-- Chatters QA (scorecards/qa_reports/conversations) y demás tablas BLU gateadas por
-- esta función, sin tener que llamarse literalmente "manager". SECURITY DEFINER →
-- bypassa RLS de user_roles/role_groups. (Aplicada en prod vía MCP el 2026-06-23.)
create or replace function public.blu_is_management(p_uid uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.user_roles ur
    left join public.role_groups rg on rg.role_name = ur.role
    where ur.user_id = p_uid
      and (ur.role in ('admin', 'manager', 'owner') or rg.is_manager_or_above = true)
  );
$function$;