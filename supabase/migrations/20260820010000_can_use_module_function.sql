-- ═══════════════════════════════════════════════════════════════════════════
-- PERMISO DE FUNCIÓN con fallback al NIVEL DE ACCESO
--
-- POR QUÉ: el gate de "crear sesión de Cowork" quedó cableado al nivel de acceso
-- (supervisor+) y por lo tanto NO se podía mover desde Administración → Roles.
-- Pedido de Jhon: que todo permiso se pueda dar o quitar desde la UI.
--
-- La regla, en un solo lugar para que el front y las edge functions no se
-- desincronicen:
--   1. Admin siempre puede.
--   2. Si el rol tiene fila EXPLÍCITA en role_permissions para (módulo, función),
--      esa fila manda — sea true o false.
--   3. Si no hay fila, se cae al nivel de acceso (role_groups) que se pase.
--
-- El paso 3 es lo que hace que un rol guardado ANTES de que la función existiera
-- no cambie de comportamiento al desplegar: sin fila, sigue valiendo su nivel.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.can_use_module_function(
  _user_id uuid,
  _module text,
  _submodule text,
  _fallback_group text DEFAULT 'supervisor_or_above'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_explicit boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_in_role_group(_user_id, 'admin') THEN
    RETURN true;
  END IF;

  SELECT rp.can_access INTO v_explicit
  FROM public.user_roles ur
  JOIN public.roles_config rc ON rc.name = ur.role AND rc.is_active
  JOIN public.role_permissions rp ON rp.role_id = rc.id
  WHERE ur.user_id = _user_id
    AND rp.module = _module
    AND rp.submodule = _submodule
  ORDER BY rp.can_access DESC  -- con varios roles, el que CONCEDE gana
  LIMIT 1;

  IF v_explicit IS NOT NULL THEN
    RETURN v_explicit;
  END IF;

  RETURN public.is_in_role_group(_user_id, _fallback_group);
END;
$$;

COMMENT ON FUNCTION public.can_use_module_function(uuid, text, text, text) IS
  'Permiso de una acción concreta: la fila explícita de role_permissions manda; sin fila, cae al nivel de acceso de role_groups indicado. Admin siempre true. Pensada para que las edge functions y el front apliquen la MISMA regla.';

GRANT EXECUTE ON FUNCTION public.can_use_module_function(uuid, text, text, text) TO authenticated;
