-- Grabaciones de reuniones (Cowork y Meet).
--
-- DISEÑO CLAVE — VENCIMIENTO A 90 DÍAS SIN EXCEPCIONES.
-- No hay forma de exceptuar una grabación: todas se borran. Eso es lo que
-- hace que el archivo pueda vivir en el disco del VPS de producción — al
-- no haber excepciones el espacio queda ACOTADO (~3 meses de grabaciones,
-- unos 36 GB a 20 reuniones/mes, contra 191 GB libres). Lo riesgoso era el
-- crecimiento sin techo, no el volumen.
--
-- CONTRAPARTIDA que la UI debe dejar clarísima: si alguien necesita una
-- grabación por más tiempo, tiene que DESCARGARLA a su equipo. Hay que
-- avisarlo al grabar, mostrar la fecha de vencimiento en la lista, y
-- notificar antes de que se borre.
--
-- Es exactamente el problema que encontramos en Google: 33 TB acumulados
-- que nadie sabía que existían. Por eso la UI muestra el total usado
-- arriba de la lista — el espacio nunca vuelve a ser invisible.

CREATE TABLE IF NOT EXISTS public.meeting_recordings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Sala de LiveKit. Sirve para reconstruir de qué reunión salió.
  room_name         text NOT NULL,
  source            text NOT NULL DEFAULT 'cowork',
  title             text,
  started_by        uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at        timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  duration_seconds  integer,
  size_bytes        bigint,
  -- El archivo vive en el disco del VPS. Es viable SOLO porque el
  -- vencimiento no tiene excepciones: si alguna vez se agrega una, el
  -- crecimiento vuelve a ser sin techo y hay que mover esto afuera.
  storage_provider  text NOT NULL DEFAULT 'vps',
  storage_key       text,
  status            text NOT NULL DEFAULT 'recording',
  expires_at        timestamptz,
  deleted_at        timestamptz,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_recordings_source_chk CHECK (source IN ('cowork', 'meet')),
  CONSTRAINT meeting_recordings_status_chk
    CHECK (status IN ('recording', 'processing', 'ready', 'failed', 'deleted'))
);

CREATE INDEX IF NOT EXISTS meeting_recordings_started_by_idx
  ON public.meeting_recordings (started_by, started_at DESC)
  WHERE deleted_at IS NULL;

-- Índice para el barrido de vencidas: solo las candidatas reales.
CREATE INDEX IF NOT EXISTS meeting_recordings_expiry_idx
  ON public.meeting_recordings (expires_at)
  WHERE deleted_at IS NULL;

-- A quiénes se les compartió, elegido por quien graba al detener.
CREATE TABLE IF NOT EXISTS public.meeting_recording_recipients (
  recording_id uuid NOT NULL REFERENCES public.meeting_recordings(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notified_at  timestamptz,
  PRIMARY KEY (recording_id, user_id)
);

-- El plazo se fija al crear la fila, no al consultarla: así cambiar el
-- default más adelante no altera el vencimiento de lo ya grabado.
CREATE OR REPLACE FUNCTION public.set_recording_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := COALESCE(NEW.started_at, now()) + interval '90 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recording_expiry ON public.meeting_recordings;
CREATE TRIGGER trg_recording_expiry
  BEFORE INSERT ON public.meeting_recordings
  FOR EACH ROW EXECUTE FUNCTION public.set_recording_expiry();

-- El ::text NO es cosmético: hay dos sobrecargas de has_role (app_role
-- legacy y text, la tier-aware de #938). Sin castear, Postgres rechaza
-- la llamada por ambigua. La de text es la que reconoce roles custom.
ALTER TABLE public.meeting_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_recording_recipients ENABLE ROW LEVEL SECURITY;

-- Ves una grabación si la iniciaste o si te la compartieron. Los admin ven
-- todas (has_role ya es tier-aware, ver memoria roles_permission_system).
CREATE POLICY meeting_recordings_select
  ON public.meeting_recordings
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      started_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.meeting_recording_recipients r
        WHERE r.recording_id = meeting_recordings.id AND r.user_id = auth.uid()
      )
      OR public.has_role(auth.uid(), 'admin'::text)
    )
  );

-- Pedir el borrado anticipado: solo quien grabó, o un admin.
CREATE POLICY meeting_recordings_update
  ON public.meeting_recordings
  FOR UPDATE TO authenticated
  USING (started_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::text))
  WITH CHECK (started_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::text));

CREATE POLICY meeting_recording_recipients_select
  ON public.meeting_recording_recipients
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meeting_recordings m
      WHERE m.id = recording_id AND m.started_by = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::text)
  );

-- Total usado, para mostrarlo ARRIBA de la lista. Que el espacio sea
-- visible es la mitad del arreglo.
CREATE OR REPLACE VIEW public.v_recordings_usage
WITH (security_invoker = true) AS
SELECT
  count(*)                                        AS total_recordings,
  COALESCE(sum(size_bytes), 0)                    AS total_bytes,
  count(*) FILTER (WHERE expires_at < now() + interval '7 days')
                                                  AS expiring_next_week,
  min(expires_at)                                 AS next_expiry
FROM public.meeting_recordings
WHERE deleted_at IS NULL;

GRANT SELECT ON public.v_recordings_usage TO authenticated;

-- Marca las vencidas para que el worker borre el archivo del
-- almacenamiento. NO las marca `deleted` acá: primero hay que borrar el
-- archivo, si no quedan huérfanos pagando espacio para siempre.
CREATE OR REPLACE FUNCTION public.expire_meeting_recordings()
RETURNS TABLE (id uuid, storage_key text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.storage_key
  FROM public.meeting_recordings r
  WHERE r.deleted_at IS NULL
    AND r.expires_at IS NOT NULL
    AND r.expires_at < now()
    AND r.status = 'ready'
  ORDER BY r.expires_at
  LIMIT 200;
$$;

COMMENT ON FUNCTION public.expire_meeting_recordings() IS
  'Candidatas a borrar. El worker borra el archivo del storage y RECIÉN ahí marca deleted_at. Al revés quedan archivos huérfanos ocupando espacio pago.';

COMMENT ON TABLE public.meeting_recordings IS
  'Grabaciones de Cowork/Meet. Vencen a los 90 días SIN EXCEPCIÓN — por eso el archivo puede vivir en el disco del VPS (espacio acotado). Si se agrega alguna excepción, hay que mover el almacenamiento afuera.';

-- Cron a agendar después de desplegar el worker:
-- SELECT cron.schedule('expire-meeting-recordings-daily', '30 6 * * *',
--   $$SELECT net.http_post(
--       url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/recordings-worker',
--       headers := '{"Content-Type":"application/json","X-Cron-Token":"..."}'::jsonb,
--       body := '{"action":"expire"}'::jsonb
--     );$$);
