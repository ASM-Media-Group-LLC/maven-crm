-- Correo · mencionar a alguien con @ para sumarlo al hilo.
--
-- Como en Gmail: se escribe "@" en el cuerpo, se elige a un compañero, y queda
-- agregado a los destinatarios además de recibir un aviso dentro de Maven.
--
-- El problema a resolver acá abajo es que **`profiles` no tiene el correo**: vive
-- en `auth.users`, que el navegador no puede leer. La dirección de trabajo de
-- cada persona sí está en `mail_credentials.email_address`, pero esa tabla
-- guarda las credenciales cifradas de la casilla, así que su RLS es —y tiene que
-- seguir siendo— solo-la-propia.
--
-- La vista expone ÚNICAMENTE lo que hace falta para el autocompletado: quién es,
-- cómo se llama, su muñequito y su dirección de Maven. Nada de `secret_cipher`,
-- `secret_nonce` ni `key_version`.

CREATE OR REPLACE VIEW public.v_directorio_correo
WITH (security_invoker = false) AS
  SELECT
    p.id            AS user_id,
    p.full_name     AS nombre,
    p.avatar_seed   AS avatar_seed,
    p.avatar_url    AS avatar_url,
    mc.email_address
  FROM public.mail_credentials mc
  JOIN public.profiles p ON p.id = mc.user_id
  -- Solo gente que puede recibir de verdad: casilla viva y persona no dada de baja.
  WHERE mc.revoked_at IS NULL
    AND p.deleted_at IS NULL;

COMMENT ON VIEW public.v_directorio_correo IS
  'Directorio para el autocompletado de @ en el Correo: quién tiene casilla activa en Maven y con qué dirección. Deliberadamente NO expone nada de las credenciales.';

-- `security_invoker = false` a propósito: la vista corre con los permisos de su
-- dueño para poder leer `mail_credentials`, que está cerrada. Lo que se publica
-- es solo el SELECT de arriba, y el acceso se controla acá abajo.
REVOKE ALL ON public.v_directorio_correo FROM anon;
GRANT SELECT ON public.v_directorio_correo TO authenticated;

-- ⚠️ Son direcciones de trabajo de compañeros, visibles para cualquiera con
-- sesión en Maven. Es el mismo criterio que tiene hoy cualquier lista de
-- personas del CRM, y quien no tiene el módulo Correo no tiene dónde usarlas.
-- Si algún día eso deja de alcanzar, el candado va acá, no en el frontend.
