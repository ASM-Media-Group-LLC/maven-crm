-- item_kind: clasifica el tipo de item rastreado. Antes solo trackeábamos
-- "promesas" estrictas (alguien dice "yo hago X"). Ahora ampliamos para
-- captar todo lo OPERATIVO del grupo, esté o no en Maven:
--
--   promise    → "yo te traigo X mañana" (compromiso clásico)
--   meeting    → "reunión con @larola_a martes 4pm" (cita agendada)
--   task       → "Juan compra 4 cuentas para Daniel" (tarea asignada a alguien)
--   tracking   → "Daniel ahora tiene 7 cuentas de spam" (item con estado evolutivo)
--   followup   → "verifiquemos si X respondió" (algo a chequear después)
--
-- El extractor de WhatsApp clasifica al insertar. El agent al responder
-- "qué pendientes hay" puede agrupar/filtrar por kind.

ALTER TABLE public.whatsapp_commitments
  ADD COLUMN IF NOT EXISTS item_kind text NOT NULL DEFAULT 'promise'
  CHECK (item_kind IN ('promise', 'meeting', 'task', 'tracking', 'followup'));

CREATE INDEX IF NOT EXISTS whatsapp_commitments_item_kind_idx
  ON public.whatsapp_commitments (group_id, item_kind, status);

COMMENT ON COLUMN public.whatsapp_commitments.item_kind IS
  'Tipo de item rastreado. promise=compromiso clásico; meeting=reunión agendada; task=tarea asignada a alguien; tracking=item operativo con estado evolutivo (ej. cuentas spam); followup=chequeo pendiente.';
