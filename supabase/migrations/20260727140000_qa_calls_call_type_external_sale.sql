-- =============================================================================
-- Closers QA: tercer tipo de llamada — venta de plataforma a modelo EXTERNA.
-- -----------------------------------------------------------------------------
-- Aclaración del owner (2026-07-27, sobre #961): además de reclutar y de
-- venderle servicios a creadoras propias, el equipo también le vende
-- plataformas a modelos que NO son de la agencia. Ese caso se evalúa distinto
-- de los otros dos:
--   * reclutamiento   → objetivo: que firme con la agencia.
--   * venta_servicio  → YA es de la agencia; el closer se apalanca en la
--                       relación y los resultados existentes.
--   * venta_externa   → NO es de la agencia: no hay relación previa donde
--                       apoyarse (venta más fría, hay que construir
--                       credibilidad desde cero) y, si aparece fit, el
--                       reclutamiento a la agencia es un upside legítimo.
--
-- Solo amplía el CHECK. Sin backfill (nadie tenía este valor). Reversible.
-- =============================================================================

alter table public.qa_calls
  drop constraint if exists qa_calls_call_type_check;

alter table public.qa_calls
  add constraint qa_calls_call_type_check
  check (call_type in ('reclutamiento', 'venta_servicio', 'venta_externa'));

comment on column public.qa_calls.call_type is
  'reclutamiento = cerrar a la modelo para la agencia (default, comportamiento histórico). venta_servicio = venderle un servicio del portfolio a una creadora que YA es de la agencia. venta_externa = venderle una plataforma a una modelo que NO es de la agencia. qa-analyze ajusta rubric/outcome según el tipo.';
comment on column public.qa_calls.service_sold is
  'Para call_type=venta_servicio o venta_externa: qué servicio/plataforma se intentó vender (Unlimited, Kash, Trafix, Blu, Piclink, Content Protector, ORA, Let''s Shoot, Otro).';

notify pgrst, 'reload schema';
