-- Permitir que un user con permiso "Chatters → Evaluator" cree sesiones
-- asignándoselas a OTRO user que también tenga ese permiso. Hasta ahora
-- el RLS forzaba examiner_user_id = auth.uid() en INSERT — eso impedía
-- la asignación. Ahora:
--
--   · Creador debe tener permiso evaluator (auth.uid())
--   · Examiner asignado también debe tener permiso evaluator
--     (puede ser el propio creador o cualquier otro evaluator)
--   · El SELECT/UPDATE/DELETE policies NO cambian: solo el examiner
--     asignado puede ver/editar/borrar la sesión post-creación.
--
-- También agregamos columna `created_by` para auditoría — distinta de
-- examiner_user_id cuando la sesión se asignó a otro.

-- 1. Helper: ¿este user tiene permiso "Chatters → Evaluator"?
CREATE OR REPLACE FUNCTION public.has_chatter_evaluator_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles_config rc ON rc.name = ur.role
    JOIN public.role_permissions rp ON rp.role_id = rc.id
    WHERE ur.user_id = _user_id
      AND rp.module = 'Chatters'
      AND rp.submodule = 'Evaluator'
      AND rp.can_access = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_chatter_evaluator_access(uuid) TO authenticated;

-- 2. Reemplazar el INSERT policy para permitir asignación a otro evaluator
DROP POLICY IF EXISTS chatter_sessions_insert ON public.chatter_sessions;
CREATE POLICY chatter_sessions_insert ON public.chatter_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_chatter_evaluator_access(auth.uid())
    AND public.has_chatter_evaluator_access(examiner_user_id)
  );

-- 3. Audit: registrar quién creó la sesión (puede diferir del examiner)
ALTER TABLE public.chatter_sessions
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_chatter_sessions_created_by
  ON public.chatter_sessions(created_by);
