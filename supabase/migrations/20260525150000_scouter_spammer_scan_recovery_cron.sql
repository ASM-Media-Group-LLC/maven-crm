-- Auto-recovery para scouter_spammer_accounts.scan_status stuck.
--
-- Contexto del bug: la edge function scouter-spam-account-scan a veces
-- queda colgada (Apify timeout, IG block, cold start largo, etc.) y
-- nunca llega al UPDATE final que pasa scan_status de 'scanning' a
-- 'done' / 'failed' / 'awaiting_screenshot'. Resultado: la row queda
-- con scan_status='scanning' y last_scanned_at=NULL para siempre,
-- mostrando un spinner eterno en la UI.
--
-- Reproducción: el 2026-05-25 7 cuentas creadas vía AddSpammerAccountDialog
-- desde Maven > LeadGen > Mis Cuentas IG quedaron en scanning sin
-- last_scanned_at, aún cuando la edge function devolvió 200 ok. La
-- causa más probable es timeout o excepción no manejada después de
-- la línea 199 (marca scanning) y antes del UPDATE final (línea 338).
--
-- Recovery: cron que cada 5 min marca como 'failed' las rows que:
--   · scan_status IN ('scanning','pending')
--   · created_at < now() - 5 min  (no agarra una scaneando ahora mismo)
--   · last_scanned_at IS NULL OR last_scanned_at < now() - 5 min
--
-- El mensaje de error le da contexto al user + el botón "Re-scan"
-- queda habilitado para reintentar manualmente.
--
-- TODO (otra sesión): fix de la edge function para no dejar paths
-- silenciosos — falla loud y marca failed en cualquier branch.

CREATE OR REPLACE FUNCTION public.recover_stuck_spammer_scans()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.scouter_spammer_accounts
  SET scan_status = 'failed',
      scan_error = 'Scan se quedó colgado más de 5 minutos. Hacé click en "Re-scan" para reintentar — si vuelve a fallar varias veces, subí un screenshot manual.',
      last_scanned_at = now()
  WHERE scan_status IN ('scanning','pending')
    AND created_at < now() - interval '5 minutes'
    AND (last_scanned_at IS NULL OR last_scanned_at < now() - interval '5 minutes');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_stuck_spammer_scans() FROM PUBLIC;

-- Schedule cada 5 min vía pg_cron. Idempotente: unschedule el job
-- existente si lo hay antes de re-schedularlo.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'scouter-spammer-scan-recovery';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
  PERFORM cron.schedule(
    'scouter-spammer-scan-recovery',
    '*/5 * * * *',
    'SELECT public.recover_stuck_spammer_scans();'
  );
END $$;

COMMENT ON FUNCTION public.recover_stuck_spammer_scans() IS
  'Marca como failed las rows de scouter_spammer_accounts que llevan más de 5 min en scanning/pending sin completar. Corre via pg_cron cada 5 min.';
