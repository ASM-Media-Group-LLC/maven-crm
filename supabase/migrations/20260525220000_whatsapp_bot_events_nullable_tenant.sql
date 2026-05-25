-- Eventos huérfanos (webhook de grupo no registrado, payload no parseable)
-- antes se loguaban con un UUID placeholder `00000000-...` que violaba el
-- FK contra tenants. supabase-js no tira excepción en ese caso — devuelve
-- `{ error }` — así que el código viejo (try/catch sin chequear .error)
-- silenciaba el bug. Resultado: tabla en cero a pesar de webhooks llegando.
--
-- Hacemos tenant_id nullable. RLS sigue filtrando por current_tenant_id()
-- en SELECT, así que solo service_role ve eventos huérfanos.

ALTER TABLE public.whatsapp_bot_events
  ALTER COLUMN tenant_id DROP NOT NULL;

COMMENT ON COLUMN public.whatsapp_bot_events.tenant_id IS
  'NULL para eventos huérfanos (webhook de grupo no registrado todavía). Una vez identificado el grupo, los eventos tienen tenant.';
