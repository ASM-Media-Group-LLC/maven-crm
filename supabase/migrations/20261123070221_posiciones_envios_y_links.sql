-- Se vuelve a autorizar tanto al programar como al enviar.
CREATE OR REPLACE FUNCTION public.chat_programado_revisar(p_user uuid, p_conversation uuid, p_mensajes jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m jsonb;
  tipo text;
begin
  if public.posicion_decision(p_user,'Messenger|*') is false then return 'tu posición ya no permite enviar mensajes'; end if;
  if not public.is_chat_participant(p_user, p_conversation) then
    return 'ya no estás en esta conversación';
  end if;
  if exists (select 1 from public.chat_conversations c
              where c.id = p_conversation and c.type = 'group' and c.msg_permission = 'admins')
     and not public.is_chat_admin(p_user, p_conversation) then
    return 'en este grupo solo escriben los administradores';
  end if;
  if jsonb_typeof(p_mensajes) is distinct from 'array'
     or jsonb_array_length(p_mensajes) not between 1 and 20 then
    return 'el mensaje está vacío';
  end if;
  for m in select value from jsonb_array_elements(p_mensajes) loop
    if jsonb_typeof(m) is distinct from 'object' then return 'un mensaje viene con formato inválido'; end if;
    tipo := m ->> 'type';
    if (tipo <> 'text' or nullif(m->>'file_url','') is not null) and public.posicion_decision(p_user,'N:msg.archivos') is false then return 'tu posición ya no permite enviar archivos'; end if;
    -- Nunca un aviso de sistema: esos los arma la base (chat_evento_sistema).
    if tipo is null or tipo not in ('text', 'image', 'file') then return 'un mensaje viene con un tipo inválido'; end if;
    if char_length(coalesce(m ->> 'content', '')) > 20000 then return 'un mensaje es demasiado largo'; end if;
    if tipo = 'text' and btrim(coalesce(m ->> 'content', '')) = '' then return 'el mensaje está vacío'; end if;
    if tipo <> 'text' and nullif(m ->> 'file_url', '') is null then return 'falta el archivo'; end if;
    -- Lo mismo que chat_messages_al_insertar, que sin sesión no corre.
    if nullif(m ->> 'file_url', '') is not null
       and (m ->> 'file_url') !~ '^https://lsagslbkliprespbyhts\.supabase\.co/storage/v1/object/public/chat-files/'
       and (m ->> 'file_url') !~ '^https://media[0-9]*\.giphy\.com/' then
      return 'el archivo tiene que estar en el almacenamiento de Maven';
    end if;
    if nullif(m ->> 'reply_to_id', '') is not null then
      if (m ->> 'reply_to_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or not exists (select 1 from public.chat_messages r
                         where r.id = (m ->> 'reply_to_id')::uuid and r.conversation_id = p_conversation) then
        return 'el mensaje que respondes ya no está en esta conversación';
      end if;
    end if;
    if nullif(m ->> 'album_id', '') is not null
       and (m ->> 'album_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return 'un mensaje viene con formato inválido';
    end if;
  end loop;
  return null;
end $function$;
create or replace function public.puede_dar_links_subida(_uid uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_uid) then
 public.tiene_funcion(_uid,'Oficina|Drive') and public.tiene_funcion(_uid,'N:drive.compartir')
 else (select _uid is not null and (
    coalesce((select p.nivel in ('dueno', 'admin', 'manager', 'supervisor') from public.profiles p where p.id = _uid), false)
    or public.es_dueno(_uid)
    or exists (select 1 from public.user_roles ur
               where ur.user_id = _uid and ur.role in ('Coordinador', 'Coordinador Supervisor'))
  )) end;
$$;
CREATE OR REPLACE FUNCTION public.drive_links_de_creadoras()
 RETURNS TABLE(creator_id uuid, nombre text, artistico text, telefono text, carpeta_id uuid, carpeta text, raiz_id uuid, raiz text, token text, archivos bigint, bytes bigint, ultimo timestamp with time zone, usado_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with yo as (select (select auth.uid()) as uid),
  ve_todo as (
    select public.es_admin_o_dueno(yo.uid)
        or exists (select 1 from public.drive_acceso_total_ids() t where t = yo.uid) as v
      from yo
  )
  select c.id, c.name, c.artistic_name,
         case when ve_todo.v then coalesce(nullif(c.phone_e164, ''), nullif(c.whatsapp_number, '')) end,
         d.id, d.nombre, pd.id, pd.nombre,
         l.token, coalesce(a.archivos, 0)::bigint, coalesce(a.bytes, 0)::bigint, a.ultimo, l.usado_at
    from public.creators c
    cross join yo
    cross join ve_todo
    left join public.drive_carpeta_creadora m on m.creator_id = c.id
    left join public.drive_items d on d.id = m.item_id and d.trashed_at is null
    left join public.drive_items pd on pd.id = d.parent_id
    left join public.drive_upload_links l on l.item_id = d.id and l.tipo = 'personal' and l.activo
    left join lateral (
      select count(*) as archivos, sum(x.size) as bytes, max(x.created_at) as ultimo
        from public.drive_aportes x where x.item_id = d.id
    ) a on true
   where yo.uid is not null
     and public.posicion_decision(yo.uid,'N:drive.compartir') is distinct from false
     and public.posicion_decision(yo.uid,'Oficina|Drive') is distinct from false
     and c.status = 'active'
     and c.tenant_id = public.current_tenant_id()
     and (ve_todo.v or (d.id is not null and public.drive_mi_rol(d.id) is not null))
   order by a.ultimo desc nulls last, coalesce(c.artistic_name, c.name);
$function$;
CREATE OR REPLACE FUNCTION public.drive_links_de_subida()
 RETURNS TABLE(token text, carpeta_id uuid, carpeta text, padre text, creado_por text, creado_at timestamp with time zone, archivos bigint, bytes bigint, ultimo timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with yo as (select (select auth.uid()) as uid),
  ve_todo as (
    select public.es_admin_o_dueno(yo.uid)
        or exists (select 1 from public.drive_acceso_total_ids() t where t = yo.uid) as v
      from yo
  )
  select l.token, d.id, d.nombre, pd.nombre, p.full_name, l.created_at,
         coalesce(a.archivos, 0)::bigint, coalesce(a.bytes, 0)::bigint, a.ultimo
    from public.drive_upload_links l
    join public.drive_items d on d.id = l.item_id and d.trashed_at is null
    left join public.drive_items pd on pd.id = d.parent_id
    left join public.profiles p on p.id = l.created_by
    left join lateral (
      select count(*) as archivos, sum(x.size) as bytes, max(x.created_at) as ultimo
        from public.drive_aportes x where x.token = l.token
    ) a on true
    cross join yo
    cross join ve_todo
   where l.activo
     and l.tipo = 'subir'
     and yo.uid is not null
     and public.posicion_decision(yo.uid,'N:drive.compartir') is distinct from false
     and public.posicion_decision(yo.uid,'Oficina|Drive') is distinct from false
     and l.tenant_id = public.current_tenant_id()
     and (ve_todo.v or l.created_by = yo.uid)
   order by a.ultimo desc nulls last, d.nombre;
$function$;
