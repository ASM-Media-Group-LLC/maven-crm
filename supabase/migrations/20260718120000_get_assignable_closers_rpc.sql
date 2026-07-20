-- get_assignable_closers — lista de usuarios asignables como closer responsable
-- (roles: closer, Closer Supervisor, admin).
--
-- Bug reportado por Luis (team leader): el diálogo "Asignar Closer" del pipeline
-- mostraba "No se encontró ningún closer". Causa: el front leía user_roles directo,
-- pero la RLS de user_roles solo deja ver TODOS los roles a los admins (el resto ve
-- solo el suyo) → a cualquier no-admin la lista le quedaba vacía. A admin le andaba.
--
-- Fix (patrón de oro): RPC SECURITY DEFINER que devuelve SOLO {id, full_name} de los
-- asignables, sin exponer user_roles. Ejecutable por cualquier usuario logueado
-- (son nombres de staff, no PII sensible; el permiso de ASIGNAR sigue gateado por
-- las RPCs/policies de escritura de siempre).
create or replace function public.get_assignable_closers()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name
  from public.profiles p
  where p.id in (
    select ur.user_id from public.user_roles ur
    where ur.role in ('closer', 'Closer Supervisor', 'admin')
  )
  order by p.full_name;
$$;

revoke all on function public.get_assignable_closers() from public, anon;
grant execute on function public.get_assignable_closers() to authenticated, service_role;

notify pgrst, 'reload schema';
