-- Reemplazar postgres_changes por Broadcast nativo de Supabase Realtime
-- para la entrega de mensajes en el chatter evaluator. Razones:
--
--   · postgres_changes evalúa RLS por cada broadcast — joins, funciones
--     y multi-cliente lo rompen silenciosamente (ya pasamos 5 migraciones
--     intentando estabilizarlo).
--   · Broadcast es push directo servidor→canal, sin WAL, sin RLS por row.
--     Latencia ~50ms, robusto bajo carga.
--   · Es la recomendación oficial de Supabase para chat-like usecases.
--
-- Implementación: AFTER INSERT trigger sobre chatter_messages que invoca
-- realtime.send() con topic per-session. Frontend (ChatPanel del examiner
-- y ChatterPublicView del chatter) se suscribe a ese topic via
-- .on('broadcast', { event: 'new_message' }, ...).
--
-- Topic format: 'chatter-session:{session_id}'. Mismo nombre para examiner
-- y chatter — los dos escuchan el mismo broadcast cuando llega un mensaje
-- en la sesión.
--
-- private=false: canal público. La seguridad la da el session_id en sí
-- (es esencialmente un secret token en la URL del chatter; el RLS de
-- INSERT/SELECT de la tabla sigue protegiendo el acceso real).

CREATE OR REPLACE FUNCTION public.broadcast_chatter_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object('message_id', NEW.id, 'session_id', NEW.session_id),
    'new_message',
    'chatter-session:' || NEW.session_id,
    false
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Si el broadcast falla por la razón que sea, no hacemos rollback del
  -- INSERT — el mensaje ya está en la DB y el polling/refetch lo recoge.
  RAISE WARNING 'broadcast_chatter_message failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS chatter_messages_broadcast_trigger ON public.chatter_messages;
CREATE TRIGGER chatter_messages_broadcast_trigger
  AFTER INSERT ON public.chatter_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_chatter_message();
