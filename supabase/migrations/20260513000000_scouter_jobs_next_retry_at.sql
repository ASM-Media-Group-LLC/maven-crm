-- scouter_jobs.next_retry_at: timestamp mínimo desde el cual el worker
-- puede re-pickear este job. NULL = pickeable inmediatamente.
--
-- Resuelve el loop de "provider-paused" donde el worker re-pickeaba el
-- mismo job cada 15s (polling interval), generando 2 UPDATEs por ciclo
-- y un disk IO storm. pg_stat_statements confirmó ~265k markRunning +
-- ~260k reschedule (= 525k updates) en una semana sobre 3k rows.
--
-- Con el backoff:
--   · rescheduleNoAttempt (provider-paused) → next_retry_at = NOW + 30 min
--   · markFailed not exhausted (retry normal) → backoff exponencial
--     2^attempts min (cap 30 min)
--   · fetchQueuedJobs respeta el filter:
--       WHERE status='queued' AND (next_retry_at IS NULL OR next_retry_at <= NOW())

ALTER TABLE public.scouter_jobs
  ADD COLUMN next_retry_at timestamptz;

COMMENT ON COLUMN public.scouter_jobs.next_retry_at IS
  'Timestamp mínimo desde el cual el worker puede re-pickear este job. NULL = pickeable inmediatamente. Seteado por backoff cuando un job falla o el provider está pausado.';
