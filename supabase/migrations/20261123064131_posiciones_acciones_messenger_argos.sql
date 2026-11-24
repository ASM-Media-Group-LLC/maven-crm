-- Actions must consume the effective position decision at their server entry.
create or replace function public.posicion_persona_en_alcance(_caller uuid,_target uuid,_funcion text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(_caller is not null and _target is not null
   and exists(select 1 from public.tenant_members a join public.tenant_members b on b.tenant_id=a.tenant_id
     where a.user_id=_caller and b.user_id=_target)
   and public.tiene_funcion(_caller,_funcion)
   and (public.es_dueno(_caller) or exists(
     select 1 from public.posiciones_borrador_personas a
     join public.posiciones_borrador p on p.id=a.posicion_id
     join public.tenant_members m on m.user_id=a.user_id and m.tenant_id=p.tenant_id
     join public.posiciones_funciones_catalogo() c on c.clave=_funcion
     where a.user_id=_caller and p.activa and (p.acceso_total or (p.checks->_funcion='true'::jsonb and
       case coalesce(p.alcances->>c.fila,'all')
         when 'all' then true
         when 'self' then _caller=_target
         when 'subordinates' then _caller=_target or exists(
           select 1 from public.profiles yo cross join public.profiles t
           where yo.id=_caller and t.id=_target and yo.deleted_at is null and not public.es_admin_o_dueno(t.id)
           and ((yo.nivel='supervisor' and t.nivel='agente' and public.equipo_de(yo.id)<>'Otros' and public.equipo_de(yo.id)=public.equipo_de(t.id))
             or exists(select 1 from public.equipos_a_cargo e where e.user_id=_caller and e.tenant_id=p.tenant_id and e.equipo=public.equipo_de(t.id)))
         )
         else false end
     )))
   ),false);
$$;
revoke all on function public.posicion_persona_en_alcance(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.posicion_persona_en_alcance(uuid,uuid,text) to service_role;

create or replace function public.argos_perdonar_captura(_id uuid,_perdonar boolean default true)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); persona uuid;
begin
 select c.user_id into persona from public.monitor_capturas c where c.id=_id;
 if actor is null or persona is null or not exists(select 1 from public.tenant_members a
   join public.tenant_members b on b.tenant_id=a.tenant_id where a.user_id=actor and b.user_id=persona) then
   raise exception 'Captura no disponible' using errcode='42501';
 end if;
 if (public.posiciones_controlan(actor) and not public.posicion_persona_en_alcance(actor,persona,'N:argos.perdonar'))
   or (not public.posiciones_controlan(actor) and not public.es_admin_o_dueno(actor)) then
   raise exception 'Tu posición no permite perdonar esta captura' using errcode='42501';
 end if;
 update public.monitor_capturas set perdonado=coalesce(_perdonar,true),
   perdonado_por=case when coalesce(_perdonar,true) then actor else null end,
   perdonado_at=case when coalesce(_perdonar,true) then now() else null end where id=_id;
end $$;
revoke all on function public.argos_perdonar_captura(uuid,boolean) from public,anon;
grant execute on function public.argos_perdonar_captura(uuid,boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.delete_chat_message(p_message_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller uuid := auth.uid();
  m record;
begin
  if v_caller is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if public.posicion_decision(v_caller,'N:msg.borrar') is false or public.posicion_decision(v_caller,'Messenger|*') is false then
    return jsonb_build_object('ok',false,'error','position_function_denied');
  end if;

  select id, conversation_id, sender_id, content, content_rich, type, file_url, file_name, file_size, is_deleted,
         api_key_id, api_display_name
    into m
  from chat_messages
  where id = p_message_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if m.is_deleted then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if m.sender_id <> v_caller then
    return jsonb_build_object('ok', false, 'error', 'not_author');
  end if;

  insert into chat_message_deletions (
    message_id, conversation_id, sender_id, deleted_by,
    content, content_rich, type, file_url, file_name, file_size,
    api_key_id, api_display_name
  ) values (
    m.id, m.conversation_id, m.sender_id, v_caller,
    m.content, m.content_rich, m.type, m.file_url, m.file_name, m.file_size,
    m.api_key_id, m.api_display_name
  )
  on conflict (message_id) do nothing;

  -- El permiso para pasar is_deleted a true vale para ESTE mensaje y se apaga
  -- enseguida (local a la transacción; PostgREST no expone set_config).
  perform set_config('maven.borrado_autorizado', m.id::text, true);
  update chat_messages
     set is_deleted = true, content = null, content_rich = null,
         file_url = null, file_name = null, file_size = null
   where id = m.id;
  perform set_config('maven.borrado_autorizado', '', true);

  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.monitoreo_avisar(_user_id uuid, _situacion text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_sesion uuid;
  v_sala uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  if _situacion is null or _situacion !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'Situación inválida' using errcode = '22023';
  end if;
  if (public.posiciones_controlan(v_uid) and not public.posicion_persona_en_alcance(v_uid,_user_id,'N:argos.avisar'))
    or (not public.posiciones_controlan(v_uid) and not public.puede_vigilar_a(v_uid,_user_id)) then
    raise exception 'No puedes avisarle a esta persona' using errcode = '42501';
  end if;

  select a.session_id, a.room_id into v_sesion, v_sala
    from public.cowork_room_assignments a
    join public.cowork_sessions s on s.id = a.session_id and s.status = 'active'
   where a.user_id = _user_id and a.is_active
     and (s.tenant_id is null or s.tenant_id = public.current_tenant_id())
   order by a.assigned_at desc
   limit 1;
  if v_sesion is null then
    raise exception 'No está en Cowork' using errcode = 'P0002';
  end if;

  insert into public.cowork_avisos (session_id, room_id, user_id, situacion, created_by)
  values (v_sesion, v_sala, _user_id, _situacion, v_uid)
  returning id into v_id;
  return v_id;
end;
$function$;
