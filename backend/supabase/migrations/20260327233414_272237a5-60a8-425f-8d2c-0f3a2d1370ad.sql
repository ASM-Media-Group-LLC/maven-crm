
-- Table for archived chats
CREATE TABLE public.chat_archived (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, conversation_id)
);

ALTER TABLE public.chat_archived ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own archived" ON public.chat_archived
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own archived" ON public.chat_archived
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own archived" ON public.chat_archived
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Also clean archived on conversation delete
CREATE OR REPLACE FUNCTION public.delete_conversation_cascade(_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _msg_ids uuid[];
BEGIN
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
$$;
