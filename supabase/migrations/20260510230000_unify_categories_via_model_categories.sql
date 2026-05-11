-- ─── Unificación de categorías — model_categories canónica ────────────
-- Una sola fuente de verdad para A++ / A+ / A / B+ / B / C+ / C.
-- Reemplaza los 4 textos sueltos:
--   creators.category, leadgen_entries.quality,
--   qa_models.category, scouter_leads.category.

-- 1. Tabla canónica
CREATE TABLE IF NOT EXISTS public.model_categories (
  code        text PRIMARY KEY,
  label       text NOT NULL,
  sort_order  int NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.model_categories (code, label, sort_order) VALUES
  ('A++', 'A++ (Top Tier)',     1),
  ('A+',  'A+ (Premium)',       2),
  ('A',   'A (Alta)',           3),
  ('B+',  'B+ (Media Alta)',    4),
  ('B',   'B (Media)',          5),
  ('C+',  'C+ (Media Baja)',    6),
  ('C',   'C (Básica)',         7)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.model_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "model_categories_read" ON public.model_categories;
CREATE POLICY "model_categories_read"
  ON public.model_categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "model_categories_write" ON public.model_categories;
CREATE POLICY "model_categories_write"
  ON public.model_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. FK columns en las 4 tablas + indices
ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS category_code text REFERENCES public.model_categories(code) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_creators_category_code ON public.creators(category_code);

ALTER TABLE public.leadgen_entries
  ADD COLUMN IF NOT EXISTS category_code text REFERENCES public.model_categories(code) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leadgen_entries_category_code ON public.leadgen_entries(category_code);

ALTER TABLE public.qa_models
  ADD COLUMN IF NOT EXISTS category_code text REFERENCES public.model_categories(code) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_qa_models_category_code ON public.qa_models(category_code);

ALTER TABLE public.scouter_leads
  ADD COLUMN IF NOT EXISTS category_code text REFERENCES public.model_categories(code) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_scouter_leads_category_code ON public.scouter_leads(category_code);

-- 3. Backfill via upper() — normaliza los typos en minúscula.
-- En producción se corrió en chunks via execute_sql por el timeout del
-- migration runner; el script queda acá para reproducibilidad.
UPDATE public.creators
SET category_code = upper(category)
WHERE category IS NOT NULL AND category <> ''
  AND upper(category) IN ('A++','A+','A','B+','B','C+','C');

UPDATE public.qa_models
SET category_code = upper(category)
WHERE category IS NOT NULL AND category <> ''
  AND upper(category) IN ('A++','A+','A','B+','B','C+','C');

UPDATE public.scouter_leads
SET category_code = upper(category)
WHERE category IS NOT NULL AND category <> ''
  AND upper(category) IN ('A++','A+','A','B+','B','C+','C');

UPDATE public.leadgen_entries
SET category_code = upper(quality)
WHERE category_code IS NULL
  AND quality IS NOT NULL AND quality <> ''
  AND upper(quality) IN ('A++','A+','A','B+','B','C+','C');

-- Resultado: 100% backfill (cero huérfanos)
--   creators: 289/289
--   leadgen_entries: 102.080/102.080
--   qa_models: 21/21
--   scouter_leads: 4.412/4.412
