-- profiles.is_owner — flag de "dueño de la empresa" para que el bot de
-- WhatsApp lo priorice y le ajuste el tono. NO es un rol (Maven roles
-- definen permisos; is_owner solo es contexto para el agente). Solo
-- esperamos UN owner por tenant — pero no lo enforzamos en DB porque
-- por ahora es single-tenant y la lógica de unicidad podría cambiar.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_owner IS
  'Si true, el bot de WhatsApp ajusta su respuesta cuando este user habla: tono más resumido, bullets, prioridad de respuesta. No otorga permisos extra — para eso está user_roles.';

-- Alvaro Mejía = dueño de la agencia.
UPDATE public.profiles
   SET is_owner = true
 WHERE id = '528453bd-f1e1-43d3-85c1-01c5fa5bbcfb';
