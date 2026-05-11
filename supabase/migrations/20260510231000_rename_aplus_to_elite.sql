-- Rename del code "A++" a "Elite" en model_categories.
-- Cambio de naming a pedido del user (queda más claro como "tier top" que
-- como "A++ con doble plus" que confundía vs A+).
--
-- Como `code` es PK referenciada por 4 FKs, no podemos UPDATE en cascada
-- directo. Secuencia:
--   1. Insert nueva fila 'Elite'
--   2. Move FKs: category_code A++ → Elite en las 4 tablas
--   3. Delete fila vieja 'A++'
--   4. Sync columnas texto-cache para consistencia (creators.category,
--      qa_models.category, scouter_leads.category, leadgen_entries.quality)

INSERT INTO public.model_categories (code, label, sort_order)
VALUES ('Elite', 'Elite (Top Tier)', 1)
ON CONFLICT (code) DO NOTHING;

UPDATE public.creators        SET category_code = 'Elite' WHERE category_code = 'A++';
UPDATE public.leadgen_entries SET category_code = 'Elite' WHERE category_code = 'A++';
UPDATE public.qa_models       SET category_code = 'Elite' WHERE category_code = 'A++';
UPDATE public.scouter_leads   SET category_code = 'Elite' WHERE category_code = 'A++';

DELETE FROM public.model_categories WHERE code = 'A++';

UPDATE public.creators        SET category = 'Elite' WHERE category = 'A++';
UPDATE public.qa_models       SET category = 'Elite' WHERE category = 'A++';
UPDATE public.scouter_leads   SET category = 'Elite' WHERE category = 'A++';
UPDATE public.leadgen_entries SET quality  = 'Elite' WHERE quality  = 'A++';
