-- Quién puede figurar como chatter de un personalizado (pedido de Jhon 03/09/2026:
-- "en el formulario habilitame solo gente con el rol de chatter").
--
-- `user_roles` solo lo lee un admin o el propio usuario (RLS), así que un chatter
-- no puede saber quiénes tienen el rol: hace falta una función definer. Devuelve
-- solo id y nombre — los perfiles ya son legibles por cualquier autenticado.
-- 'agent' es el nombre viejo del rol Chatter (quedó 1 usuario así).
create or replace function public.list_chatters()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.full_name
  from profiles p
  join user_roles ur on ur.user_id = p.id
  where ur.role in ('Chatter', 'agent')
    and p.full_name is not null and trim(p.full_name) <> ''
  group by p.id, p.full_name
  order by p.full_name
$$;

revoke all on function public.list_chatters() from public;
grant execute on function public.list_chatters() to authenticated;
