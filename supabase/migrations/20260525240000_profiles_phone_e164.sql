-- profiles.phone_e164: número de WhatsApp del usuario, usado para
-- auto-linkear con whatsapp_members cuando llega un mensaje al bot.
--
-- Flujo:
--   1. El user lo carga desde Settings → Mi cuenta (UI self-service).
--   2. whatsapp-ingest.upsertMember llama al RPC `whatsapp_resolve_user_by_phone`
--      con el sender_external_id ("549112345678@s.whatsapp.net") y, si
--      hay match, popula whatsapp_members.user_id automáticamente.
--   3. La tool del agent (get_member_maven_activity) cruza la actividad
--      real con el user_id resuelto.
--
-- Formato esperado: E.164 con `+` adelante (ej. "+5491112345678",
-- "+573225218180"). La validación liviana la hace el frontend con regex;
-- en DB ponemos un CHECK constraint suave que solo exige `+` + dígitos
-- con longitud 8-16. Más estricto sería molesto cuando el user mete
-- espacios/guiones por error y la app los limpia.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_e164 text;

-- CHECK constraint suave. Permitimos NULL (no obligatorio cargarlo).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_phone_e164_format'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_phone_e164_format
      CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[0-9]{8,16}$');
  END IF;
END$$;

-- Unique parcial — un teléfono = un usuario (la suposición razonable
-- para WhatsApp como identificador de identidad). Si dos personas
-- comparten teléfono (edge case), van a tener que decidir cuál de los
-- dos lo registra. La UI muestra el error claro si pasa.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_e164_unique
  ON public.profiles (phone_e164)
  WHERE phone_e164 IS NOT NULL;

COMMENT ON COLUMN public.profiles.phone_e164 IS
  'Número de WhatsApp del user en formato E.164 (ej. +5491112345678). Self-service via Settings → Mi cuenta. Usado por whatsapp-ingest para auto-linkear whatsapp_members.user_id cuando llega un mensaje del grupo.';

-- ---------------------------------------------------------------------------
-- RPC: whatsapp_resolve_user_by_phone(jid_or_phone)
-- ---------------------------------------------------------------------------
-- Resuelve un JID de WhatsApp ("549112345678@s.whatsapp.net") o un número
-- libre ("+54 9 11 1234-5678") al user_id correspondiente en profiles.
--
-- Estrategia: comparar los últimos 10 dígitos. Cubre:
--   - El "9" extra de Argentina móvil (WA lo guarda con 9, pero el user
--     podría meter el número sin él).
--   - Espacios, guiones, paréntesis y otros separadores que el user
--     pueda haber tipeado.
--   - Variantes de país (54, 549, 1, 57, etc) — todas terminan en el
--     mismo número local de 10 dígitos.
--
-- Limitación: para países con números menores a 10 dígitos (poco común
-- en clientes Latam) habría que ajustar el largo. Cuando aparezca el
-- caso, lo iteramos.
--
-- SECURITY DEFINER + search_path explícito para que la función pueda
-- ejecutarse con permisos de owner (puede leer profiles aunque el
-- caller no tenga SELECT). Esto es necesario porque la function la
-- llama el service_role desde whatsapp-ingest, pero queremos que
-- eventualmente también pueda llamarla cualquier user (ej. para un
-- "preview" del link en la UI).
CREATE OR REPLACE FUNCTION public.whatsapp_resolve_user_by_phone(p_jid_or_phone text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text;
  v_last10 text;
  v_user_id uuid;
BEGIN
  IF p_jid_or_phone IS NULL OR length(p_jid_or_phone) = 0 THEN
    RETURN NULL;
  END IF;

  -- Sacar todo lo que no sea dígito (cubre "+", espacios, "@s.whatsapp.net", etc).
  v_digits := regexp_replace(p_jid_or_phone, '\D', '', 'g');

  -- Mínimo 7 dígitos para que no haya falsos positivos contra teléfonos
  -- cortos. Bajo eso es ruido (ej. códigos cortos).
  IF length(v_digits) < 7 THEN
    RETURN NULL;
  END IF;

  v_last10 := right(v_digits, 10);

  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE phone_e164 IS NOT NULL
    AND right(regexp_replace(phone_e164, '\D', '', 'g'), 10) = v_last10
  LIMIT 1;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_resolve_user_by_phone(text)
  TO authenticated, service_role, anon;
