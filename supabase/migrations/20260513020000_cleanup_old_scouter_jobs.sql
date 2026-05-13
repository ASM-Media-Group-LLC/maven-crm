-- Cleanup mensual: borra scouter_jobs done/failed con > 30 días.
-- Mantiene la tabla chica → index size chico → vacuum rápido → menos IO.
-- Los jobs "queued" y "running" nunca se tocan.

CREATE OR REPLACE FUNCTION public.cleanup_old_scouter_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM scouter_jobs
  WHERE status IN ('done', 'failed')
    AND COALESCE(completed_at, created_at) < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_scouter_jobs() IS
  'Borra scouter_jobs done/failed con >30 días para mantener la tabla chica. Llamado por cron mensual.';

-- Cron: día 1 de cada mes a las 12:15 UTC (≈ 8:15 AM Miami EDT).
-- Se ejecuta DESPUÉS del cron de leadgen (12:00) para no solaparse.
-- SELECT cron.schedule('cleanup-old-scouter-jobs-monthly', '15 12 1 * *',
--                       $$SELECT public.cleanup_old_scouter_jobs();$$);
