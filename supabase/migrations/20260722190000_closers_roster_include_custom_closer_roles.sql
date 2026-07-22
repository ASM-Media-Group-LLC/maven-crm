-- get_closers_roster incluye roles custom que operan como closer.
--
-- El picker "Ver como → Cerradores" (ViewAsCloserPicker) salía VACÍO: la RPC
-- filtraba ur.role = 'closer', pero el rol base 'closer' tiene 0 usuarios —
-- todos los cerradores reales son roles custom (María y Miguel = "Closer
-- Supervisor"). Ahora incluye también los roles que heredan 'closer' vía
-- role_base_grants (creada en PR #938, seed Closer Supervisor→closer), así que
-- el picker muestra a los Closer Supervisor y a cualquier rol custom-closer
-- futuro sin volver a tocar esta función. Gate de acceso (quién puede usar el
-- picker) intacto. Ver [[roles_permission_system]].

create or replace function public.get_closers_roster()
returns table(id uuid, full_name text)
language plpgsql stable security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (public.is_in_role_group(auth.uid(), 'supervisor_or_above')
          or public.has_closer_global_scope(auth.uid())) then
    return; -- roles no privilegiados: lista vacía
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
end; $function$;