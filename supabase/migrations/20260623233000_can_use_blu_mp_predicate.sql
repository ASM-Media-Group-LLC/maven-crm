-- Gate para los edges que leen BLU vía WS (blu-mp = viewer Mensajes Pro + picker/modelos de Chatters QA).
-- management O rol con permiso a "Mensajes Pro" o "Chatters QA". Lo usan blu-mp / chatter-qa-analyze /
-- chatter-masivos-analyze (vía sb.rpc) además del check admin/owner/manager. Aplicado en prod vía MCP 2026-06-23.
create or replace function public.can_use_blu_mp(p_uid uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $function$
  select
    public.blu_is_management(p_uid)
    or exists (
      select 1
      from public.user_roles ur
      join public.roles_config rc on rc.name = ur.role
      join public.role_permissions rp on rp.role_id = rc.id
      where ur.user_id = p_uid
        and rp.module = 'Agency QA'
        and rp.submodule in ('Mensajes Pro', 'Chatters QA')
        and rp.can_access = true
    );
$function$;
