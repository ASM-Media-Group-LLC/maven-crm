-- JERARQUÍA DE ROLES EN GESTIÓN DE USUARIOS (24/08) — YA APLICADA EN PROD POR MCP.
--
-- Bug reportado por Jhon: creó un rol HHRR con acceso de supervisor y (1) veía a los
-- 52 usuarios como "Sin rol" con los contadores en 0, y (2) le aparecían los botones
-- de editar rol / resetear password / borrar, incluida la opción de poner ADMIN.
--
-- (1) era RLS: user_roles solo tiene SELECT para admin y para la fila propia, así que
--     un no-admin no podía leer los roles ajenos. Se resuelve con admin_list_user_roles().
-- (2) era leak VISUAL: las edge functions ya exigían role='admin' literal y rebotaban
--     con 403. Pero no existía JERARQUÍA: la autorización era binaria (admin o nada).
--
-- Decisiones de Jhon (24/08):
--   · HHRR POR ENCIMA de manager (90 vs 80).
--   · Los managers NO gestionan usuarios (su permiso explícito sigue en false).
--   · REGLA ESTRICTA: nadie puede asignar un rol de nivel >= al suyo
--     → un supervisor NO puede nombrar a otro supervisor. Solo el admin saltea.
ALTER TABLE public.roles_config ADD COLUMN IF NOT EXISTS level int;

UPDATE public.roles_config rc SET level = v.level
FROM (VALUES
  ('admin',100),
  ('HHRR',90),
  ('manager',80),
  ('supervisor',50),('Chatter Supervisor',50),('Closer Supervisor',50),('Team Leader',50),
  ('Chatter',20),('Warming',20),('closer',20),('LLG',20),('spammer',20),('agent',20),
  ('employee',10)
) AS v(name, level) WHERE rc.name = v.name;

