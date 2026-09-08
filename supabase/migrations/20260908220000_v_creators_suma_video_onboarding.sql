-- v_creators no traía las columnas del video: las vistas de Postgres se
-- expanden al crearse, así que un ALTER TABLE sobre `creators` no las agrega.
-- Sin esto el perfil (que lee de la VISTA, no de la tabla) nunca vería el
-- video y la feature fallaría en silencio.
--
-- La definición se extiende PROGRAMÁTICAMENTE en vez de reescribirla a mano:
-- son 126 columnas y las últimas cuatro enmascaran PII (phone, phone_e164,
-- whatsapp_number, email). Transcribir eso a mano es la forma más fácil de
-- filtrar un teléfono por un copiado mal hecho.
--
-- ⚠️ Nada de retro-referencias (\1) en el reemplazo: dentro de una cadena E''
-- eso se convierte en el BYTE 0x01, no en el grupo capturado, y la vista sale
-- con basura. Pasó al primer intento. El final se escribe explícito.
DO $$
DECLARE
  def   text;
  nueva text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'v_creators' AND column_name = 'onboarding_video_key'
  ) THEN
    RAISE NOTICE 'v_creators ya tiene las columnas del video; no se toca';
    RETURN;
  END IF;

  def := pg_get_viewdef('public.v_creators'::regclass, true);

  IF def !~ '\sFROM creators;\s*$' THEN
    RAISE EXCEPTION 'v_creators no termina en "FROM creators;" — revisar a mano antes de tocarla';
  END IF;

  nueva := regexp_replace(
    def,
    '\sFROM creators;\s*$',
    E',\n    onboarding_video_key,\n    onboarding_video_at,\n    onboarding_video_bytes,\n    onboarding_video_by\n   FROM creators;'
  );

  EXECUTE 'CREATE OR REPLACE VIEW public.v_creators AS ' || nueva;
END $$;
