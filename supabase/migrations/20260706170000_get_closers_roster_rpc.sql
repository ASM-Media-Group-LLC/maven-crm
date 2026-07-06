-- Roster de closers para el picker "Ver como". El picker leía user_roles directo,
-- pero su RLS solo deja ver todos los roles a 'admin' (el resto solo su propia fila),
-- así que a manager/supervisor/Team Leader le salía "Sin closers en el tenant".
-- SECURITY DEFINER + gate por supervisor_or_above (o global scope) → sin ampliar la
-- RLS sensible de user_roles. Nombres desde profiles (legible por todos).
create or replace function public.get_closers_roster()
returns table(id uuid, full_name text)
language plpgsql stable security definer set search_path = public as $$
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
  order by p.full_name asc nulls last;
end; $$;

revoke all on function public.get_closers_roster() from public, anon;
grant execute on function public.get_closers_roster() to authenticated;
