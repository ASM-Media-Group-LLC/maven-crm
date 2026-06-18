-- Teléfonos (cloud phones): la edge function `cloudphone` decidía la visibilidad
-- de dispositivos con un gate BINARIO admin-o-asignado (user_roles.role='admin';
-- si no, solo veías tus teléfonos asignados). NUNCA miraba role_permissions.data_scope,
-- así que un rol con data_scope='all' en Telefonos (ej. "Team Leader") igual solo
-- veía sus asignados. Esta función expone "scope global de Teléfonos" para que la
-- edge la consulte (mismo molde que has_chatter_global_scope).
--
--   · Admin                                    → ve todo
--   · Permiso explícito + data_scope = 'all'   → ve todo
--   · Permiso explícito + data_scope != 'all'  → solo lo asignado (legacy)
--   · Sin permiso                              → solo lo asignado
CREATE OR REPLACE FUNCTION public.has_telefonos_global_scope(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles_config rc ON rc.name = ur.role
      JOIN public.role_permissions rp ON rp.role_id = rc.id
      WHERE ur.user_id = _user_id
        AND rp.module = 'Telefonos'
        AND (rp.submodule = 'Dispositivos' OR rp.submodule IS NULL)
        AND rp.can_access = true
        AND COALESCE(rp.data_scope, 'all') = 'all'
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_telefonos_global_scope(uuid) TO authenticated, service_role;
