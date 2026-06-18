-- Agency QA: la RLS de qa_calls era tenant-only (qa_calls_tenant) + una policy
-- qa_calls_insert_update con qual=true → cualquier usuario del tenant veía TODAS
-- las llamadas (transcript completo, claude_analysis, score) de TODOS los closers.
-- Roles 'closer', 'Closer Supervisor' y 'LLG' están en data_scope='self' en Agency
-- QA → la intención del admin es que vean SOLO sus propias QAs, pero la RLS lo
-- ignoraba (fuga activa de privacidad entre closers).
--
-- Fix conservador (mismo criterio que WhatsApp/Telefonos): una RPC que define
-- "ve todo" leyendo data_scope, y policies RESTRICTIVE de SELECT que recortan a
-- lo propio SOLO a quienes el admin puso en 'self'. RESTRICTIVE = se hace AND con
-- las permisivas existentes (tenant), sin tocarlas; los writes (service_role /
-- edge qa-analyze) no se ven afectados (bypassa RLS).
--
--   · Admin                                   → ve todo
--   · Rol SIN data_scope='self' en Agency QA  → ve todo (igual que antes)
--   · Rol CON data_scope='self' en Agency QA  → solo sus llamadas (closer_id o uploaded_by = uid)
CREATE OR REPLACE FUNCTION public.has_qa_global_scope(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_in_role_group(_user_id, 'admin')
    OR NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles_config rc ON rc.name = ur.role
      JOIN public.role_permissions rp ON rp.role_id = rc.id
      WHERE ur.user_id = _user_id
        AND rp.module = 'Agency QA'
        AND rp.submodule IS NULL
        AND rp.data_scope = 'self'
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_qa_global_scope(uuid) TO authenticated, service_role;

-- qa_calls: recorte de SELECT a lo propio para roles 'self' (RESTRICTIVE).
DROP POLICY IF EXISTS qa_calls_scope_select ON public.qa_calls;
CREATE POLICY qa_calls_scope_select ON public.qa_calls
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.has_qa_global_scope(auth.uid())
    OR closer_id = auth.uid()
    OR uploaded_by = auth.uid()
  );

-- qa_human_feedback: sigue la visibilidad de su qa_call.
DROP POLICY IF EXISTS qa_human_feedback_scope_select ON public.qa_human_feedback;
CREATE POLICY qa_human_feedback_scope_select ON public.qa_human_feedback
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.has_qa_global_scope(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.qa_calls c
      WHERE c.id = qa_human_feedback.call_id
        AND (c.closer_id = auth.uid() OR c.uploaded_by = auth.uid())
    )
  );

-- qa_section_feedback: idem.
DROP POLICY IF EXISTS qa_section_feedback_scope_select ON public.qa_section_feedback;
CREATE POLICY qa_section_feedback_scope_select ON public.qa_section_feedback
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.has_qa_global_scope(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.qa_calls c
      WHERE c.id = qa_section_feedback.call_id
        AND (c.closer_id = auth.uid() OR c.uploaded_by = auth.uid())
    )
  );
