
CREATE OR REPLACE FUNCTION public.get_unread_counts(_user_id uuid)
RETURNS TABLE(conversation_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    cp.conversation_id,
    COUNT(cm.id) AS unread_count
  FROM chat_participants cp
  LEFT JOIN chat_messages cm
    ON cm.conversation_id = cp.conversation_id
    AND cm.sender_id != _user_id
    AND (cp.last_read_at IS NULL OR cm.created_at > cp.last_read_at)
  WHERE cp.user_id = _user_id
  GROUP BY cp.conversation_id;
$$;
