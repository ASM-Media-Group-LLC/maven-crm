-- Conecta las cinco funciones de Usuarios con el autorizador ya existente.
-- Conserva límites de agencia, jerarquía, cuenta propia y último administrador.
-- La función y su alcance deben pertenecer a la MISMA posición: no combinar
-- una casilla de un puesto limitado con el alcance de otro que no la concede.
create or replace function public.posicion_usuario_en_alcance(_caller uuid, _target uuid, _funcion text default 'Administración|Usuarios')
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(
    _caller is not null and _target is not null
    and exists (select 1 from public.tenant_members a join public.tenant_members b on b.tenant_id=a.tenant_id
                where a.user_id=_caller and b.user_id=_target)
    and not coalesce((select m.deshabilitada from public.personas_borrador_marcas m where m.user_id=_caller),false)
    and (not public.posiciones_controlan(_caller) or public.es_dueno(_caller) or exists (
      select 1 from public.posiciones_borrador_personas pp
      join public.posiciones_borrador p on p.id=pp.posicion_id
      where pp.user_id=_caller and p.activa and (p.acceso_total or (
        coalesce((p.checks->>'Administración|Usuarios')::boolean,false)
        and coalesce((p.checks->>_funcion)::boolean,false)
        and case coalesce(p.alcances->>'Usuarios','all')
          when 'all' then true
          when 'self' then _target=_caller
          when 'subordinates' then _target=_caller or exists (
            select 1 from public.profiles yo cross join public.profiles t
            where yo.id=_caller and t.id=_target and yo.deleted_at is null
              and not public.es_admin_o_dueno(t.id)
              and ((yo.nivel='supervisor' and t.nivel='agente'
                    and public.equipo_de(yo.id)<>'Otros' and public.equipo_de(yo.id)=public.equipo_de(t.id))
                or exists (select 1 from public.equipos_a_cargo e
                           join public.tenant_members tm on tm.user_id=_caller and tm.tenant_id=e.tenant_id
                           where e.user_id=_caller and e.equipo=public.equipo_de(t.id)))
          )
          else false end
      ))
    )),false)
$$;
revoke all on function public.posicion_usuario_en_alcance(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.posicion_usuario_en_alcance(uuid,uuid,text) to service_role;

CREATE OR REPLACE FUNCTION public.can_manage_user(_caller uuid, _target uuid, _action text, _new_role text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_level int; v_target_level int; v_new_role_level int;
  v_is_admin boolean; v_target_is_admin boolean; v_new_role_is_admin boolean;
  v_admin_count int; v_effective_role text; v_ctx jsonb; v_function text;
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
  -- El alta sin rol crea employee por el trigger de auth.users: también se
  -- valida ese nivel para que omitir el campo no salte la jerarquía.
  if _action='create_user' and _new_role is null then _new_role := 'employee'; end if;

  -- Si el rol pedido es el que YA tiene, no es asignación: así "editar el nombre"
  -- (que el front manda siempre con role) no se convierte en cambio de rol.
  IF _new_role IS NOT NULL AND _target IS NOT NULL THEN
    SELECT ur.role::text INTO v_effective_role
    FROM public.user_roles ur WHERE ur.user_id = _target LIMIT 1;
    IF v_effective_role = _new_role THEN _new_role := NULL; END IF;
  END IF;

  -- Cada operación respeta su casilla, incluso cuando el rol es admin.
  v_function := case _action
    when 'create_user' then 'N:usr.agregar'
    when 'update_profile' then 'N:usr.editar'
    when 'delete_user' then 'N:usr.desactivar'
    when 'reset_password' then 'N:usr.reset'
    when 'assign_role' then 'N:usr.asignar'
    when 'remove_role' then 'N:usr.asignar'
    else null end;
  if v_function is not null and public.posicion_decision(_caller,v_function) is false then
    return jsonb_build_object('allowed',false,'reason','position_function_denied','function',v_function)||v_ctx;
  end if;
  -- Editar el perfil no puede convertirse en asignar un rol por otro camino.
  -- Se evalúa después de normalizar el rol sin cambios a NULL.
  if _new_role is not null and (_action='update_profile' or (_action='create_user' and _new_role<>'employee'))
     and public.posicion_decision(_caller,'N:usr.asignar') is false then
    return jsonb_build_object('allowed',false,'reason','position_function_denied','function','N:usr.asignar')||v_ctx;
  end if;
  if _target is not null and _action not in ('create_user','list_users')
     and (not public.posicion_usuario_en_alcance(_caller,_target,v_function)
       or (_action='update_profile' and _new_role is not null
           and not public.posicion_usuario_en_alcance(_caller,_target,'N:usr.asignar'))) then
    return jsonb_build_object('allowed',false,'reason','outside_position_scope')||v_ctx;
  end if;
  -- La cuenta del dueño no se puede administrar mediante el bypass de admin.
  if _target is not null and _target <> _caller
     and public.es_dueno(_target) and not public.es_dueno(_caller) then
    return jsonb_build_object('allowed',false,'reason','protected_owner')||v_ctx;
  end if;
  if _target is not null and not public.es_dueno(_caller)
     and exists (select 1 from public.personas_borrador_marcas m where m.user_id=_target and m.protegido) then
    return jsonb_build_object('allowed',false,'reason','protected_user')||v_ctx;
  end if;

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
$function$;

revoke all on function public.can_manage_user(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.can_manage_user(uuid,uuid,text,text) to service_role;

CREATE OR REPLACE FUNCTION public.admin_list_user_roles()
RETURNS TABLE(user_id uuid, role text, level integer, is_admin boolean, manageable boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid := auth.uid(); v_level int; v_is_admin boolean;
BEGIN
  IF v_caller is null or NOT public.can_manage_users(v_caller) THEN
    RAISE EXCEPTION 'Se requiere permiso de gestión de usuarios' USING ERRCODE='42501';
  END IF;
  v_level := public.actor_level(v_caller);
  v_is_admin := public.is_in_role_group(v_caller,'admin');
  RETURN QUERY
  SELECT p.id, ur.role::text,
    CASE WHEN ur.role IS NULL THEN 0 ELSE COALESCE(rc.level,999) END,
    COALESCE(rg.is_admin,false),
    (p.id<>v_caller AND (public.es_dueno(v_caller) or (not public.es_dueno(p.id)
      and not exists (select 1 from public.personas_borrador_marcas m where m.user_id=p.id and m.protegido)))
      AND (v_is_admin OR v_level>CASE WHEN ur.role IS NULL THEN 0 ELSE COALESCE(rc.level,999) END))
  FROM public.profiles p
  JOIN public.tenant_members tm ON tm.user_id=p.id AND tm.tenant_id=public.current_tenant_id()
  LEFT JOIN public.user_roles ur ON ur.user_id=p.id AND ur.tenant_id=tm.tenant_id
  LEFT JOIN public.roles_config rc ON rc.name=ur.role::text AND rc.tenant_id=tm.tenant_id
  LEFT JOIN public.role_groups rg ON rg.role_name=ur.role::text AND rg.tenant_id=tm.tenant_id
  WHERE public.posicion_usuario_en_alcance(v_caller,p.id);
END;
$$;
revoke all on function public.admin_list_user_roles() from public,anon;
grant execute on function public.admin_list_user_roles() to authenticated,service_role;

