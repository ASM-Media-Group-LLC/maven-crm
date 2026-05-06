-- Promote qa_calls delete from admin-only → configurable via the
-- standard Maven role_permissions submodule "Borrar Calls".
--
-- Before: only role='admin' could delete (qa_calls_delete_admin policy).
-- After: any role with role_permissions.can_access = true for module
--        'Agency QA' / submodule 'Borrar Calls' can delete. Admins still
--        keep the privilege via the same OR clause.

DROP POLICY IF EXISTS "qa_calls_delete_admin" ON public.qa_calls;

CREATE POLICY "qa_calls_delete_with_permission"
  ON public.qa_calls
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (
    -- Admin always wins (mirror of useUserRole.isAdmin client side).
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
    OR
    -- Otros roles: deben tener can_access=true para el submódulo
    -- "Borrar Calls" en Agency QA. role_permissions.role_id se une a
    -- roles_config.id, y roles_config.name matchea el role del usuario.
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles_config rc ON rc.name = ur.role::text
      JOIN public.role_permissions rp ON rp.role_id = rc.id
      WHERE ur.user_id = auth.uid()
        AND rc.is_active = true
        AND rp.module = 'Agency QA'
        AND rp.submodule = 'Borrar Calls'
        AND rp.can_access = true
    )
  );
