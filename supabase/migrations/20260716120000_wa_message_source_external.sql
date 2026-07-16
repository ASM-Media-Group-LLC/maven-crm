-- source: origen de un mensaje SALIENTE de la bandeja de WhatsApp.
--   'maven'    → enviado desde la bandeja de Maven (wa-inbox-send/-media)
--   'external' → enviado por FUERA de Maven (celular / WhatsApp Web con la misma línea) → capturado por whatsapp-ingest
--   'ai'       → enviado por un bot/IA (futuro)
--   null       → entrante (no aplica)
-- Permite mostrar en la bandeja los salientes que un agente mandó por fuera de Maven, etiquetados como externos.
alter table public.wa_conversation_messages add column if not exists source text;

comment on column public.wa_conversation_messages.source is
  'origen del saliente: maven (enviado desde la bandeja), external (enviado por fuera: celular/WA Web), ai (bot). null en entrantes.';

notify pgrst, 'reload schema';
