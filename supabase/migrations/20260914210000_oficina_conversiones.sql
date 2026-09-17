-- Oficina · Fase 3: el tope de conversiones simultáneas.
--
-- Convertir un .docx a PDF lo hace LibreOffice dentro de Gotenberg, y es lo
-- ÚNICO caro en CPU de todo el proyecto. Comparte máquina con `whisper`, que ya
-- salta a 4 de los 8 núcleos transcribiendo audios del bot de WhatsApp — o sea,
-- algo que alguien está esperando del otro lado.
--
-- Sin tope, alguien abriendo treinta hojas de vida de un correo dispara treinta
-- conversiones a la vez y el bot se pone lento. Nadie relacionaría una cosa con
-- la otra.
--
-- ⚠️ POR QUÉ UNA TABLA Y NO `pg_advisory_lock`: los bloqueos de sesión no
-- sirven acá porque las edge functions usan conexiones de un pool y nadie
-- garantiza que la que tomó el bloqueo sea la que lo suelte. Los de transacción
-- (`pg_try_advisory_xact_lock`) se sueltan al terminar la transacción del RPC,
-- que dura milisegundos — mucho antes de que la conversión arranque siquiera.
-- Una fila con marca de tiempo sí sobrevive a la llamada, y se libera sola si
-- el proceso que la tomó se murió.

CREATE TABLE IF NOT EXISTS public.conversion_slots (
  slot       int PRIMARY KEY,
  tomado_at  timestamptz,
  tomado_por text
);

COMMENT ON TABLE public.conversion_slots IS
  'Cupos de conversión a PDF simultáneas. Una fila por cupo; tomado_at NULL = libre. Los cupos vencidos se reciclan solos: si quien lo tomó se murió, nadie lo iba a soltar.';

-- Dos a la vez. Subirlo es una decisión sobre CPU compartido, no una constante
-- que se toque al pasar.
INSERT INTO public.conversion_slots (slot) VALUES (1), (2)
  ON CONFLICT (slot) DO NOTHING;

/** Toma un cupo si hay. Devuelve el número, o NULL si están todos ocupados.
 *
 *  `FOR UPDATE SKIP LOCKED` es lo que hace que dos llamadas simultáneas no se
 *  lleven el mismo cupo: la segunda saltea la fila que la primera está mirando
 *  en vez de esperarla. */
CREATE OR REPLACE FUNCTION public.tomar_cupo_de_conversion(p_quien text DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  elegido int;
BEGIN
  SELECT s.slot INTO elegido
  FROM public.conversion_slots s
  WHERE s.tomado_at IS NULL
     -- Vencido: quien lo tomó ya no está. Una conversión que pasa de dos
     -- minutos es una conversión que falló.
     OR s.tomado_at < now() - interval '2 minutes'
  ORDER BY s.slot
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF elegido IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.conversion_slots
  SET tomado_at = now(), tomado_por = p_quien
  WHERE slot = elegido;

  RETURN elegido;
END;
$$;

CREATE OR REPLACE FUNCTION public.soltar_cupo_de_conversion(p_slot int)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.conversion_slots
  SET tomado_at = NULL, tomado_por = NULL
  WHERE slot = p_slot;
$$;

-- Nadie los toca desde el navegador: los usa la edge con su clave de servicio.
ALTER TABLE public.conversion_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION public.tomar_cupo_de_conversion(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.soltar_cupo_de_conversion(int) FROM anon, authenticated;
