-- Códigos de verificación para vincular WhatsApp con usuarios de Maven.
--
-- Por qué existe esta tabla: WhatsApp moderno (Baileys reciente) anonimiza
-- los identificadores de los participantes en grupos Y en DMs con @lid.
-- El remoteJid de un DM al bot YA NO es "<phone>@s.whatsapp.net" — viene
-- como "<digits>@lid", igual que un participante de grupo. Eso significa
-- que cuando recibimos un DM, NO podemos identificar al user por su
-- teléfono real (no está en el payload).
--
-- Solución: cuando enviamos el DM de verificación a un user, generamos
-- un código único corto (ej. "MAVEN-A4F2") y le pedimos que lo responda.
-- Cuando el DM responde con ese código, lo buscamos en esta tabla y
-- sabemos a qué user_id corresponde. De yapa, capturamos su LID y lo
-- guardamos en profiles para que próximos matches sean directos.

CREATE TABLE IF NOT EXISTS public.whatsapp_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  phone_e164 text NOT NULL,  -- snapshot del phone cuando se generó
  -- expires_at: por seguridad, los códigos caducan en 24h. Si el user no
  -- responde a tiempo, tiene que pedir un re-envío.
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Lookup rápido por código (case-insensitive). Unique parcial sobre
-- códigos activos para que no haya colisiones (regeneramos hasta que
-- sea único).
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_verification_codes_code_unique
  ON public.whatsapp_verification_codes (upper(code))
  WHERE used_at IS NULL AND expires_at > now();

CREATE INDEX IF NOT EXISTS whatsapp_verification_codes_user_idx
  ON public.whatsapp_verification_codes (user_id);

-- RLS: el user solo ve sus propios códigos, service_role todo.
ALTER TABLE public.whatsapp_verification_codes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.whatsapp_verification_codes'::regclass
      AND polname = 'whatsapp_verification_codes_self_select'
  ) THEN
    CREATE POLICY whatsapp_verification_codes_self_select
      ON public.whatsapp_verification_codes
      FOR SELECT USING (user_id = auth.uid());
  END IF;
END$$;

-- profiles.whatsapp_lid: el @lid del user, capturado cuando responde
-- con un código válido. Es estable per-user (mismo lid en DMs y grupos),
-- así que sirve para auto-link directo en próximos mensajes.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_lid text;

CREATE INDEX IF NOT EXISTS profiles_whatsapp_lid_idx
  ON public.profiles (whatsapp_lid)
  WHERE whatsapp_lid IS NOT NULL;

COMMENT ON COLUMN public.profiles.whatsapp_lid IS
  'LID anónimo del user en WhatsApp (formato "<digits>@lid"). Estable per-usuario, llega tanto en DMs como en mensajes de grupo. Capturado cuando el user responde con un código de verificación válido. Usado por upsertMember en grupos para auto-link.';

-- ---------------------------------------------------------------------------
-- RPC: claim_whatsapp_verification_code
-- ---------------------------------------------------------------------------
-- Toma un código (case insensitive) + el LID + pushName del DM, valida que
-- el código exista, no esté usado y no haya expirado, lo marca usado, y
-- actualiza el profile con whatsapp_lid + whatsapp_push_name + verified_at.
-- Devuelve el user_id si todo OK, NULL si el código no es válido.
--
-- SECURITY DEFINER porque la llama whatsapp-ingest con service_role pero
-- queremos que también pueda invocarse desde JWT en el futuro.
CREATE OR REPLACE FUNCTION public.claim_whatsapp_verification_code(
  p_code text,
  p_lid text,
  p_push_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_code_id uuid;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT id, user_id INTO v_code_id, v_user_id
  FROM public.whatsapp_verification_codes
  WHERE upper(code) = upper(trim(p_code))
    AND used_at IS NULL
    AND expires_at > now()
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Marcar el código usado.
  UPDATE public.whatsapp_verification_codes
  SET used_at = now()
  WHERE id = v_code_id;

  -- Actualizar el profile con lid + pushName + verified_at.
  UPDATE public.profiles
  SET
    whatsapp_lid = p_lid,
    whatsapp_push_name = p_push_name,
    whatsapp_verified_at = now()
  WHERE id = v_user_id;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_whatsapp_verification_code(text, text, text)
  TO authenticated, service_role, anon;

-- Actualizar el RPC de resolve para que también matchee por LID (más
-- confiable que pushName).
CREATE OR REPLACE FUNCTION public.whatsapp_resolve_user_by_lid(p_lid text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_lid IS NULL OR length(trim(p_lid)) = 0 THEN
    RETURN NULL;
  END IF;
  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE whatsapp_lid = trim(p_lid)
  LIMIT 1;
  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_resolve_user_by_lid(text)
  TO authenticated, service_role, anon;
