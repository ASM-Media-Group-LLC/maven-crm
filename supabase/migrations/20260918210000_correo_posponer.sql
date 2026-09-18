-- CORREO · posponer.
--
-- El último de los tres botones grises ("Posponer", "Mover a", "Etiquetar"):
-- estaba dibujado y marcado "pronto", se veía, se tocaba y no hacía nada.
--
-- La carpeta `Snoozed` YA existe en los 65 buzones y está vacía: alguien la
-- dejó preparada. Posponer = moverla ahí, y que algo la traiga de vuelta.
--
-- ⚠️ SE GUARDA EL message_id, NO EL uid — Y ACÁ NO ES UNA PREFERENCIA
--
-- En las etiquetas el uid era mala idea. Acá es IMPOSIBLE: posponer MUEVE el
-- correo a otra carpeta, y mover en IMAP le asigna un uid nuevo. El uid con el
-- que se pospuso no existe más en el momento exacto en que hay que devolverlo.
--
-- Por eso el despertador busca en `Snoozed` por `HEADER Message-ID` y recién
-- entonces sabe qué uid mover de vuelta.
--
-- ⚠️ Y SE GUARDA DE DÓNDE SALIÓ
--
-- Volver "a INBOX" siempre sería mentir: alguien pospone desde Notificaciones
-- o desde una carpeta propia y el correo le reaparecería en otro lado, como si
-- se hubiera movido solo.

CREATE TABLE IF NOT EXISTS public.mail_snoozed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- El Message-ID (RFC 5322) con sus `<>`, tal como llega.
  message_id text NOT NULL,
  /** La carpeta de la que salió: ahí vuelve. */
  folder_origen text NOT NULL,
  /** Cuándo tiene que reaparecer. */
  volver_at timestamptz NOT NULL,
  /** Cuándo volvió de verdad. NULL = todavía está dormido. */
  devuelto_at timestamptz,
  /** Por qué no se pudo devolver, si falló. Se deja escrito en vez de
   *  reintentar para siempre en silencio. */
  ultimo_error text,
  intentos int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Un correo no puede estar pospuesto dos veces a la vez. Al volver se marca
  -- `devuelto_at` y entonces sí se puede posponer de nuevo.
  UNIQUE (user_id, message_id, devuelto_at)
);

-- La consulta del despertador: "qué venció y sigue dormido".
CREATE INDEX IF NOT EXISTS mail_snoozed_pendientes_idx
  ON public.mail_snoozed (volver_at)
  WHERE devuelto_at IS NULL;

ALTER TABLE public.mail_snoozed ENABLE ROW LEVEL SECURITY;

-- Cada quien, lo suyo. El despertador corre con service_role y no pasa por acá.
CREATE POLICY "Mis correos pospuestos"
  ON public.mail_snoozed FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.mail_snoozed IS
  'Correos pospuestos. Se identifican por message_id porque posponer MUEVE el correo y el uid cambia.';
COMMENT ON COLUMN public.mail_snoozed.folder_origen IS
  'De donde salio: ahi vuelve. Devolver siempre a INBOX le reaparecería en otro lado a quien pospuso desde una carpeta propia.';
