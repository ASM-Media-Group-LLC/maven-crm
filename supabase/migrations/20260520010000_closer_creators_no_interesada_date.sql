-- closer_creators: agregar `no_interesada_date` para que el reporte de
-- closers pueda contar "No interesadas" como evento del período (igual
-- que confirmed_date / completed_date hacen para sus stages).
--
-- Antes el conteo "No interesadas" se hacía por stage='No interesada'
-- (sin saber CUÁNDO transicionó) — útil para snapshot pero inútil para
-- reportes diarios/semanales/quincenales.
--
-- Patrón espejo de confirmed_date / completed_date:
--   · timestamptz nullable
--   · se setea desde el frontend cuando el usuario mueve stage → 'No interesada'
--   · backfill aproximado: las 2 rows existentes en stage='No interesada'
--     usan updated_at::timestamptz como fecha de transición (es la mejor
--     aproximación disponible — un trigger de auditoría sería más preciso
--     pero no existe históricamente).

ALTER TABLE public.closer_creators
  ADD COLUMN IF NOT EXISTS no_interesada_date timestamptz;

COMMENT ON COLUMN public.closer_creators.no_interesada_date IS
  'Fecha/hora cuando la lead transicionó a stage=''No interesada''. '
  'Se setea desde el frontend al cambiar el stage (mismo patrón que '
  'confirmed_date / completed_date). Útil para reportes period-based.';

-- Backfill: rows ya en 'No interesada' sin fecha → updated_at
UPDATE public.closer_creators
SET no_interesada_date = updated_at
WHERE stage = 'No interesada'
  AND no_interesada_date IS NULL;
