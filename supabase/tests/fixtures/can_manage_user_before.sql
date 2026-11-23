-- Snapshot del autorizador anterior, obtenido en consulta de solo lectura.
-- Sin datos de usuarios ni credenciales. Sirve para reproducir la regresión.
CREATE OR REPLACE FUNCTION public.can_manage_user(_caller uuid, _target uuid, _action text, _new_role text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Otra agencia: nadie gestiona a quien no es de la suya (20261001211000).
  IF _target IS NOT NULL
     AND (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = _target)
         IS DISTINCT FROM (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = _caller) THEN
    RETURN jsonb_build_object('allowed', false, 'reason','other_agency');
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
    LEFT JOIN public.role_groups rg ON rg.role_name = rc.name AND rg.tenant_id = rc.tenant_id
    WHERE rc.name = _new_role AND rc.is_active
      AND rc.tenant_id = (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = _caller);

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
    FROM public.user_roles ur JOIN public.role_groups rg ON rg.role_name = ur.role::text and rg.tenant_id = ur.tenant_id
    WHERE rg.is_admin
      AND ur.tenant_id = (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = _target);
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
$function$

