-- La publicación supabase_realtime tenía chatter_sessions pero faltaba
-- chatter_messages. Eso rompía la subscription del workspace: el examiner
-- no recibía los mensajes del chatter en tiempo real (solo veía nuevos
-- mensajes cuando él mismo enviaba uno y el componente forzaba refetch).
--
-- La migration original 20260502011215_chatter_evaluator_schema.sql tenía
-- la línea ALTER PUBLICATION ... ADD TABLE chatter_messages pero por algún
-- motivo no quedó aplicada (probable rollback parcial post-cutover o algún
-- intermediario que la dropeó).
--
-- Idempotente: DO block que verifica antes de agregar.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chatter_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chatter_messages;
  END IF;
END $$;
