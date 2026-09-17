-- Nadie recibe (push ni correo) notificaciones de un módulo al que no tiene
-- acceso en Roles (Jhon, 15/09: "si María no tiene acceso al tab de WhatsApp
-- no va a recibir notificaciones de WhatsApp"). La campana ya lo filtra en el
-- frontend por required_permission_module; esto es la misma regla del lado del
-- servidor, para lo que sale del navegador: push y correo.
--
-- Aplicada en prod por MCP el 15/09 (misma SQL). Este archivo es la copia del repo.

create or replace function public.puede_ver_modulo(_user_id uuid, _module text, _submodule text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
begin
  if _module is null then
    return true;
  end if;
  if public.is_in_role_group(_user_id, 'admin') then
    return true;
  end if;
  select rc.id into v_role_id
  from public.user_roles ur
  join public.roles_config rc on rc.name = ur.role and rc.is_active
  where ur.user_id = _user_id
  limit 1;
  -- Espejo de UNIVERSAL_MODULES (frontend, usePermissions.ts): sin fila de
  -- permiso se ven igual; con fila explícita, manda la fila.
  if _module in ('Dashboard', 'Messenger', 'Cowork', 'Meet', 'Correo', 'Grabaciones') then
    if v_role_id is null or not exists (
      select 1 from public.role_permissions rp where rp.role_id = v_role_id and rp.module = _module
    ) then
      return true;
    end if;
  end if;
  return public.has_permission(_user_id, _module, _submodule);
end;
$$;

revoke all on function public.puede_ver_modulo(uuid, text, text) from public, anon;
grant execute on function public.puede_ver_modulo(uuid, text, text) to authenticated, service_role;

create or replace function public.push_desde_notificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null or new.type is null or new.type = 'chat_message' then
    return null;
  end if;
  -- Sin acceso al módulo en Roles no hay push ni correo.
  if new.required_permission_module is not null
     and not public.puede_ver_modulo(new.user_id, new.required_permission_module, new.required_permission_submodule) then
    return null;
  end if;
  -- Ráfagas: al celular va UNA por tipo y persona por minuto de reloj; las demás
  -- quedan en la campana. Gana la menor (created_at, id).
  if exists (
    select 1 from notifications n
    where n.user_id = new.user_id and n.type = new.type
      and date_trunc('minute', n.created_at) = date_trunc('minute', new.created_at)
      and (n.created_at, n.id) < (new.created_at, new.id)
  ) then
    return null;
  end if;
  perform public.push_notify_enqueue(
    new.type,
    array[new.user_id],
    jsonb_build_object('notification_id', new.id, 'reference_type', new.reference_type, 'reference_id', new.reference_id),
    coalesce(nullif(new.title, ''), 'Maven'),
    coalesce(new.message, ''),
    coalesce(nullif(new.deep_link_url, ''), '/notificaciones'),
    'notif-' || new.id,
    case when new.priority in ('critical', 'high') then 'normal' else 'low' end
  );
  return null;
end
$$;

create or replace function public.push_wa_asignacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien text;
begin
  if new.assigned_by is null or new.assigned_by = new.user_id then
    return null;
  end if;
  if not public.puede_ver_modulo(new.user_id, 'WhatsApp', null) then
    return null;
  end if;
  select nullif(c.display_name, '') into v_quien
  from wa_conversations wc
  join wa_contacts c on c.id = wc.contact_id
  where wc.id = new.conversation_id;
  perform public.push_notify_enqueue(
    'inbox_asignacion',
    array[new.user_id],
    jsonb_build_object('conversation_id', new.conversation_id, 'assigned_by', new.assigned_by, 'channel', 'wa'),
    'Te asignaron una conversación',
    coalesce(v_quien, 'Un contacto de WhatsApp'),
    '/inbox?c=' || new.conversation_id,
    'inbox-' || new.conversation_id,
    'normal'
  );
  return null;
end
$$;

create or replace function public.push_tg_asignacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien text;
begin
  if new.assigned_by is null or new.assigned_by = new.user_id then
    return null;
  end if;
  if not public.puede_ver_modulo(new.user_id, 'Telegram', null) then
    return null;
  end if;
  select coalesce(nullif(t.peer_name, ''), nullif('@' || t.peer_username, '@')) into v_quien
  from tg_conversations t
  where t.id = new.conversation_id;
  perform public.push_notify_enqueue(
    'inbox_asignacion',
    array[new.user_id],
    jsonb_build_object('conversation_id', new.conversation_id, 'assigned_by', new.assigned_by, 'channel', 'tg'),
    'Te asignaron una conversación',
    coalesce(v_quien, 'Un contacto de Telegram'),
    '/telegram/bandeja?c=' || new.conversation_id,
    'inbox-tg-' || new.conversation_id,
    'normal'
  );
  return null;
end
$$;

-- "ChatterEvaluator" no existe en role_permissions; el módulo real es Chatters → Evaluator.
update public.notifications
set required_permission_module = 'Chatters',
    required_permission_submodule = 'Evaluator'
where required_permission_module = 'ChatterEvaluator';
