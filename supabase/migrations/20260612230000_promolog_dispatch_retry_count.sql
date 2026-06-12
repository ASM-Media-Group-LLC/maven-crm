-- retry_count en promolog_dispatch_runs: soporte para el reintento automático de
-- corridas caídas (timeout/failed) en promolog-poll.
--   0 = corrida original → elegible para UN reintento automático si quedó con caídas.
--   1 = ya reintentada, o ES un reintento → no se vuelve a reintentar (anti-loop).
ALTER TABLE public.promolog_dispatch_runs
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

-- PostgREST cachea el schema: recargar para que los inserts/selects vean la columna nueva.
NOTIFY pgrst, 'reload schema';
