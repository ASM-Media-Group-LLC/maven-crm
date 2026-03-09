-- Trigger function to create a notification for each participant when a new chat message arrives
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
  -- Get sender name
  SELECT full_name INTO sender_name FROM profiles WHERE id = NEW.sender_id;
  sender_name := COALESCE(sender_name, 'Alguien');

  -- Get conversation name (for groups) or null (for DMs)
  SELECT name INTO conv_name FROM chat_conversations WHERE id = NEW.conversation_id;

  -- Build message preview
  IF NEW.content IS NOT NULL AND NEW.content != '' THEN
    msg_preview := LEFT(NEW.content, 100);
  ELSE
    msg_preview := '📎 Archivo';
  END IF;

  -- Notify each participant except the sender
  FOR participant IN
    SELECT cp.user_id
    FROM chat_participants cp
    WHERE cp.conversation_id = NEW.conversation_id
      AND cp.user_id != NEW.sender_id
      AND cp.is_muted = false
  LOOP
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      reference_id,
      reference_type,
      module_origin,
      priority,
      status,
      deep_link_url,
      required_permission_module
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
      '/messenger?chat=' || NEW.conversation_id,
      'Messenger'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS on_chat_message_notify ON chat_messages;
CREATE TRIGGER on_chat_message_notify
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_chat_message();