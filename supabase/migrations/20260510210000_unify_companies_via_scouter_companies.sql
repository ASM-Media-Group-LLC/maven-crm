-- ─── Unificación de compañías — scouter_companies como tabla canónica ──
--
-- Antes: agency/company sueltas como texto en:
--   creator_business.assigned_agency
--   leadgen_entries.company
--
-- Ahora: ambas tablas tienen company_id FK → scouter_companies.id.
-- Las columnas de texto se quedan por backwards-compat durante la
-- transición (no se dropean hasta que la app esté 100% por FK).

-- 1. Agregar compañías que viven en leadgen pero no estaban en
--    scouter_companies. Decisión del user: todas son compañías reales.
INSERT INTO public.scouter_companies (slug, name, active, tenant_id)
VALUES
  ('leakhunter',        'LeakHunter',        true, '30869615-f579-4981-8a1f-dbebc61eae2d'),
  ('trafix',            'Trafix',            true, '30869615-f579-4981-8a1f-dbebc61eae2d'),
  ('proyecto_medellin', 'Proyecto Medellín', true, '30869615-f579-4981-8a1f-dbebc61eae2d'),
  ('pagomundo',         'Pagomundo',         true, '30869615-f579-4981-8a1f-dbebc61eae2d')
ON CONFLICT (slug) DO NOTHING;

-- 2. creator_business.company_id
ALTER TABLE public.creator_business
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.scouter_companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_creator_business_company_id
  ON public.creator_business (company_id);

-- Backfill por mapeo explícito texto → slug.
-- "Otra" y "Elite Models" quedan con company_id NULL (no son compañías).
WITH mapping(text_name, company_slug) AS (
  VALUES
    ('Kash Agency',    'kash'),
    ('Atomic Agency',  'atomick'),
    ('Unlok Platform', 'unlok'),
    ('ORA Agency',     'ora')
)
UPDATE public.creator_business cb
SET company_id = sc.id
FROM mapping m
JOIN public.scouter_companies sc ON sc.slug = m.company_slug
WHERE cb.assigned_agency = m.text_name;

-- 3. leadgen_entries.company_id
ALTER TABLE public.leadgen_entries
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.scouter_companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leadgen_entries_company_id
  ON public.leadgen_entries (company_id);

-- Backfill leadgen via mapeo fuzzy. Cada variante de typo/case mapea
-- al mismo slug canónico.
WITH leadgen_mapping(text_pattern, company_slug) AS (
  VALUES
    ('kash agency',          'kash'),
    ('kash-agency',          'kash'),
    ('exchange',             'exchange'),
    ('unlok',                'unlok'),
    ('ora miami',            'ora'),
    ('piclink.me',           'piclink'),
    ('leakhunter',           'leakhunter'),
    ('trafix',               'trafix'),
    ('pagomundo',            'pagomundo'),
    ('proyecto medellin',    'proyecto_medellin'),
    ('proyecto medelllin',   'proyecto_medellin'),
    ('proyectomedellin',     'proyecto_medellin'),
    ('proyecto  medellin',   'proyecto_medellin'),
    ('proyecto de medellin', 'proyecto_medellin'),
    ('proyect medellin',     'proyecto_medellin'),
    ('pjm',                  'proyecto_medellin')
)
UPDATE public.leadgen_entries le
SET company_id = sc.id
FROM leadgen_mapping m
JOIN public.scouter_companies sc ON sc.slug = m.company_slug
WHERE lower(trim(le.company)) = m.text_pattern;

-- Resultado esperado:
--   creator_business: 291/298 con FK (97.7%) — los 7 sueltos son "Otra"
--     y "Elite Models" que se decidió dejar NULL.
--   leadgen_entries: 100.969/100.993 con FK (99.97%) — los 24 sueltos
--     son "alvaroletshoot" (23, noise) y "Blu app" (1, edge case).
