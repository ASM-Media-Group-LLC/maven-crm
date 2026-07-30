-- Alcance de datos de un CLOSER SUPERVISOR en el módulo Closers.
-- Antes caía en el grupo "supervisor_or_above" y veía TODO el pipeline, incluidas
-- las asignadas de los OTROS closer supervisors (Miguel 214 y María 84 se veían
-- entre sí). Regla del owner: ve su propia data y la de los closers rasos, no la
-- de sus pares.
-- NULL = sin restricción (admin/manager). El pool sin asignar se agrega aparte en
-- la query (assigned_to is null) porque cualquiera puede tomar del pool.
create or replace function public.closer_scope_agent_ids()
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when exists (
      select 1 from public.user_roles ur
      join public.role_groups rg on rg.role_name = ur.role::text
      where ur.user_id = auth.uid() and rg.is_manager_or_above
    ) then null
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
    else null
  end
$function$;

grant execute on function public.closer_scope_agent_ids() to authenticated;
