-- El sidebar del Messenger pedía el último mensaje de cada chat POR SEPARADO.
--
-- El lote de useChat traía los `convIds.length * 2` mensajes más nuevos de forma
-- GLOBAL: como esos salen casi todos de los 2-3 chats activos, el resto quedaba
-- sin vista previa y se pedía uno por uno. Medido sobre 24 h de edge_logs: 11,4
-- peticiones a chat_messages por refresco, y el refresco corre cada 20 s por
-- pestaña abierta → 1,13 M de peticiones/día, el 36% de TODO el tráfico.
--
-- Además era un bug visible: el fallback se rendía si faltaban más de 20 chats,
-- así que quien tuviera muchas conversaciones (hoy 8 personas, máx 49) las veía
-- sin vista previa.
--
-- Esta función lo resuelve en UNA consulta. El LATERAL saca exactamente una fila
-- por conversación apoyándose en idx_chat_messages_conversation
-- (conversation_id, created_at DESC) en vez de leer el historial entero y
-- ordenarlo: medido sobre el usuario más pesado, 1,2 ms y 205 páginas contra
-- 4,1 ms y 1.716 del DISTINCT ON.
--
-- No filtra is_deleted a propósito: el sidebar muestra "mensaje eliminado" como
-- último mensaje, igual que antes.
CREATE OR REPLACE FUNCTION public.get_last_messages(_user_id uuid)
RETURNS SETOF chat_messages
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT cm.*
  FROM chat_participants cp
  CROSS JOIN LATERAL (
    SELECT m.*
    FROM chat_messages m
    WHERE m.conversation_id = cp.conversation_id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) cm
  WHERE cp.user_id = _user_id
    AND _user_id = auth.uid();
$function$;

REVOKE ALL ON FUNCTION public.get_last_messages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_last_messages(uuid) TO authenticated;
