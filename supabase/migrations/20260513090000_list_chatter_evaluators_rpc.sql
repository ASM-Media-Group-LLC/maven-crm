-- RPC list_chatter_evaluators(): devuelve la lista de users con permiso
-- "Chatters → Evaluator" para poblar el select de "Asignar a" en el modal
-- de Nueva Sesión.
--
-- ¿Por qué SECURITY DEFINER y no un query directo?
--   El RLS de user_roles solo deja a non-admins ver sus propias filas.
--   Si un Chatter Supervisor (non-admin) hace el query directo, RLS le
--   filtra a 1 fila y solo aparece él mismo en el select. Esta función
--   corre con privilegios del owner (bypasea RLS) y aplica la lógica
--   de permisos en la query interna.
--
-- Espeja la lógica de has_chatter_evaluator_access:
--   · Admins (siempre)
--   · Roles con permiso explícito Chatters → Evaluator
--   · Roles con permiso al módulo entero (Chatters / NULL)

CREATE OR REPLACE FUNCTION public.list_chatter_evaluators()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH evaluator_role_names AS (
    -- Roles con permiso explícito Chatters / Evaluator o módulo entero
    SELECT DISTINCT rc.name
    FROM public.role_permissions rp
    JOIN public.roles_config rc ON rc.id = rp.role_id
    WHERE rp.module = 'Chatters'
      AND (rp.submodule = 'Evaluator' OR rp.submodule IS NULL)
      AND rp.can_access = true
    UNION
    SELECT 'admin'  -- bypass total
  ),
  evaluator_user_ids AS (
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN (SELECT name FROM evaluator_role_names)
  )
  SELECT
    p.id AS user_id,
    COALESCE(p.full_name, 'Sin nombre') AS full_name,
    p.avatar_url
  FROM public.profiles p
  WHERE p.id IN (SELECT user_id FROM evaluator_user_ids)
  ORDER BY COALESCE(p.full_name, 'zzz') COLLATE "es-x-icu";
$$;

GRANT EXECUTE ON FUNCTION public.list_chatter_evaluators() TO authenticated;
