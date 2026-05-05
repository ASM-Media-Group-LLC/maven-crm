
CREATE OR REPLACE FUNCTION public.delete_conversation_cascade(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _msg_ids uuid[];
BEGIN
  -- Collect message IDs
  SELECT array_agg(id) INTO _msg_ids
  FROM chat_messages
  WHERE conversation_id = _conversation_id;

  -- Delete message-level children
  IF _msg_ids IS NOT NULL AND array_length(_msg_ids, 1) > 0 THEN
    DELETE FROM chat_reactions WHERE message_id = ANY(_msg_ids);
    DELETE FROM chat_read_receipts WHERE message_id = ANY(_msg_ids);
  END IF;

  -- Delete conversation-level children
  DELETE FROM chat_pinned WHERE conversation_id = _conversation_id;
  DELETE FROM chat_space_conversations WHERE conversation_id = _conversation_id;
  DELETE FROM chat_messages WHERE conversation_id = _conversation_id;
  DELETE FROM chat_participants WHERE conversation_id = _conversation_id;
  DELETE FROM notifications WHERE reference_id = _conversation_id::text AND reference_type = 'conversation';

  -- Delete the conversation
  DELETE FROM chat_conversations WHERE id = _conversation_id;
END;
$$;
