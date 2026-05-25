-- Dos fixes relacionados con el flow de scan de scouter_spammer_accounts:
--
-- 1. CHECK CONSTRAINT bug (root cause de las stuck rows del incidente
--    2026-05-25): el constraint scan_status_check NO incluía
--    'awaiting_screenshot' aunque la edge function ya lo usaba (línea
--    274 de scouter-spam-account-scan/index.ts). Resultado: cada vez
--    que la edge function intentaba marcar una restringida, Postgres
--    rechazaba el UPDATE con constraint violation. El error era
--    SILENTE porque el .update() no chequeaba .error. La row quedaba
--    en 'scanning' (de la línea 199) para siempre y la edge function
--    devolvía 200 ok como si todo bien.
--
--    Fix: agregar 'awaiting_screenshot' al CHECK constraint.
--
-- 2. Cron de recovery (instalado en migration anterior) marcaba todo
--    como 'failed'. Pero la mayoría de las stuck son restringidas que
--    ScrapeCreators no puede ver (no usa cuenta logueada) — esas
--    deberían ir a 'awaiting_screenshot' para que el user suba
--    capturas y Claude vision las analice.
--
--    Fix: la función ahora distingue:
--    · Stuck con TODOS los campos null → restringida → awaiting_screenshot
--    · Stuck con algún dato → error técnico real → failed

ALTER TABLE public.scouter_spammer_accounts
  DROP CONSTRAINT IF EXISTS scouter_spammer_accounts_scan_status_check;

ALTER TABLE public.scouter_spammer_accounts
  ADD CONSTRAINT scouter_spammer_accounts_scan_status_check
  CHECK (scan_status = ANY (ARRAY['pending','scanning','done','failed','awaiting_screenshot']));

CREATE OR REPLACE FUNCTION public.recover_stuck_spammer_scans()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restricted_count integer;
  v_failed_count integer;
BEGIN
  -- Stuck con TODOS los campos null → ScrapeCreators no pudo ver la
  -- cuenta (probablemente restringida). Ir a awaiting_screenshot para
  -- que el user suba capturas y Claude vision las procese.
  UPDATE public.scouter_spammer_accounts
  SET scan_status = 'awaiting_screenshot',
      is_restricted = true,
      scan_error = NULL,
      last_scanned_at = now()
  WHERE scan_status IN ('scanning','pending')
    AND created_at < now() - interval '5 minutes'
    AND (last_scanned_at IS NULL OR last_scanned_at < now() - interval '5 minutes')
    AND bio IS NULL
    AND followers_count IS NULL
    AND posts_count IS NULL
    AND profile_pic_url IS NULL;
  GET DIAGNOSTICS v_restricted_count = ROW_COUNT;

  -- Stuck con algún dato → error técnico real (timeout, excepción, etc).
  -- Marcar como failed con mensaje para que el user re-dispare.
  UPDATE public.scouter_spammer_accounts
  SET scan_status = 'failed',
      scan_error = 'Scan se quedó colgado más de 5 minutos. Hacé click en "Re-scan" para reintentar.',
      last_scanned_at = now()
  WHERE scan_status IN ('scanning','pending')
    AND created_at < now() - interval '5 minutes'
    AND (last_scanned_at IS NULL OR last_scanned_at < now() - interval '5 minutes');
  GET DIAGNOSTICS v_failed_count = ROW_COUNT;

  RETURN v_restricted_count + v_failed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_stuck_spammer_scans() FROM PUBLIC;

COMMENT ON FUNCTION public.recover_stuck_spammer_scans() IS
  'Cleanup de rows con scan_status stuck. Si todos los campos están vacíos -> asume restricted -> awaiting_screenshot. Si tiene algún dato -> failed. Corre cada 5 min via pg_cron.';
