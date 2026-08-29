-- Las grabaciones pasan de 90 a 15 días. Decisión de Jhon (29/08/2026): el
-- disco del VPS es acotado y tres meses de video es más de lo que nadie
-- mira. Quien necesite una más tiempo, que la descargue — que es justo lo
-- que el aviso de la pantalla dice.
--
-- SE APLICA TAMBIÉN A LAS YA GRABADAS, a propósito y en contra de lo que
-- decía el diseño original ("cambiar el default no altera lo ya grabado").
-- El motivo: si no, la pantalla diría "se borra a los 15 días" al lado de
-- una grabación que dice "vence en 89 días". Dos reglas conviviendo es peor
-- que una regla que cambió. Al momento de aplicarlo eran 3 grabaciones y
-- ninguna quedaba vencida (la más próxima pasa del 25/11 al 11/09).
CREATE OR REPLACE FUNCTION public.set_recording_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := COALESCE(NEW.started_at, now()) + interval '15 days';
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.meeting_recordings
SET expires_at = started_at + interval '15 days'
WHERE deleted_at IS NULL;

COMMENT ON TABLE public.meeting_recordings IS
  'Grabaciones de Cowork/Meet. Vencen a los 15 días SIN EXCEPCIÓN (eran 90 hasta el 29/08/2026) — por eso el archivo puede vivir en el disco del VPS (espacio acotado). Si se agrega alguna excepción, hay que mover el almacenamiento afuera.';
