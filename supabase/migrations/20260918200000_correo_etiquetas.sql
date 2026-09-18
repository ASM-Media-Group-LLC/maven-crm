-- CORREO · etiquetas.
--
-- Lo reportó Keila: «el correo de Maven no tiene etiquetas??». El botón
-- "Etiquetar" estaba dibujado y marcado "pronto" — se veía, se tocaba y no
-- hacía nada.
--
-- ⚠️ POR QUÉ LAS ETIQUETAS VIVEN EN MAVEN Y NO EN IMAP
--
-- La otra opción era guardarlas como palabras clave de IMAP (`UID STORE
-- +FLAGS (Trabajo)`), que tiene la ventaja de verse también desde la web de
-- Zoho. Se descartó por dos razones:
--
--   1. Que un servidor acepte palabras clave arbitrarias NO está garantizado:
--      hay que mirar `PERMANENTFLAGS` y que traiga `\*`. Construir encima de
--      una capacidad que no está comprobada es apostar.
--   2. `mail-sync` hoy lee las banderas pero solo mira `\Seen`. Soportarlas
--      pediría además un resincronizado completo para traer las de lo viejo.
--
-- El equipo trabaja adentro de Maven —para eso existe el módulo—, así que la
-- etiqueta es instantánea y no depende de una ida y vuelta a IMAP. El costo,
-- dicho: NO se ven desde la web de Zoho.
--
-- ⚠️ SE ETIQUETA POR `message_id`, NO POR (carpeta, uid).
--
-- El UID de un mensaje CAMBIA cuando se mueve de carpeta, y la fila de la
-- caché se borra y se vuelve a crear en el barrido. Atar la etiqueta al uid
-- significaría perderla la primera vez que alguien archiva el correo — o peor,
-- que la herede un mensaje distinto que reciba ese uid después. El
-- `Message-ID` es el mismo para siempre y en cualquier carpeta.

CREATE TABLE IF NOT EXISTS public.mail_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 40),
  -- Un token del tema de Maven, no un hex suelto: así la etiqueta se ve bien
  -- en claro y en oscuro sin que nadie elija un color ilegible.
  color text NOT NULL DEFAULT 'primary'
    CHECK (color IN ('primary','accent','success','warning','destructive','muted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Dos etiquetas con el mismo nombre en el mismo buzón no se distinguen.
  UNIQUE (user_id, nombre)
);

CREATE TABLE IF NOT EXISTS public.mail_message_labels (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- El Message-ID del correo (RFC 5322), con sus `<>` tal como llega.
  message_id text NOT NULL,
  label_id uuid NOT NULL REFERENCES public.mail_labels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id, label_id)
);

-- "Qué correos tienen esta etiqueta" y "qué etiquetas tiene este correo".
CREATE INDEX IF NOT EXISTS mail_message_labels_label_idx
  ON public.mail_message_labels (user_id, label_id);

-- ── Cada quien ve y toca SOLO lo suyo ──────────────────────────────────────
-- Un buzón es personal: las etiquetas de alguien no son asunto de nadie más.
ALTER TABLE public.mail_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_message_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mis etiquetas de correo"
  ON public.mail_labels FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Las etiquetas de mis correos"
  ON public.mail_message_labels FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.mail_labels IS
  'Etiquetas de correo de cada persona. Viven en Maven, no en IMAP: no se ven desde la web de Zoho.';
COMMENT ON COLUMN public.mail_message_labels.message_id IS
  'Message-ID del correo. NO (carpeta,uid): el uid cambia al mover de carpeta y la etiqueta se perderia.';
