-- Auto-end de sesiones de chatter cuando el tiempo expira.
--
-- El timer arranca cuando el chatter manda su primer mensaje
-- (chatter-public edge function ya setea started_at + status='active').
-- Cuando now() >= started_at + duration_minutes minutos, la sesión debe
-- pasar a 'ended' automáticamente — salvo que el examinador haya
-- extendido el tiempo (useExtendChatterSession bumpea duration_minutes).
--
-- Defensa en 3 capas:
--   1. pg_cron job cada minuto (este archivo) — fail-safe
--   2. Edge function chatter-public chequea pre-INSERT de mensaje
--   3. Clients hacen UPDATE on-detect cuando ven remainingMs <= 0
-- Las 3 son idempotentes (UPDATE WHERE status='active').

-- Función que cierra todas las sesiones expiradas.
CREATE OR REPLACE FUNCTION public.end_expired_chatter_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.chatter_sessions
  SET status = 'ended', ended_at = now()
  WHERE status = 'active'
    AND started_at IS NOT NULL
    AND now() >= started_at + (duration_minutes::text || ' minutes')::interval;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_expired_chatter_sessions() TO authenticated, anon;

-- Programar el cron cada 1 minuto. Idempotente: unschedule primero si existe.
DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'chatter-sessions-auto-end';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
  PERFORM cron.schedule(
    'chatter-sessions-auto-end',
    '* * * * *',
    'SELECT public.end_expired_chatter_sessions();'
  );
END $$;
