-- Conexiones de correo por usuario (salida de Google Workspace → Zoho).
--
-- POR QUÉ ESTA TABLA EXISTE: el token de admin de la organización de Zoho
-- sirve para crear y administrar casillas, pero NO para leer el correo de
-- la gente — los mensajes se acceden en nombre de cada usuario. Así que
-- cada persona autoriza a Maven una vez (OAuth) y acá guardamos su
-- refresh token.
--
-- DECISIÓN DE SEGURIDAD: se descartó el camino alternativo (IMAP con las
-- contraseñas de todos guardadas en Maven) porque convertía a Maven en una
-- bóveda con el correo de la empresa entera, sin poder revocar nada de
-- forma individual. Con OAuth cada permiso es revocable y acotado.

CREATE TABLE IF NOT EXISTS public.mail_connections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider       text NOT NULL DEFAULT 'zoho',
  email_address  text NOT NULL,
  -- accountId de Zoho: hace falta para TODAS las llamadas de mensajes
  -- (`/api/accounts/{accountId}/messages`). Se resuelve al conectar.
  zoho_account_id text,
  -- ⚠️ NUNCA debe llegar al cliente. Ver el REVOKE más abajo: el acceso
  -- es exclusivamente por service_role desde edge functions.
  refresh_token  text NOT NULL,
  scopes         text,
  connected_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at   timestamptz,
  last_error     text,
  revoked_at     timestamptz,
  CONSTRAINT mail_connections_provider_chk CHECK (provider IN ('zoho')),
  CONSTRAINT mail_connections_uniq UNIQUE (user_id, provider, email_address)
);

CREATE INDEX IF NOT EXISTS mail_connections_user_idx
  ON public.mail_connections (user_id)
  WHERE revoked_at IS NULL;

-- La protección del token es de DOS capas independientes:
--   1. RLS: cada usuario solo alcanza su propia fila (policy más abajo).
--   2. GRANT por columna: `refresh_token` queda FUERA del grant, así que
--      ni siquiera el dueño de la fila lo puede leer desde el navegador.
-- Solo service_role (edge functions) ve el token, porque bypassa ambas.
ALTER TABLE public.mail_connections ENABLE ROW LEVEL SECURITY;

-- Arrancamos de cero y después damos solo lo necesario, en vez de asumir
-- qué privilegios trae la tabla por defecto.
REVOKE ALL ON public.mail_connections FROM anon, authenticated;

-- El frontend necesita saber UNA cosa: si el usuario está conectado y con
-- qué dirección. Eso va por esta vista, que no expone el token.
-- security_invoker para que la vista respete el usuario que consulta.
CREATE OR REPLACE VIEW public.v_my_mail_connection
WITH (security_invoker = true) AS
SELECT
  mc.id,
  mc.provider,
  mc.email_address,
  mc.connected_at,
  mc.last_used_at,
  mc.revoked_at,
  (mc.revoked_at IS NULL) AS is_active,
  (mc.last_error IS NOT NULL) AS has_error
FROM public.mail_connections mc
WHERE mc.user_id = auth.uid();

-- La vista es security_invoker y la tabla tiene RLS deny + REVOKE, así que
-- por sí sola no devolvería nada. Le damos SELECT explícito sobre la vista
-- y, para que resuelva, un GRANT acotado A LAS COLUMNAS no sensibles.
GRANT SELECT (
  id, user_id, provider, email_address,
  connected_at, last_used_at, last_error, revoked_at
) ON public.mail_connections TO authenticated;

-- Y la policy que deja ver SOLO la fila propia (nunca refresh_token,
-- porque esa columna quedó fuera del GRANT de arriba).
CREATE POLICY mail_connections_own_row_select
  ON public.mail_connections
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.v_my_mail_connection TO authenticated;

COMMENT ON TABLE public.mail_connections IS
  'OAuth por usuario contra Zoho Mail. refresh_token NO está en el GRANT de authenticated: solo service_role lo lee. El frontend usa v_my_mail_connection.';
COMMENT ON COLUMN public.mail_connections.refresh_token IS
  'Secreto. Fuera del GRANT de authenticated a propósito — no agregarlo.';