UPDATE public.roles_config SET level = 10 WHERE level IS NULL;
ALTER TABLE public.roles_config
  ALTER COLUMN level SET DEFAULT 10, ALTER COLUMN level SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE public.roles_config ADD CONSTRAINT roles_config_level_range
    CHECK (level >= 0 AND level <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.actor_level(_user_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MAX(rc.level), 0)
  FROM public.user_roles ur
  JOIN public.roles_config rc ON rc.name = ur.role::text AND rc.is_active
  WHERE ur.user_id = _user_id;
$$;

-- Un rol desconocido/inactivo da 999: intocable salvo para admin (falla cerrado).
CREATE OR REPLACE FUNCTION public.target_level(_user_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id) THEN 0
    ELSE COALESCE((SELECT MAX(COALESCE(rc.level, 999))
                   FROM public.user_roles ur
                   LEFT JOIN public.roles_config rc ON rc.name = ur.role::text
                   WHERE ur.user_id = _user_id), 999)
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_users(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    _user_id IS NOT NULL
    AND public.can_use_module_function(_user_id,'Administración','Usuarios','manager_or_above')
    AND public.actor_level(_user_id) > 0, false);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_user(
  _caller uuid, _target uuid, _action text, _new_role text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_level int; v_target_level int; v_new_role_level int;
  v_is_admin boolean; v_target_is_admin boolean; v_new_role_is_admin boolean;
  v_admin_count int; v_effective_role text; v_ctx jsonb;
BEGIN
  -- Allowlist: una acción no declarada se DENIEGA acá, no queda abierta por olvido.
  IF _action IS NULL OR _action NOT IN
     ('assign_role','remove_role','delete_user','reset_password',
      'update_profile','create_user','list_users') THEN
    RETURN jsonb_build_object('allowed', false, 'reason','unknown_action');
  END IF;
  IF _caller IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason','no_caller');
  END IF;
  IF NOT public.can_manage_users(_caller) THEN
    RETURN jsonb_build_object('allowed', false, 'reason','no_user_management_permission');
  END IF;

  v_is_admin     := public.is_in_role_group(_caller,'admin');
  v_caller_level := public.actor_level(_caller);
  v_target_level := CASE WHEN _target IS NULL THEN NULL ELSE public.target_level(_target) END;
  v_ctx := jsonb_build_object('caller_level',v_caller_level,'target_level',v_target_level);

  -- Si el rol pedido es el que YA tiene, no es asignación: así "editar el nombre"
  -- (que el front manda siempre con role) no se convierte en cambio de rol.
  IF _new_role IS NOT NULL AND _target IS NOT NULL THEN
    SELECT ur.role::text INTO v_effective_role
    FROM public.user_roles ur WHERE ur.user_id = _target LIMIT 1;
    IF v_effective_role = _new_role THEN _new_role := NULL; END IF;
  END IF;

  IF _action IN ('assign_role','create_user','update_profile') AND _new_role IS NOT NULL THEN
    SELECT rc.level, COALESCE(rg.is_admin,false)
      INTO v_new_role_level, v_new_role_is_admin
    FROM public.roles_config rc
    LEFT JOIN public.role_groups rg ON rg.role_name = rc.name
    WHERE rc.name = _new_role AND rc.is_active;

    IF v_new_role_level IS NULL THEN
      RETURN jsonb_build_object('allowed',false,'reason','invalid_or_inactive_role')||v_ctx;
    END IF;
    -- ESTRICTO (decisión de Jhon): >= , no >. Un supervisor no puede nombrar a otro
    -- supervisor, ni HHRR a otro HHRR. Solo el admin saltea la escalera.
    IF NOT v_is_admin AND v_new_role_level >= v_caller_level THEN
      RETURN jsonb_build_object('allowed',false,'reason','role_at_or_above_caller_level',
                                'new_role_level',v_new_role_level)||v_ctx;
    END IF;
  END IF;

  IF _action = 'create_user' THEN
    RETURN jsonb_build_object('allowed',true,'reason','ok')||v_ctx;
  END IF;
  IF _action = 'list_users' THEN
    RETURN jsonb_build_object('allowed',true,'reason','ok')||v_ctx;
  END IF;
  IF _target IS NULL THEN
    RETURN jsonb_build_object('allowed',false,'reason','no_target')||v_ctx;
  END IF;

  IF _target = _caller THEN
    IF _action = 'update_profile' AND _new_role IS NULL THEN
      RETURN jsonb_build_object('allowed',true,'reason','self_profile_ok')||v_ctx;
    END IF;
    RETURN jsonb_build_object('allowed',false,'reason','self_target_not_allowed')||v_ctx;
  END IF;

  v_target_is_admin := public.is_in_role_group(_target,'admin');

  -- Último admin: decide por role_groups.is_admin (fuente de verdad), no por level.
  IF v_target_is_admin AND (
       _action IN ('delete_user','remove_role')
       OR (_action IN ('assign_role','update_profile')
           AND _new_role IS NOT NULL AND NOT COALESCE(v_new_role_is_admin,false))
     ) THEN
    SELECT COUNT(DISTINCT ur.user_id) INTO v_admin_count
    FROM public.user_roles ur JOIN public.role_groups rg ON rg.role_name = ur.role::text
    WHERE rg.is_admin;
    IF v_admin_count <= 1 THEN
      RETURN jsonb_build_object('allowed',false,'reason','last_admin')||v_ctx;
    END IF;
  END IF;

  IF v_is_admin THEN
    RETURN jsonb_build_object('allowed',true,'reason','admin_bypass')||v_ctx;
  END IF;
  IF v_caller_level > v_target_level THEN
    RETURN jsonb_build_object('allowed',true,'reason','ok')||v_ctx;
  END IF;
  RETURN jsonb_build_object('allowed',false,
    'reason', CASE WHEN v_target_level = 999 THEN 'unknown_target_role'
                   ELSE 'target_level_not_below_caller' END)||v_ctx;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_can_manage_user(
  _target uuid, _action text, _new_role text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_user(auth.uid(), _target, _action, _new_role);
$$;

-- Arregla el "todos Sin rol": va sobre PROFILES LEFT JOIN user_roles para no perder
-- a los que no tienen fila de rol. No expone email ni nada que no sea ya legible.
CREATE OR REPLACE FUNCTION public.admin_list_user_roles()
RETURNS TABLE (user_id uuid, role text, level int, is_admin boolean, manageable boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_level int; v_is_admin boolean;
BEGIN
  IF NOT public.can_manage_users(v_caller) THEN
    RAISE EXCEPTION 'insufficient_privilege: se requiere permiso de gestión de usuarios'
      USING ERRCODE = '42501';
  END IF;
  v_level := public.actor_level(v_caller);
  v_is_admin := public.is_in_role_group(v_caller,'admin');

  RETURN QUERY
  SELECT p.id,
         ur.role::text,
         CASE WHEN ur.role IS NULL THEN 0 ELSE COALESCE(rc.level, 999) END,
         COALESCE(rg.is_admin,false),
         (p.id <> v_caller AND (v_is_admin OR v_level >
            CASE WHEN ur.role IS NULL THEN 0 ELSE COALESCE(rc.level,999) END))
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  LEFT JOIN public.roles_config rc ON rc.name = ur.role::text
  LEFT JOIN public.role_groups  rg ON rg.role_name = ur.role::text;
END;
$$;

-- Nadie que no sea admin puede subirle el nivel a un rol (ni subirse a sí mismo).
CREATE OR REPLACE FUNCTION public.tg_roles_config_guard_level()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.level IS DISTINCT FROM OLD.level
     AND auth.uid() IS NOT NULL AND NOT public.is_in_role_group(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'solo un admin puede cambiar el nivel de un rol' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' AND auth.uid() IS NOT NULL
     AND NOT public.is_in_role_group(auth.uid(),'admin') THEN
    NEW.level := LEAST(COALESCE(NEW.level,10), public.actor_level(auth.uid()));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_roles_config_guard_level ON public.roles_config;
CREATE TRIGGER trg_roles_config_guard_level BEFORE INSERT OR UPDATE ON public.roles_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_roles_config_guard_level();

-- actor_level/target_level son oráculos del nivel de terceros: NO van a authenticated.
REVOKE ALL ON FUNCTION public.can_manage_user(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actor_level(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.target_level(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_manage_users(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_can_manage_user(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_user_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_user(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.actor_level(uuid)  TO service_role;
GRANT EXECUTE ON FUNCTION public.target_level(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_users(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_can_manage_user(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_user_roles() TO authenticated, service_role;
