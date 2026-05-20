-- Helper para borrar un user directamente de auth.users via DELETE
-- (bypassa gotrue). Se usa como fallback desde admin-user-actions
-- cuando `auth.admin.deleteUser()` falla con el genérico "Database
-- error deleting user" — gotrue oculta el error PG real (FK
-- violation, trigger fail, etc.).
--
-- DELETE directo a auth.users hace cascade a las tablas auth.*
-- (identities, sessions, refresh_tokens, mfa_factors) que tienen
-- ON DELETE CASCADE, y aplica las acciones de ON DELETE de las FKs
-- en public.* — pero como app_purge_user_refs ya limpió esas refs
-- antes de llamar este helper, debería pasar sin problema.
--
-- Si falla, el error PG sí incluye el detalle de la FK violation:
-- "update or delete on table X violates foreign key constraint Y on
-- table Z". Eso es lo que necesitamos para diagnosticar.
--
-- SECURITY DEFINER + search_path lockdown estándar.

CREATE OR REPLACE FUNCTION public.app_force_delete_auth_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'auth', 'pg_temp'
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

-- Solo el service role debería invocar esta función. RLS no aplica a
-- SECURITY DEFINER pero limitamos el GRANT para que el anon/auth key
-- no pueda llamarla por accidente.
REVOKE ALL ON FUNCTION public.app_force_delete_auth_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_force_delete_auth_user(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_force_delete_auth_user(uuid) TO service_role;

COMMENT ON FUNCTION public.app_force_delete_auth_user(uuid) IS
  'Fallback usado por admin-user-actions cuando gotrue.deleteUser '
  'falla con error genérico. DELETE directo a auth.users devuelve '
  'el error PG real para diagnosticar FK violations.';
