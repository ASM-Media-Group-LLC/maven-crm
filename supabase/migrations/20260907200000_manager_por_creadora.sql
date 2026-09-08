-- MANAGER POR CREADORA (pedido de Jhon 07/09): el manager de cada modelo se
-- elige en su ficha (campo Manager = personas con rol manager). La regla
-- automática "Massive=Fabiana / Plus=Carolina" DEJA DE EXISTIR.

-- 0) Dato corrupto que bloqueaba cualquier UPDATE de su fila: birth_date año
--    275760 (basura de import) violaba creators_birth_date_plausible al re-validar.
update public.creators set birth_date = null
where birth_date is not null and birth_date > date '2030-01-01';

-- 1) Adiós al trigger que pisaba el manager con la regla vieja en cada update
--    de kash_type desde BLU (#948). kash_type sigue siendo la CUENTA BLU.
drop trigger if exists trg_sync_manager_from_kash on public.creator_business;
drop function if exists public.sync_manager_from_kash_type();

-- 2) Pool del select de la ficha: personas con rol literal 'manager'.
--    SECURITY DEFINER porque RLS de user_roles solo deja leer la fila propia
--    (mismo patrón que get_assignable_closers).
create or replace function public.get_assignable_managers()
returns table(id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name
  from profiles p
  where p.id in (select user_id from user_roles where role = 'manager')
    and p.deleted_at is null
  order by p.full_name;
$$;
revoke execute on function public.get_assignable_managers() from anon;

-- 3) Sanar el split-brain: assigned_manager_id (la usan ManagerDashboard y
--    ventas_tops) se alinea con la canónica assigned_manager_profile_id.
--    La ficha en adelante escribe LAS DOS.
update public.creators
set assigned_manager_id = assigned_manager_profile_id
where assigned_manager_profile_id is not null
  and assigned_manager_id is distinct from assigned_manager_profile_id;
