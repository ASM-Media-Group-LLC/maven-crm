-- Backfill `passed_date` para closer_creators históricos.
--
-- Problema: la mutation que asignaba una lead (Nuevo → Asignada) seteaba
-- el `stage` pero olvidaba setear `passed_date`. Eso dejó 18 rows con
-- passed_date = NULL aunque hayan recorrido el pipeline. El reporte
-- de closers filtra "asignadas" por `passed_date in [from, to]`, así
-- que para esas 18 rows nunca cuenta nada → reporte llegaba en cero.
--
-- El fix de código (frontend) ya hace UPDATE de passed_date a partir
-- de hoy. Esta migration parchea el histórico para que los reportes
-- weekly/monthly que miran hacia atrás también vean los datos.
--
-- Estrategia: usar la primera fecha disponible como aproximación de
-- "cuándo se pasó la lead" — confirmed_date si existe (la lead fue
-- confirmada, así que pasó antes), si no completed_date, si no
-- caemos a created_at. Es una aproximación: el created_at del row
-- puede ser anterior a la asignación real, pero es lo mejor que
-- tenemos sin un audit log de cambios de stage.

UPDATE public.closer_creators
SET passed_date = COALESCE(
  confirmed_date::date,
  completed_date::date,
  created_at::date
)
WHERE passed_date IS NULL
  AND stage <> 'Nuevo';
