-- Días configurables por periodicidad en reports.
--
-- Semántica de columnas según period:
--   weekly    → dispatch_weekdays (ISO weekday array, 1=Mon ... 7=Sun)
--   quincenal → dispatch_days_of_month con 1-2 valores (1-28)
--   monthly   → dispatch_days_of_month con 1 valor (1-28)
--   annual    → dispatch_days_of_month con 1 valor + dispatch_month_of_year (1-12)
--   daily     → ignora todo
--
-- Day-of-month cap a 28 para evitar conflictos con febrero/meses cortos.

ALTER TABLE public.report_schedules
  ADD COLUMN dispatch_weekdays smallint[],
  ADD COLUMN dispatch_days_of_month smallint[],
  ADD COLUMN dispatch_month_of_year smallint;

UPDATE public.report_schedules
SET
  dispatch_weekdays = CASE WHEN period = 'weekly' THEN ARRAY[1]::smallint[] END,
  dispatch_days_of_month = CASE
    WHEN period IN ('quincenal') THEN ARRAY[1, 16]::smallint[]
    WHEN period IN ('monthly', 'annual') THEN ARRAY[1]::smallint[]
  END,
  dispatch_month_of_year = CASE WHEN period = 'annual' THEN 1 END;
