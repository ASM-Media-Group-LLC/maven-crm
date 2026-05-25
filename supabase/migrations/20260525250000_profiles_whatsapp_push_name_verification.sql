-- profiles.whatsapp_push_name: el "nombre" que aparece arriba de los
-- mensajes del user en WhatsApp (pushName). Es la única pieza estable
-- que llega tanto en DMs (con teléfono real) como en mensajes de grupo
-- (con LID anónimo) — y por eso es lo que nos sirve para conectar las
-- dos identidades.
--
-- Flujo:
--   1. User carga phone_e164 en Settings → trigger dispara DM via
--      whatsapp-send-verification-dm.
--   2. Bot manda "Hola {full_name}, ¿este es tu WhatsApp? Respondé SI".
--   3. User responde SI en privado al bot. whatsapp-ingest detecta
--      el DM (no es grupo), busca profile por phone, guarda pushName
--      del DM en profiles.whatsapp_push_name y setea verified_at.
--   4. Cuando ese mismo user escriba en cualquier grupo, upsertMember
--      busca profile por pushName y setea user_id en el wpp_member.
--      Auto-link funcionando.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_push_name text,
  ADD COLUMN IF NOT EXISTS whatsapp_verified_at timestamptz;

-- Index para el lookup por pushName desde upsertMember. Case-insensitive
-- para que "Sofi" y "sofi" matcheen (pushNames con casing inconsistente
-- son comunes). El UNIQUE no podemos ponerlo — dos personas pueden tener
-- el mismo pushName, lo manejamos en código.
CREATE INDEX IF NOT EXISTS profiles_whatsapp_push_name_idx
  ON public.profiles (lower(whatsapp_push_name))
  WHERE whatsapp_push_name IS NOT NULL;

COMMENT ON COLUMN public.profiles.whatsapp_push_name IS
  'Nombre que aparece en WhatsApp del user (pushName), capturado cuando el bot recibe la confirmación SI por DM. Usado por whatsapp-ingest para auto-linkear wpp_members en grupos (donde el participant viene como @lid anónimo).';

COMMENT ON COLUMN public.profiles.whatsapp_verified_at IS
  'Timestamp de cuando el user confirmó por DM (SI) que el phone_e164 es suyo. NULL = todavía no verificó.';

-- ---------------------------------------------------------------------------
-- RPC: match por pushName (usado por whatsapp-ingest.upsertMember)
-- ---------------------------------------------------------------------------
-- Devuelve el user_id de profiles cuyo whatsapp_push_name matchea (case
-- insensitive) el pushName del mensaje. Si hay múltiples matches (dos
-- personas con el mismo pushName), devuelve NULL — el admin va a tener
-- que mapear esos manualmente desde el panel.
CREATE OR REPLACE FUNCTION public.whatsapp_resolve_user_by_push_name(p_push_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_user_id uuid;
BEGIN
  IF p_push_name IS NULL OR length(trim(p_push_name)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*), MAX(id)
  INTO v_count, v_user_id
  FROM public.profiles
  WHERE lower(whatsapp_push_name) = lower(trim(p_push_name))
    AND whatsapp_verified_at IS NOT NULL;

  -- Solo devolvemos el match si es único. Si hay 0 o >1, devolvemos
  -- NULL — el admin va a tener que mapear manual.
  IF v_count = 1 THEN
    RETURN v_user_id;
  END IF;
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_resolve_user_by_push_name(text)
  TO authenticated, service_role, anon;
