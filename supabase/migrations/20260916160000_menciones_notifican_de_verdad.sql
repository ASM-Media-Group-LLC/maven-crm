-- Las menciones pasan a ser notificaciones de primera clase.
--
-- Jhon se mencionó desde la cuenta test en un grupo y no le llegó nada (16/09).
-- El trigger creaba la fila bien, pero como `chat_message` — igual que un "hola" —
-- y la campana excluye chat_message a propósito (viven en la nube de Messenger).
-- Que te nombren con @ no es un mensaje cualquiera: ahora es `chat_mention`,
-- prioridad alta, y la campana lo muestra.

-- Detector puro y probable: "@Nombre Completo" con borde de palabra después, sin
-- distinguir mayúsculas. El autocompletado inserta siempre el nombre completo, así
-- que con eso basta; el borde evita que "@Juanita" cuente para "Juan".
create or replace function public.menciona_a(p_content text, p_full_name text)
returns boolean
language sql
immutable
as $$
  select p_content is not null
     and nullif(btrim(p_full_name), '') is not null
     and p_content ~* ('(^|[^[:alnum:]_])@' || regexp_replace(btrim(p_full_name), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '($|[^[:alnum:]_])');
$$;

create or replace function public.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  participant record;
  sender_name text;
  conv_name text;
  msg_preview text;
  es_mencion boolean;
begin
  select full_name into sender_name from profiles where id = new.sender_id;
  sender_name := coalesce(sender_name, 'Alguien');

  select name into conv_name from chat_conversations where id = new.conversation_id;

  if new.content is not null and new.content != '' then
    msg_preview := left(new.content, 100);
  else
    msg_preview := '📎 Archivo';
  end if;

  for participant in
    select cp.user_id, p.full_name
    from chat_participants cp
    left join profiles p on p.id = cp.user_id
    where cp.conversation_id = new.conversation_id
      and cp.user_id != new.sender_id
      and cp.is_muted = false
  loop
    es_mencion := public.menciona_a(new.content, participant.full_name);
    insert into notifications (
      user_id, type, title, message, reference_id, reference_type,
      module_origin, priority, status, deep_link_url, required_permission_module
    ) values (
      participant.user_id,
      case when es_mencion then 'chat_mention' else 'chat_message' end,
      case
        when es_mencion and conv_name is not null then sender_name || ' te mencionó en ' || conv_name
        when es_mencion then sender_name || ' te mencionó'
        when conv_name is not null then sender_name || ' en ' || conv_name
        else sender_name
      end,
      msg_preview,
      new.conversation_id,
      'conversation',
      'messenger',
      case when es_mencion then 'high' else 'low' end,
      'new',
      '/messenger?c=' || new.conversation_id,
      'Messenger'
    );
  end loop;

  return new;
end;
$$;

-- El push de un mensaje (mención incluida) ya lo manda push_chat_message por
-- mensaje; si esta función también empujara las menciones, llegarían dobles.
create or replace function public.push_desde_notificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null or new.type is null or new.type in ('chat_message', 'chat_mention') then
    return null;
  end if;
  if new.required_permission_module is not null
     and not public.puede_ver_modulo(new.user_id, new.required_permission_module, new.required_permission_submodule) then
    return null;
  end if;
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
