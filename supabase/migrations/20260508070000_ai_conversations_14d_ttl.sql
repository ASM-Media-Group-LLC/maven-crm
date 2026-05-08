-- ─── TTL de 14 días para ai_conversations ────────────────────────────
--
-- Clari (y los otros asistentes) persisten conversaciones en
-- `ai_conversations` + `ai_messages` para que el user pueda releer
-- charlas previas. NO se usa el historial para alargar el prompt —
-- es solo storage. Para no acumular forever, cron diario borra
-- conversations con `updated_at` de más de 14 días. Las messages
-- caen por CASCADE.

CREATE OR REPLACE FUNCTION public.purge_old_ai_conversations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.ai_conversations
  WHERE updated_at < NOW() - INTERVAL '14 days';
END;
$$;

-- Schedule daily 04:00 UTC (~01:00 LATAM, baja carga).
-- Idempotente: si ya existe, lo reemplazamos.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  -- Si pg_cron no está disponible (e.g. local), saltamos sin error.
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    RAISE NOTICE 'pg_cron no instalada — saltando schedule de purge';
    RETURN;
  END IF;

  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'purge_old_ai_conversations';

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  PERFORM cron.schedule(
    'purge_old_ai_conversations',
    '0 4 * * *',
    $cron$SELECT public.purge_old_ai_conversations();$cron$
  );
END;
$$;
