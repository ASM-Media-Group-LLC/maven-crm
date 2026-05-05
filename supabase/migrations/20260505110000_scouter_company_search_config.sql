-- ============================================================================
-- Scouter Companies — search_config JSONB + AI-generated search criteria
-- ============================================================================
-- Cada compañía ahora puede tener configuración de búsqueda personalizada
-- que la IA genera a partir de la descripción. Esto alimenta al worker
-- para que sepa QUÉ buscar por cada compañía.
--
-- Estructura esperada de search_config:
-- {
--   "hashtags":           ["onlyfansmodel", "contentcreator", ...],
--   "seed_accounts":      ["@handle1", "@handle2", ...],
--   "followers_min":      10000,
--   "followers_max":      500000,
--   "content_type":       "adult" | "fitness" | "lifestyle" | "mixed",
--   "profile_tier":       "micro" | "mid" | "macro" | "mega",
--   "geo_targets":        ["LATAM", "US", "Europe"],
--   "bio_keywords":       ["link in bio", "collab", "DM for biz"],
--   "exclude_keywords":   ["bot", "spam"],
--   "scoring_notes":      "Texto libre que se inyecta al scorer LLM",
--   "ai_generated_at":    "2026-05-05T..."
-- }

ALTER TABLE public.scouter_companies
  ADD COLUMN IF NOT EXISTS search_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.scouter_companies.search_config IS
  'AI-generated or manual search criteria: hashtags, follower range, content type, geo targets, etc.';
