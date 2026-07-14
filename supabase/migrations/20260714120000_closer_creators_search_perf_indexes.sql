-- Performance del buscador y del pool en el pipeline de Closers.
--
-- Problema: el buscador por handle (Operaciones → "Buscar por handle...") hacía
-- `ilike '%term%'` sobre closer_creators.instagram_handle SIN índice → sequential
-- scan de toda la tabla (>2500 filas) en cada tecla, además del `count: exact`.
-- Combinado con la falta de debounce y el prefetch de las otras tabs, el filtro
-- "reaccionaba mucho después". El debounce y el skip de prefetch se arreglan en el
-- frontend (useCloserLeads.ts); acá va el índice del lado servidor.

-- 1) Índice trigram para que `ilike '%term%'` use índice en vez de seq scan.
CREATE INDEX IF NOT EXISTS idx_closer_creators_handle_trgm
  ON public.closer_creators USING gin (instagram_handle gin_trgm_ops);

-- 2) Índice compuesto para el pool (stage='Nuevo' + assigned_to IS NULL ordenado
--    por created_at) y para las tabs filtradas por stage.
CREATE INDEX IF NOT EXISTS idx_closer_creators_stage_assigned_created
  ON public.closer_creators (stage, assigned_to, created_at DESC);
