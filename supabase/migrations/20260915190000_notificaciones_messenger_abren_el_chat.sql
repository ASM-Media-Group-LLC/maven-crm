-- Las notificaciones de Messenger no abrían el chat.
--
-- notify_chat_message escribía deep_link_url = '/messenger?chat=<id>', pero la
-- página lee el parámetro `c` (/messenger?c=<id>). Resultado: el clic en la
-- campana o en /notificaciones aterrizaba en Messenger sin abrir nada. 86.254
-- notificaciones en 30 días, el 99 % de todas las que hay (auditoría 15/09).
--
-- Se corrige el productor. Las filas ya escritas no se tocan: el frontend acepta
-- `?chat=` como alias, así que siguen abriendo el chat igual.

CREATE OR REPLACE FUNCTION public.notify_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  participant RECORD;
  sender_name text;
  conv_name text;
  msg_preview text;
BEGIN
  SELECT full_name INTO sender_name FROM profiles WHERE id = NEW.sender_id;
  sender_name := COALESCE(sender_name, 'Alguien');

  SELECT name INTO conv_name FROM chat_conversations WHERE id = NEW.conversation_id;

  IF NEW.content IS NOT NULL AND NEW.content != '' THEN
    msg_preview := LEFT(NEW.content, 100);
  ELSE
    msg_preview := '📎 Archivo';
  END IF;

  FOR participant IN
    SELECT cp.user_id
    FROM chat_participants cp
    WHERE cp.conversation_id = NEW.conversation_id
      AND cp.user_id != NEW.sender_id
      AND cp.is_muted = false
  LOOP
    INSERT INTO notifications (
      user_id, type, title, message, reference_id, reference_type,
      module_origin, priority, status, deep_link_url, required_permission_module
    ) VALUES (
      participant.user_id,
      'chat_message',
      CASE WHEN conv_name IS NOT NULL THEN sender_name || ' en ' || conv_name ELSE sender_name END,
      msg_preview,
      NEW.conversation_id,
      'conversation',
      'messenger',
      'low',
      'new',
      -- `c`, no `chat`: el parámetro que MessengerPage lee.
      '/messenger?c=' || NEW.conversation_id,
      'Messenger'
    );
  END LOOP;

  RETURN NEW;
END;
$$;
