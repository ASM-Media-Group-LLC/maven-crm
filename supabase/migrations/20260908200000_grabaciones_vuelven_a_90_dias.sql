-- Las grabaciones vuelven de 15 a 90 días. Decisión de Jhon (08/09/2026).
--
-- Los 15 días existían por UNA razón, escrita en la migración que los puso:
-- "el disco del VPS es acotado". Ese motivo ya no existe: el egress ahora
-- sube los MP4 a Cloudflare R2 (PR #1713), donde 90 días de retención son
-- ~36 GB ≈ USD 0,40 al mes. Con la restricción levantada no hay por qué
-- tirar material que la gente todavía puede necesitar.
--
-- 90 y no más: Jhon fue explícito en que un año es más de lo que quiere
-- consumir en Cloudflare. Las grabaciones NO se archivan al NAS — se van a
-- los tres meses. El archivado a un año es para los otros datos.
--
-- SE APLICA TAMBIÉN A LAS YA GRABADAS, por el mismo motivo que la vez
-- anterior: la pantalla dice "se borra a los 90 días" y tener al lado una
-- grabación que vence en 6 es peor que una regla que cambió. Acá además es
-- inofensivo, porque solo ALARGA vencimientos: ninguna grabación se pierde
-- antes por este cambio.
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

UPDATE public.meeting_recordings
SET expires_at = started_at + interval '90 days'
WHERE deleted_at IS NULL;

COMMENT ON TABLE public.meeting_recordings IS
  'Grabaciones de Cowork/Meet. Vencen a los 90 días SIN EXCEPCIÓN (fueron 15 entre el 29/08 y el 08/09/2026, mientras el archivo vivía en el disco del VPS). Ahora el MP4 va a Cloudflare R2, que tiene su propia regla de ciclo de vida a 90 días: si se cambia este número hay que cambiar TAMBIÉN la regla del bucket maven-grabaciones, o una de las dos capas borra antes que la otra.';
