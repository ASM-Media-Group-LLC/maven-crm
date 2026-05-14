-- Performance indexes para acelerar queries lentas detectadas en auditoría
-- (pg_stat_statements top 10 por total_exec_time).
--
-- Aplicados en prod via CREATE INDEX CONCURRENTLY (sin bloqueo de escrituras).
-- Archivo en repo para mantener el state sincronizado.
--
-- Beneficio esperado:
--   · get_distinct_promolog_agents: 1.3s → ~10ms
--     (full scan eliminado para WHERE reviewed_by IS NOT NULL)
--   · sync_models_recent: 1.9s → ~50ms
--     (las 5 tablas fuente filtran por updated_at > cutoff; faltaba el índice)
--   · leadgen_entries WHERE model_handle = X: 224ms → ~5ms
--     (el índice existente era gin_trgm, no sirve para = exacto)
--   · leadgen_entries WHERE lg_user_id + quality + created_at: 79ms → ~5ms
--     (composite con orden de selectividad correcto)

-- Para get_distinct_promolog_agents (UNION DISTINCT sobre reviewed_by/created_by)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_promolog_entries_reviewed_by
  ON public.promolog_entries (reviewed_by)
  WHERE reviewed_by IS NOT NULL;

-- Para sync_models_recent: las 5 tablas fuente filtran WHERE updated_at > cutoff
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_updated_at
  ON public.creators (updated_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_closer_creators_updated_at
  ON public.closer_creators (updated_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_closers_contacts_updated_at
  ON public.closers_contacts (updated_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scouter_leads_updated_at
  ON public.scouter_leads (updated_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leadgen_entries_updated_at
  ON public.leadgen_entries (updated_at);

-- Para leadgen_entries WHERE model_handle = X ORDER BY created_at DESC
-- (el índice gin_trgm existente sirve para LIKE, no para = exacto)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leadgen_entries_model_handle_created
  ON public.leadgen_entries (model_handle, created_at DESC)
  WHERE model_handle IS NOT NULL;

-- Para filtros multi-campo en LeadGen (lg_user_id primero por selectividad)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leadgen_entries_user_quality_created
  ON public.leadgen_entries (lg_user_id, quality, created_at DESC);
