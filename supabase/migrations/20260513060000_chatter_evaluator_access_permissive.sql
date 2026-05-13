-- Hace has_chatter_evaluator_access más permisiva. La versión anterior
-- (migration 20260513050000) solo aceptaba el permiso granular
-- `Chatters / Evaluator`. En la práctica eso rompía el flujo para users
-- admin (que bypassean checks en el frontend pero no tienen el permiso
-- granular registrado) y para roles que tienen acceso al módulo entero
-- (submodule NULL).
--
-- Tres casos válidos ahora:
--   a. Admin → bypass total, mismo comportamiento que el frontend
--   b. Permiso explícito Chatters / Evaluator
--   c. Permiso al módulo Chatters entero (submodule IS NULL)

CREATE OR REPLACE FUNCTION public.has_chatter_evaluator_access(_user_id uuid)
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
    );
$$;
