-- Más redes sociales por creadora (para el perfil + los chips del popup de Promolog).
--   facebook_handle / reddit_handle: handles; la URL se arma con buildSocialUrl
--     (facebook.com/<h>, reddit.com/user/<h>).
--   other_url: link libre ("Otra") para cualquier red/destino sin campo propio.
-- Sin cambios de RLS: la RLS existente de `creators` ya gobierna estas columnas.
alter table public.creators
  add column if not exists facebook_handle text,
  add column if not exists reddit_handle text,
  add column if not exists other_url text;
