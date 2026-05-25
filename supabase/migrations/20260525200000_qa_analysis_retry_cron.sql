-- Cron de retry para QAs que se quedan sin análisis (claude_analysis vacío).
--
-- Bug original detectado el 2026-05-22: QA 272160d9 quedó con
-- claude_analysis='{}' aunque tenía transcript de 48k chars. El frontend
-- inserta la fila con analysis vacío, después invoca qa-analyze edge
-- function. Si esa invocación falla (timeout, error de red, Anthropic
-- API down) el row queda con analysis vacío para siempre.
--
-- Fix: cron cada 10 min busca qa_calls con:
--   · claude_analysis = '{}'::jsonb (vacío, no analizado)
--   · transcript IS NOT NULL (ya hay texto para analizar)
--   · created_at entre 10 min y 24 horas atrás (no agarrar las en curso
--     ni las muy viejas que probable son problemáticas crónicas)
--
-- Para cada uno, invoca qa-analyze via pg_net.http_post con x-cron-token.
-- La edge function qa-analyze fue actualizada en paralelo para aceptar
-- ese header (antes solo aceptaba JWT del frontend).

CREATE OR REPLACE FUNCTION public.retry_stuck_qa_analyses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call RECORD;
  v_count integer := 0;
  v_url text;
  v_token text;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets WHERE name = 'cron_internal_token';

  IF v_url IS NULL OR v_token IS NULL THEN
    RAISE WARNING 'retry_stuck_qa_analyses: faltan secrets project_url o cron_internal_token en vault';
    RETURN 0;
  END IF;

  FOR v_call IN
    SELECT id
    FROM public.qa_calls
    WHERE claude_analysis = '{}'::jsonb
      AND transcript IS NOT NULL
      AND length(transcript) > 100
      AND created_at < now() - interval '10 minutes'
      AND created_at > now() - interval '24 hours'
    ORDER BY created_at DESC
    LIMIT 10
  LOOP
    PERFORM net.http_post(
      url := v_url || '/functions/v1/qa-analyze',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-token', v_token
      ),
      body := jsonb_build_object('call_id', v_call.id)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_stuck_qa_analyses() FROM PUBLIC;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'qa-analysis-retry';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
  PERFORM cron.schedule(
    'qa-analysis-retry',
    '*/10 * * * *',
    'SELECT public.retry_stuck_qa_analyses();'
  );
END $$;

COMMENT ON FUNCTION public.retry_stuck_qa_analyses() IS
  'Cada 10 min busca qa_calls con claude_analysis vacío + transcript presente, y dispara la edge function qa-analyze para retry. Cap de 10 por corrida.';
