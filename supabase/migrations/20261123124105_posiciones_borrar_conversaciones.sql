CREATE OR REPLACE FUNCTION public.delete_conversation_cascade(_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _msg_ids uuid[];
BEGIN
  IF (auth.jwt() ?| array['mvf', 'mvk']) IS TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'MV403',
      MESSAGE = 'api_sesion_fabricada_no_borra: una sesión fabricada no borra conversaciones',
      DETAIL = '{"error": "forbidden"}';
  END IF;

  IF public.posicion_decision(auth.uid(),'N:msg.borrar') IS FALSE OR public.posicion_decision(auth.uid(),'Messenger|*') IS FALSE THEN
    RAISE EXCEPTION 'Tu posición no permite borrar conversaciones' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM chat_conversations c
    JOIN chat_participants p ON p.conversation_id = c.id AND p.user_id = auth.uid()
    WHERE c.id = _conversation_id
      AND (c.type = 'direct' OR p.role = 'admin')
  ) THEN
    RAISE EXCEPTION 'No autorizado para eliminar esta conversación';
  END IF;

  SELECT array_agg(id) INTO _msg_ids
  FROM chat_messages
  WHERE conversation_id = _conversation_id;

  IF _msg_ids IS NOT NULL AND array_length(_msg_ids, 1) > 0 THEN
    DELETE FROM chat_reactions WHERE message_id = ANY(_msg_ids);
    DELETE FROM chat_read_receipts WHERE message_id = ANY(_msg_ids);
  END IF;

  DELETE FROM chat_pinned WHERE conversation_id = _conversation_id;
  DELETE FROM chat_archived WHERE conversation_id = _conversation_id;
  DELETE FROM chat_space_conversations WHERE conversation_id = _conversation_id;
  DELETE FROM chat_messages WHERE conversation_id = _conversation_id;
  DELETE FROM chat_participants WHERE conversation_id = _conversation_id;
  DELETE FROM notifications WHERE reference_id = _conversation_id AND reference_type = 'conversation';
  DELETE FROM chat_conversations WHERE id = _conversation_id;
END;
$function$;
