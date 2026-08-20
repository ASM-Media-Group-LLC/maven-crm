-- Credencial de correo por usuario, cifrada.
--
-- POR QUÉ EXISTE, habiendo ya un OAuth funcionando: la pantalla de
-- consentimiento de Zoho lleva su logo y dice "from my Zoho account". Eso
-- rompe el principio del proyecto — el empleado no debe enterarse de que
-- hay un Zoho detrás. Así que la conexión va por IMAP con una credencial
-- que administra Maven, y la persona no hace ni ve nada.
--
-- QUÉ SE GUARDA: la contraseña que Maven generó al crear la casilla. Es una
-- CREDENCIAL DE MÁQUINA — ningún humano la conoce, así que nadie la cambia
-- y la conexión no se rompe sola. Si se rompe, Maven tiene el token de
-- admin de Zoho y puede regenerarla sin intervención.
--
-- CIFRADO: no va en texto plano. Se cifra con AES-GCM usando una clave que
-- vive como secret de edge function (MAIL_CRED_KEY), NO en la base. Así un
-- volcado de la base no alcanza para leer las credenciales — hace falta
-- también el secret, que está en otro sistema.

CREATE TABLE IF NOT EXISTS public.mail_credentials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address  text NOT NULL,
  -- Ciphertext AES-GCM en base64. Sin la clave de MAIL_CRED_KEY no se
  -- puede descifrar, ni siquiera con acceso total a la base.
  secret_cipher  text NOT NULL,
  -- Nonce/IV del cifrado, base64. Único por credencial.
  secret_nonce   text NOT NULL,
  -- Versión de la clave, para poder rotar MAIL_CRED_KEY sin perder acceso
  -- a lo ya cifrado (se descifra con la vieja y se re-cifra con la nueva).
  key_version    smallint NOT NULL DEFAULT 1,
  imap_host      text NOT NULL DEFAULT 'imap.zoho.com',
  imap_port      integer NOT NULL DEFAULT 993,
  smtp_host      text NOT NULL DEFAULT 'smtp.zoho.com',
  smtp_port      integer NOT NULL DEFAULT 465,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_used_at   timestamptz,
  last_error     text,
  revoked_at     timestamptz,
  CONSTRAINT mail_credentials_uniq UNIQUE (user_id, email_address)
);

CREATE INDEX IF NOT EXISTS mail_credentials_user_idx
  ON public.mail_credentials (user_id)
  WHERE revoked_at IS NULL;

-- Dos capas, igual que en mail_connections:
--   1. RLS: cada usuario alcanza solo su fila.
--   2. GRANT por columna: `secret_cipher` y `secret_nonce` quedan FUERA,
--      así ni el dueño los lee desde el navegador.
-- Solo service_role (edge functions) ve el secreto, y encima cifrado.
ALTER TABLE public.mail_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mail_credentials FROM anon, authenticated;

GRANT SELECT (
  id, user_id, email_address, imap_host, imap_port,
  smtp_host, smtp_port, created_at, last_used_at, last_error, revoked_at
) ON public.mail_credentials TO authenticated;

CREATE POLICY mail_credentials_own_row_select
  ON public.mail_credentials
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Lo único que el frontend necesita saber: si mi correo está listo.
CREATE OR REPLACE VIEW public.v_my_mailbox
WITH (security_invoker = true) AS
SELECT
  c.email_address,
  c.created_at,
  c.last_used_at,
  (c.revoked_at IS NULL) AS is_active,
  (c.last_error IS NOT NULL) AS has_error
FROM public.mail_credentials c
WHERE c.user_id = auth.uid() AND c.revoked_at IS NULL;

GRANT SELECT ON public.v_my_mailbox TO authenticated;

COMMENT ON TABLE public.mail_credentials IS
  'Credencial IMAP/SMTP por usuario, cifrada con AES-GCM. La clave vive en el secret MAIL_CRED_KEY, NO en la base: un volcado de la base no alcanza para leerlas. secret_cipher/secret_nonce están fuera del GRANT de authenticated.';
COMMENT ON COLUMN public.mail_credentials.key_version IS
  'Permite rotar MAIL_CRED_KEY: se descifra con la clave vieja y se re-cifra con la nueva, sin perder acceso.';
