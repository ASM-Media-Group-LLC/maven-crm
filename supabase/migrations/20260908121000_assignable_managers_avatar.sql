-- get_assignable_managers devuelve también la foto/DiceBear de cada manager
-- (pedido de Jhon 08/09: las tarjetas del tab Managers usan el avatar real de la
-- cuenta — foto si tiene, DiceBear si eligió uno, iniciales si no tiene nada).
-- Cambia el tipo de retorno → DROP + CREATE.
drop function if exists public.get_assignable_managers();
create function public.get_assignable_managers()
returns table(id uuid, full_name text, avatar_url text, avatar_seed text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.avatar_url, p.avatar_seed
  from profiles p
  where p.id in (select user_id from user_roles where role = 'manager')
    and p.deleted_at is null
  order by p.full_name;
$$;
revoke execute on function public.get_assignable_managers() from anon;
