-- whatsapp_user_time_off — días en que un miembro NO trabaja, capturados
-- desde anuncios en el grupo de WhatsApp ("mañana no entro", "el viernes
-- me tomo el día") o cargados manualmente. El bot consulta esta tabla
-- al responder horarios para no decir "Daniel entra a las 9" si Daniel
-- ya anunció que descansa.
--
-- off_type:
--   day_off   → día completo libre (descanso mensual random, día personal)
--   partial   → llega tarde o se va temprano. partial_start_time / end_time son el horario REAL del día.
--   sick      → enfermedad
--   vacation  → vacaciones (días o rango)
--
-- source:
--   wpp_message → detectado automáticamente por el agente a partir de un mensaje del grupo
--   manual      → cargado por admin

CREATE TABLE IF NOT EXISTS public.whatsapp_user_time_off (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  off_date           date NOT NULL,
  off_type           text NOT NULL DEFAULT 'day_off' CHECK (off_type IN ('day_off', 'partial', 'sick', 'vacation')),
  partial_start_time time,
  partial_end_time   time,
  reason             text,
  source             text NOT NULL DEFAULT 'wpp_message' CHECK (source IN ('wpp_message', 'manual')),
  source_message_id  uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  announced_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_user_time_off_user_date_idx
  ON public.whatsapp_user_time_off (user_id, off_date);

-- Dedup: un (user_id, off_date) solo puede tener UN registro de tipo
-- day_off | sick | vacation. partial sí puede repetirse (ej: alguien llega
-- tarde Y se va temprano — pero en la práctica preferimos UN partial con
-- ambas horas, así que también lo dedupeamos a 1 por día).
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_user_time_off_dedup
  ON public.whatsapp_user_time_off (user_id, off_date);

COMMENT ON TABLE public.whatsapp_user_time_off IS
  'Días libres / parciales / enfermedad / vacaciones del equipo del bot, capturados desde anuncios en el grupo de WhatsApp o cargados manualmente. Se restan al horario base de whatsapp_user_schedules.';
