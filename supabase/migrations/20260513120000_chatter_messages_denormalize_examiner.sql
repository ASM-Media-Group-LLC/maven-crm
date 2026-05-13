-- Denormalizar examiner_user_id en chatter_messages para que la RLS de
-- SELECT/UPDATE no necesite JOIN a chatter_sessions. Las policies con
-- subqueries son problemáticas para Supabase Realtime: el worker de
-- realtime evalúa RLS sobre cada broadcast y los joins fallan silenciosamente
-- bajo carga multi-cliente, dropeando eventos (sólo llegaba la notificación
-- via polling, pero los mensajes en realtime nunca aparecían en el ChatPanel).
--
-- La fix: copiar examiner_user_id desde chatter_sessions a cada chatter_messages
-- via trigger BEFORE INSERT, y cambiar las policies a comparar columna directa.
-- Postgres Replication evalúa una expresión simple `col = auth.uid()` orders
-- of magnitude más rápido que un EXISTS con join, y nunca falla.

-- 1. Agregar la columna nullable (luego NOT NULL post-backfill)
ALTER TABLE public.chatter_messages
  ADD COLUMN IF NOT EXISTS examiner_user_id uuid;

-- 2. Backfill desde chatter_sessions
UPDATE public.chatter_messages m
SET examiner_user_id = s.examiner_user_id
FROM public.chatter_sessions s
WHERE m.session_id = s.id
  AND m.examiner_user_id IS NULL;

-- 3. Trigger BEFORE INSERT que copia examiner_user_id desde la session.
--    Eso garantiza que cada INSERT futuro tenga la columna poblada sin
--    que el caller (edge function, client) tenga que mandarla. Si la session
--    es reasignada después, hay un trigger separado en chatter_sessions
--    que actualiza los mensajes en cascade.
CREATE OR REPLACE FUNCTION public.chatter_messages_set_examiner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.examiner_user_id IS NULL THEN
    SELECT s.examiner_user_id INTO NEW.examiner_user_id
    FROM public.chatter_sessions s
    WHERE s.id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chatter_messages_set_examiner_trigger ON public.chatter_messages;
CREATE TRIGGER chatter_messages_set_examiner_trigger
  BEFORE INSERT ON public.chatter_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.chatter_messages_set_examiner();

-- 4. Trigger en chatter_sessions UPDATE: si el examiner se reasigna,
--    propagar a los mensajes existentes. Caso raro (sólo para sesiones
--    reasignadas post-creación) pero lo cubrimos por completitud.
CREATE OR REPLACE FUNCTION public.chatter_sessions_propagate_examiner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.examiner_user_id IS DISTINCT FROM OLD.examiner_user_id THEN
    UPDATE public.chatter_messages
    SET examiner_user_id = NEW.examiner_user_id
    WHERE session_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chatter_sessions_propagate_examiner_trigger ON public.chatter_sessions;
CREATE TRIGGER chatter_sessions_propagate_examiner_trigger
  AFTER UPDATE OF examiner_user_id ON public.chatter_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.chatter_sessions_propagate_examiner();

-- 5. Recrear las policies de SELECT/UPDATE para authenticated SIN join.
--    Mantenemos chatter_messages_anon_read sin cambios (anon necesita
--    seguir leyendo via el cliente público del chatter).
DROP POLICY IF EXISTS chatter_messages_read ON public.chatter_messages;
CREATE POLICY chatter_messages_read ON public.chatter_messages
  FOR SELECT TO authenticated
  USING (examiner_user_id = auth.uid());

DROP POLICY IF EXISTS chatter_messages_update ON public.chatter_messages;
CREATE POLICY chatter_messages_update ON public.chatter_messages
  FOR UPDATE TO authenticated
  USING (examiner_user_id = auth.uid());

-- INSERT policy: el cliente authenticated solo puede insertar mensajes
-- en sus propias sesiones. Antes hacía join — lo cambiamos también para
-- coherencia (no afecta realtime, sí afecta latencia del INSERT).
DROP POLICY IF EXISTS chatter_messages_insert ON public.chatter_messages;
CREATE POLICY chatter_messages_insert ON public.chatter_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    examiner_user_id IS NULL  -- el trigger lo va a setear
    OR examiner_user_id = auth.uid()
  );

-- 6. Index para que el filter de realtime + queries de UI sean rápidas
CREATE INDEX IF NOT EXISTS idx_chatter_messages_examiner
  ON public.chatter_messages(examiner_user_id);
