-- Bandeja de WhatsApp: la visibilidad de conversaciones/mensajes/contactos se
-- decidía con `is_in_role_group(uid,'supervisor_or_above') OR assigned_to=uid`,
-- IGNORANDO role_permissions.data_scope. Resultado: un rol supervisor-level al que
-- el admin le puso data_scope='self' en WhatsApp (ej. "Team Leader") IGUAL veía
-- TODAS las conversaciones, en vez de solo las suyas.
--
-- Esta función hace que data_scope='self' RESTRINJA de verdad, SIN tocar a los
-- supervisores/managers que NO están en 'self' (evita regresiones en quienes hoy
-- ven todo legítimamente):
--   · Admin                                      → ve todo
--   · Supervisor-or-above SIN data_scope='self'  → ve todo (igual que antes)
--   · Supervisor-or-above CON data_scope='self'  → solo sus asignadas (NUEVO)
--   · No supervisor                              → solo sus asignadas (igual)
CREATE OR REPLACE FUNCTION public.has_wa_inbox_global_scope(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_in_role_group(_user_id, 'admin')
    OR (
      public.is_in_role_group(_user_id, 'supervisor_or_above')
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles_config rc ON rc.name = ur.role
        JOIN public.role_permissions rp ON rp.role_id = rc.id
        WHERE ur.user_id = _user_id
          AND rp.module = 'WhatsApp'
          AND rp.submodule IS NULL
          AND rp.data_scope = 'self'
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_wa_inbox_global_scope(uuid) TO authenticated, service_role;

-- Reescribimos las 3 policies de SELECT de la bandeja, idénticas salvo el gate
-- (is_in_role_group(...'supervisor_or_above') → has_wa_inbox_global_scope()).

-- wa_conversations
DROP POLICY IF EXISTS wa_conversations_select ON public.wa_conversations;
CREATE POLICY wa_conversations_select ON public.wa_conversations
  FOR SELECT TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND (public.has_wa_inbox_global_scope(auth.uid()) OR assigned_to = auth.uid())
  );

-- wa_conversation_messages
DROP POLICY IF EXISTS wa_messages_select ON public.wa_conversation_messages;
CREATE POLICY wa_messages_select ON public.wa_conversation_messages
  FOR SELECT TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.wa_conversations c
      WHERE c.id = wa_conversation_messages.conversation_id
        AND (public.has_wa_inbox_global_scope(auth.uid()) OR c.assigned_to = auth.uid())
    )
  );

-- wa_contacts
DROP POLICY IF EXISTS wa_contacts_select ON public.wa_contacts;
CREATE POLICY wa_contacts_select ON public.wa_contacts
  FOR SELECT TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND (
      public.has_wa_inbox_global_scope(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.wa_conversations c
        WHERE c.contact_id = wa_contacts.id AND c.assigned_to = auth.uid()
      )
    )
  );
