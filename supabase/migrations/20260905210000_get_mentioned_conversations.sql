-- El badge de Menciones recorría CADA conversación en un bucle secuencial,
-- con 1-2 consultas por chat y un `ilike '%@nombre%'` que no puede usar índice.
--
-- Peor: se re-disparaba con cada INSERT que llevara "@" en TODA la organización
-- y con cada cambio de last_read_at (o sea, cada vez que alguien abre un chat).
-- Medido en prod sobre una sola pestaña: 60 peticiones en 25 segundos.
--
-- Acá va la misma lógica en una consulta. Medido sobre el usuario más pesado
-- (49 chats): 3,1 ms contra hasta 98 peticiones secuenciales.
--
-- position() en vez de ilike a propósito: un nombre que traiga % o _ no puede
-- convertirse en comodín.
CREATE OR REPLACE FUNCTION public.get_mentioned_conversations(
  _user_id uuid,
  _nombre text,
  _nombre_pila text
)
RETURNS TABLE(conversation_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT cp.conversation_id
  FROM chat_participants cp
  JOIN chat_messages cm ON cm.conversation_id = cp.conversation_id
  WHERE cp.user_id = _user_id
    AND _user_id = auth.uid()
    AND cm.is_deleted = false
    AND cm.sender_id <> _user_id
    AND (cp.last_read_at IS NULL OR cm.created_at > cp.last_read_at)
    AND (
      position(lower('@' || _nombre) in lower(cm.content)) > 0
      OR position(lower('@' || _nombre_pila) in lower(cm.content)) > 0
    );
$function$;

REVOKE ALL ON FUNCTION public.get_mentioned_conversations(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mentioned_conversations(uuid, text, text) TO authenticated;
