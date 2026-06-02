-- =============================================================================
-- Fix de seguridad (review 2026-06-02): cerrar exposición de RLS.
-- -----------------------------------------------------------------------------
-- Estas 3 tablas del bot de WhatsApp tenían RLS APAGADA y sin policies →
-- accesibles (lectura/escritura) por la anon key, que viaja en el bundle público.
-- Solo las usan las edge functions con service_role (que bypassa RLS) y el
-- frontend NO las referencia (0 usos). Por eso prender RLS sin policies las deja
-- backend-only (igual que whatsapp_bot_rules) y no rompe ningún flujo.
-- =============================================================================

alter table public.whatsapp_supervisor_state enable row level security;
alter table public.whatsapp_user_schedules   enable row level security;
alter table public.whatsapp_user_time_off    enable row level security;
