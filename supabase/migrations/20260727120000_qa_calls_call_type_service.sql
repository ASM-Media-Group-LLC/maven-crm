-- =============================================================================
-- Closers QA: tipo de llamada (reclutamiento vs venta de servicio) + servicio.
-- -----------------------------------------------------------------------------
-- Reporte de Miguel (2026-07-27): el evaluador IA siempre califica la llamada
-- como si el objetivo fuera cerrar a la modelo PARA LA AGENCIA (reclutamiento),
-- pero ahora también suben llamadas donde le venden un SERVICIO (Kash/Unlimited,
-- etc.) a creadoras que YA son de la agencia — y la IA las penaliza mal (outcome
-- "no cerró para la agencia", red flag de cross-portfolio, framing equivocado).
--
-- Fix: qa_calls gana call_type ('reclutamiento' default | 'venta_servicio') y
-- service_sold (texto libre del selector: Unlimited, Kash, Trafix, ...). El form
-- "Nueva QA" los setea y qa-analyze ajusta el prompt según el tipo.
-- Additive + backward-compatible: las 52 llamadas existentes quedan como
-- 'reclutamiento' (que es lo que eran).
-- =============================================================================

alter table public.qa_calls
  add column if not exists call_type text not null default 'reclutamiento'
    constraint qa_calls_call_type_check check (call_type in ('reclutamiento', 'venta_servicio')),
  add column if not exists service_sold text;

comment on column public.qa_calls.call_type is
  'reclutamiento = cerrar a la modelo para la agencia (default, comportamiento histórico). venta_servicio = venderle un servicio del portfolio a una creadora que YA es de la agencia — qa-analyze ajusta rubric/outcome.';
comment on column public.qa_calls.service_sold is
  'Solo para call_type=venta_servicio: qué servicio se le intentó vender (Unlimited, Kash, Trafix, Blu, Piclink, Content Protector, ORA, Let''s Shoot, Otro).';

notify pgrst, 'reload schema';
