-- Forzar republicación de chatter_messages en la publication
-- supabase_realtime. Después de varios cambios de RLS encadenados
-- (denormalize_examiner, drop_chatter_messages_global_policy), el worker
-- de realtime puede haber quedado con cache stale sobre la tabla. Drop +
-- add la republica desde cero y el worker reconstruye su estado.

ALTER PUBLICATION supabase_realtime DROP TABLE public.chatter_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chatter_messages;
