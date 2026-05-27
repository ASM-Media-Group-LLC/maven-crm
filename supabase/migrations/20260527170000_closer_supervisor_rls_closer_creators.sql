-- Bug: el enum app_role contiene 'supervisor' (lowercase) pero
-- user_roles.role es text libre y los Closer Supervisors están con
-- 'Closer Supervisor' (case-sensitive, con espacio + mayúsculas).
-- Por eso las policies existentes que usan
--   has_role(auth.uid(), 'supervisor'::app_role)
-- no matchean para Closer Supervisor.
--
-- Síntoma concreto:
--   Usuario con rol "Closer Supervisor" abre el dialog "Asignar
--   Closer", elige un contacto y al click "Asignar" sale:
--     duplicate key value violates unique constraint
--     "closer_creators_source_contact_id_key"
--
-- Causa: el dialog hace SELECT closer_creators WHERE source_contact_id=X
-- antes de hacer INSERT — pero RLS oculta la row existente al Closer
-- Supervisor → SELECT devuelve null → el código va al path INSERT →
-- INSERT choca con UNIQUE constraint.
--
-- Fix: agregar policies que matcheen 'Closer Supervisor' como texto
-- exacto en user_roles.role (en paralelo a las que usan el enum).

CREATE POLICY "Closer Supervisors view all closer_creators"
ON public.closer_creators FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'Closer Supervisor'
  )
);

CREATE POLICY "Closer Supervisors update closer_creators"
ON public.closer_creators FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'Closer Supervisor'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'Closer Supervisor'
  )
);
