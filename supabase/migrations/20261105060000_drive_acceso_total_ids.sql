-- Lista de user_ids con Drive full (Alvaro, 05/11): para avisar por correo a
-- todos ellos cuando entra contenido nuevo por un link. Solo la usa el backend
-- (el cron drive-aporte-nas). Ya aplicada en prod por MCP.
create or replace function public.drive_acceso_total_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.id from public.profiles p
  where p.deleted_at is null and (
    p.nivel in ('dueno', 'admin', 'manager')
    or exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role in ('Coordinador', 'Coordinador Supervisor'))
    or exists (select 1 from public.drive_acceso_extra e where e.user_id = p.id)
  )
$function$;
revoke all on function public.drive_acceso_total_ids() from public, anon, authenticated;
grant execute on function public.drive_acceso_total_ids() to service_role;