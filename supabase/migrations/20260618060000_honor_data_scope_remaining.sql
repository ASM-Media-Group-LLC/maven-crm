-- Auditoría de permisos 2026-06: hacer que role_permissions.data_scope sea
-- AUTORITATIVO en los módulos de lectura que lo ignoraban. Mismo patrón
-- conservador que WhatsApp/Telefonos/Agency QA: una RPC has_<módulo>_global_scope
-- que define "ve todo" (admin OR rol SIN data_scope='self' en ese módulo), y una
-- policy RESTRICTIVE de SELECT que recorta a lo propio SOLO a los roles en 'self'.
-- RESTRICTIVE = AND con las permisivas existentes (no las toca); writes vía
-- service_role/edge no se ven afectados.
--
-- En estos módulos HOY ningún rol activo está en 'self' (todos 'all') → CERO
-- cambio de comportamiento visible; el toggle 'self' del admin recién ahora hace
-- efecto (antes era decorativo). LeadGen se maneja aparte (a pedido del owner).

-- ============================ Contactos ============================
CREATE OR REPLACE FUNCTION public.has_contactos_global_scope(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_in_role_group(_user_id, 'admin')
    OR NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles_config rc ON rc.name = ur.role
      JOIN public.role_permissions rp ON rp.role_id = rc.id
      WHERE ur.user_id = _user_id AND rp.module = 'Contactos'
        AND rp.submodule IS NULL AND rp.data_scope = 'self'
    );
$$;
GRANT EXECUTE ON FUNCTION public.has_contactos_global_scope(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS closers_contacts_scope_select ON public.closers_contacts;
CREATE POLICY closers_contacts_scope_select ON public.closers_contacts
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.has_contactos_global_scope(auth.uid())
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  );

-- ============================ Creadores ============================
CREATE OR REPLACE FUNCTION public.has_creators_global_scope(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_in_role_group(_user_id, 'admin')
    OR NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles_config rc ON rc.name = ur.role
      JOIN public.role_permissions rp ON rp.role_id = rc.id
      WHERE ur.user_id = _user_id AND rp.module = 'Creadores'
        AND rp.submodule IS NULL AND rp.data_scope = 'self'
    );
$$;
GRANT EXECUTE ON FUNCTION public.has_creators_global_scope(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS creators_scope_select ON public.creators;
CREATE POLICY creators_scope_select ON public.creators
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.has_creators_global_scope(auth.uid())
    OR closer_responsible_id = auth.uid()
    OR assigned_manager_id = auth.uid()
  );

-- ============================ Closers ============================
CREATE OR REPLACE FUNCTION public.has_closer_global_scope(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_in_role_group(_user_id, 'admin')
    OR NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles_config rc ON rc.name = ur.role
      JOIN public.role_permissions rp ON rp.role_id = rc.id
      WHERE ur.user_id = _user_id AND rp.module = 'Closers'
        AND rp.submodule IS NULL AND rp.data_scope = 'self'
    );
$$;
GRANT EXECUTE ON FUNCTION public.has_closer_global_scope(uuid) TO authenticated, service_role;

-- Preserva la visibilidad del pool sin asignar (los closers toman de ahí).
DROP POLICY IF EXISTS closer_creators_scope_select ON public.closer_creators;
CREATE POLICY closer_creators_scope_select ON public.closer_creators
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.has_closer_global_scope(auth.uid())
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR (assigned_to IS NULL AND stage = 'Nuevo')
  );
