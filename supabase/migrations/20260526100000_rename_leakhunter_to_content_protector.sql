-- Rename del producto LeakHunter a Content Protector.
-- Aplicado vía MCP el 2026-05-26. Este archivo es el registro git.
--
-- Las 4 tablas tocadas:
--   - scouter_companies (slug + name): 1 row
--   - closer_platform_sales (platform): 3 rows
--   - leadgen_entries (company): 208 rows
--   - closer_creators (main_platform): 0 rows pero por las dudas
--
-- Frontend updated en paralelo (8 arrays con la lista de productos).

UPDATE public.scouter_companies
  SET slug = 'contentprotector', name = 'Content Protector'
  WHERE slug = 'leakhunter';

UPDATE public.closer_platform_sales
  SET platform = 'Content Protector'
  WHERE platform = 'LeakHunter';

UPDATE public.leadgen_entries
  SET company = 'Content Protector'
  WHERE company = 'LeakHunter';

UPDATE public.closer_creators
  SET main_platform = 'Content Protector'
  WHERE main_platform = 'LeakHunter';
