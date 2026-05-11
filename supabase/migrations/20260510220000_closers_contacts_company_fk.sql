-- ─── closers_contacts.company_id → scouter_companies ──────────────────
-- Tercer enchufe de la unificación de compañías. Misma estrategia que
-- creator_business y leadgen_entries: FK opcional + backfill por mapeo
-- fuzzy, la columna texto se queda como denorm cache durante la
-- transición.

ALTER TABLE public.closers_contacts
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.scouter_companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_closers_contacts_company_id
  ON public.closers_contacts (company_id);

WITH mapping(text_pattern, company_slug) AS (
  VALUES
    ('kash agency',          'kash'),
    ('kash-agency',          'kash'),
    ('kash',                 'kash'),
    ('exchange',             'exchange'),
    ('unlok',                'unlok'),
    ('unlock',               'unlok'),
    ('ora miami',            'ora'),
    ('ora-miami',            'ora'),
    ('ora',                  'ora'),
    ('piclink.me',           'piclink'),
    ('piclink',              'piclink'),
    ('leakhunter',           'leakhunter'),
    ('trafix',               'trafix'),
    ('pagomundo',            'pagomundo'),
    ('blu',                  'blu'),
    ('blu app',              'blu'),
    ('atomick',              'atomick'),
    ('atomic agency',        'atomick'),
    ('atomic',               'atomick'),
    ('proyecto medellin',    'proyecto_medellin'),
    ('proyecto medelllin',   'proyecto_medellin'),
    ('proyectomedellin',     'proyecto_medellin'),
    ('proyecto  medellin',   'proyecto_medellin'),
    ('proyecto de medellin', 'proyecto_medellin'),
    ('proyect medellin',     'proyecto_medellin'),
    ('pjm',                  'proyecto_medellin')
)
UPDATE public.closers_contacts cc
SET company_id = sc.id
FROM mapping m
JOIN public.scouter_companies sc ON sc.slug = m.company_slug
WHERE lower(trim(cc.company)) = m.text_pattern;

-- Resultado: 666/667 con FK (99.85%). El único huérfano es
-- "Alvaro Letshoot" (1 fila, no es compañía).
