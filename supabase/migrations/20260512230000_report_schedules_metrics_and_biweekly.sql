-- Phase 2: métricas custom + período quincenal.
--
-- metrics: array de keys del catálogo (ej. ['llg.nuevos',
-- 'closer.qa_avg']). Si está NULL/vacío, send-report usa el set default
-- del módulo (backward compat con schedules viejos).
--
-- quincenal: nuevo valor del enum report_period. dispatch-reports lo
-- dispara los días 1 y 16 de cada mes — cada uno cubre los 15 días
-- previos (día 1 = segunda quincena del mes anterior, día 16 = primera
-- quincena del mes actual).

ALTER TYPE report_period ADD VALUE IF NOT EXISTS 'quincenal';

ALTER TABLE public.report_schedules
  ADD COLUMN metrics text[];

COMMENT ON COLUMN public.report_schedules.metrics IS
  'Array de keys del catálogo de métricas. NULL = set default del módulo.';
