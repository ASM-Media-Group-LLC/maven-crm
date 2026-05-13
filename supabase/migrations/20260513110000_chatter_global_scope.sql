-- Permite que usuarios con `data_scope = 'all'` en Chatters (o Chatters/Evaluator)
-- vean TODAS las sesiones, mensajes y evaluaciones del chatter evaluator, no
-- sólo las propias. Esto habilita un Historial global (compartido entre todos
-- los evaluators) y que los KPI cards agreguen sobre toda la base de datos.
--
-- Sigue siendo respetuoso con la matriz de permisos:
--   · Admin                                   → siempre ve todo
--   · Permiso explícito + data_scope = 'all'  → ve todo
--   · Permiso explícito + data_scope != 'all' → sólo lo suyo (legacy)
--   · Sin permiso                             → nada
--
-- Implementado como una policy adicional FOR SELECT que se suma (OR) con la
-- per-examiner existente. PostgreSQL evalúa multiple policies con OR para
-- USING, así que el efecto neto es: "el examiner ve lo suyo, y además lo de
-- los demás si su scope es 'all'".
--
-- chatter_sessions_total_spent y chatter_sessions_unread_counts ya son
-- SECURITY DEFINER y filtran por examiner_user_id = auth.uid(), no leen RLS,
-- así que NO se ven afectadas. Eso es deseado: el panel del workspace sigue
-- siendo per-examiner (cada uno ve sólo SUS sesiones activas), pero el
-- Historial (que usa chatter_sessions directo) se vuelve global cuando el
-- user tiene scope = 'all'.

CREATE OR REPLACE FUNCTION public.has_chatter_global_scope(_user_id uuid)
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
        AND rp.module = 'Chatters'
        AND (rp.submodule = 'Evaluator' OR rp.submodule IS NULL)
        AND rp.can_access = true
        AND COALESCE(rp.data_scope, 'all') = 'all'
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_chatter_global_scope(uuid) TO authenticated;

-- ===== chatter_sessions =====
DROP POLICY IF EXISTS chatter_sessions_read_global ON public.chatter_sessions;
CREATE POLICY chatter_sessions_read_global ON public.chatter_sessions
  FOR SELECT TO authenticated
  USING (public.has_chatter_global_scope(auth.uid()));

-- ===== chatter_messages =====
DROP POLICY IF EXISTS chatter_messages_read_global ON public.chatter_messages;
CREATE POLICY chatter_messages_read_global ON public.chatter_messages
  FOR SELECT TO authenticated
  USING (public.has_chatter_global_scope(auth.uid()));

-- ===== chatter_evaluations =====
DROP POLICY IF EXISTS chatter_evaluations_read_global ON public.chatter_evaluations;
CREATE POLICY chatter_evaluations_read_global ON public.chatter_evaluations
  FOR SELECT TO authenticated
  USING (public.has_chatter_global_scope(auth.uid()));
