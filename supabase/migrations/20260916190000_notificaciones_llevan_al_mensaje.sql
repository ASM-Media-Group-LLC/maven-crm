-- LA NOTIFICACIÓN DE MESSENGER LLEVA AL MENSAJE, NO SOLO A LA CONVERSACIÓN.
--
-- María Villegas (16/09): "me abrió el grupo pero no me llevó al hilo". El
-- deep_link_url era '/messenger?c=<conversación>': si la mención estaba dentro
-- de un hilo, había que buscarla hilo por hilo. Ahora lleva también
-- '&m=<mensaje>' y Messenger abre el hilo del padre y resalta la respuesta
-- (o resalta el mensaje en el timeline si no es de hilo).
--
-- El resto de la función queda igual que en menciones_notifican_de_verdad.
create or replace function public.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
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
      -- '&m=': el mensaje concreto; Messenger abre el hilo si hace falta.
      '/messenger?c=' || new.conversation_id || '&m=' || new.id,
      'Messenger'
    );
  end loop;

  return new;
end;
$$;
