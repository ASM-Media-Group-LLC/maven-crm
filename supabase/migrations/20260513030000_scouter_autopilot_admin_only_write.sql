-- Restringir escritura a scouter_autopilot a admin/manager.
-- Antes: cualquier user con role_permissions sobre "Scouter Assist"
-- (closer, spammer, LLG, Closer Supervisor) podía pulsar el toggle —
-- afectando a TODO el CRM. Ahora la DB lo enforce: solo admin/manager
-- pueden escribir. SELECT sigue abierto al tenant para que la UI muestre
-- el estado a todos (cosmético).

DROP POLICY IF EXISTS scouter_autopilot_tenant ON public.scouter_autopilot;

CREATE POLICY scouter_autopilot_select ON public.scouter_autopilot
  FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id());

CREATE POLICY scouter_autopilot_admin_insert ON public.scouter_autopilot
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'manager')
    )
  );

CREATE POLICY scouter_autopilot_admin_update ON public.scouter_autopilot
  FOR UPDATE TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'manager')
    )
  );

CREATE POLICY scouter_autopilot_admin_delete ON public.scouter_autopilot
  FOR DELETE TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'manager')
    )
  );
