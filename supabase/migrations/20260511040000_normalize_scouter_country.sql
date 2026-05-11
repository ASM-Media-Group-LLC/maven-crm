-- Normalizar scouter_leads.country a la lista canónica de frontend/src/lib/countries.ts
--
-- Antes: el input era texto libre, así que tenemos en la base:
--   · Duplicados case-insensitive: Mexico vs México vs mexico (~853 rows)
--   · Duplicados con/sin acento: Peru vs Perú, Panama vs Panamá
--   · Variantes en inglés: USA vs Estados Unidos vs US/CA, UK vs United Kingdom
--   · Multi-country strings: "Cuba/Estados Unidos", "España / USA / Canadá / Suiza"
--   · Garbage (nombres de personas, "Manual", "General", "Cuenta nueva", "Miami")
--
-- Después de esta migración:
--   · Cada país que sí lo es queda mapeado al canónico (México, US/CA, UK, etc.)
--   · Garbage y multi-country pasan a NULL (el filtro los muestra como "Sin país")

-- Mapeos directos (case-insensitive vía LOWER).
UPDATE public.scouter_leads SET country = 'México'
  WHERE LOWER(TRIM(country)) IN ('mexico', 'méxico', 'mex', 'mx');

UPDATE public.scouter_leads SET country = 'Colombia'
  WHERE LOWER(TRIM(country)) IN ('colombia');

UPDATE public.scouter_leads SET country = 'Chile'
  WHERE LOWER(TRIM(country)) IN ('chile');

UPDATE public.scouter_leads SET country = 'Perú'
  WHERE LOWER(TRIM(country)) IN ('peru', 'perú', 'lima, peru', 'lima peru');

UPDATE public.scouter_leads SET country = 'Venezuela'
  WHERE LOWER(TRIM(country)) IN ('venezuela');

UPDATE public.scouter_leads SET country = 'Ecuador'
  WHERE LOWER(TRIM(country)) IN ('ecuador');

UPDATE public.scouter_leads SET country = 'Panamá'
  WHERE LOWER(TRIM(country)) IN ('panama', 'panamá');

UPDATE public.scouter_leads SET country = 'Argentina'
  WHERE LOWER(TRIM(country)) IN ('argentina');

UPDATE public.scouter_leads SET country = 'España'
  WHERE LOWER(TRIM(country)) IN ('españa', 'espana', 'spain');

UPDATE public.scouter_leads SET country = 'Italia'
  WHERE LOWER(TRIM(country)) IN ('italia', 'italy');

UPDATE public.scouter_leads SET country = 'Francia'
  WHERE LOWER(TRIM(country)) IN ('francia', 'france');

UPDATE public.scouter_leads SET country = 'Alemania'
  WHERE LOWER(TRIM(country)) IN ('alemania', 'germany');

UPDATE public.scouter_leads SET country = 'Brasil'
  WHERE LOWER(TRIM(country)) IN ('brasil', 'brazil');

UPDATE public.scouter_leads SET country = 'Cuba'
  WHERE LOWER(TRIM(country)) IN ('cuba');

UPDATE public.scouter_leads SET country = 'República Dominicana'
  WHERE LOWER(TRIM(country)) IN ('republica dominicana', 'república dominicana', 'dominican republic');

UPDATE public.scouter_leads SET country = 'Puerto Rico'
  WHERE LOWER(TRIM(country)) IN ('puerto rico');

UPDATE public.scouter_leads SET country = 'Guatemala'
  WHERE LOWER(TRIM(country)) IN ('guatemala');

UPDATE public.scouter_leads SET country = 'Honduras'
  WHERE LOWER(TRIM(country)) IN ('honduras');

UPDATE public.scouter_leads SET country = 'Nicaragua'
  WHERE LOWER(TRIM(country)) IN ('nicaragua');

UPDATE public.scouter_leads SET country = 'Uruguay'
  WHERE LOWER(TRIM(country)) IN ('uruguay');

UPDATE public.scouter_leads SET country = 'Paraguay'
  WHERE LOWER(TRIM(country)) IN ('paraguay');

UPDATE public.scouter_leads SET country = 'Bolivia'
  WHERE LOWER(TRIM(country)) IN ('bolivia');

UPDATE public.scouter_leads SET country = 'US/CA'
  WHERE LOWER(TRIM(country)) IN ('usa', 'us', 'u.s.', 'u.s.a.', 'eeuu',
                                  'estados unidos', 'united states', 'miami');

UPDATE public.scouter_leads SET country = 'UK'
  WHERE LOWER(TRIM(country)) IN ('uk', 'u.k.', 'united kingdom', 'reino unido',
                                  'england', 'inglaterra');

UPDATE public.scouter_leads SET country = 'Suecia'
  WHERE LOWER(TRIM(country)) IN ('sweden', 'suecia');

UPDATE public.scouter_leads SET country = 'Irlanda'
  WHERE LOWER(TRIM(country)) IN ('ireland', 'irlanda');

UPDATE public.scouter_leads SET country = 'Turquía'
  WHERE LOWER(TRIM(country)) IN ('turkey', 'turquia', 'turquía');

UPDATE public.scouter_leads SET country = 'Filipinas'
  WHERE LOWER(TRIM(country)) IN ('philippines', 'filipinas');

UPDATE public.scouter_leads SET country = 'Rumania'
  WHERE LOWER(TRIM(country)) IN ('romania', 'rumania', 'rumanía');

UPDATE public.scouter_leads SET country = 'Pakistán'
  WHERE LOWER(TRIM(country)) IN ('pakistán', 'pakistan');

UPDATE public.scouter_leads SET country = 'China'
  WHERE LOWER(TRIM(country)) IN ('china');

UPDATE public.scouter_leads SET country = 'Vietnam'
  WHERE LOWER(TRIM(country)) IN ('vietnam');

UPDATE public.scouter_leads SET country = 'Australia'
  WHERE LOWER(TRIM(country)) IN ('australia');

UPDATE public.scouter_leads SET country = 'Jamaica'
  WHERE LOWER(TRIM(country)) IN ('jamaica');

UPDATE public.scouter_leads SET country = 'Rusia'
  WHERE LOWER(TRIM(country)) IN ('rusia', 'russia');

UPDATE public.scouter_leads SET country = 'Ucrania'
  WHERE LOWER(TRIM(country)) IN ('ucrania', 'ukraine');

-- Suiza, Armenia, Serbia, Nigeria, Emiratos NO están en CANONICAL_COUNTRIES.
-- Decisión: agregamos solo los que ya tienen al menos 1 row real, mapeando
-- a su canónico cuando exista en CANONICAL_COUNTRIES. Si no existe, los
-- dejamos como están (texto libre canónico-ish): "Suiza", "Armenia", etc.
-- Eventualmente la lista canónica se extiende — pero no rompemos data
-- existente.
UPDATE public.scouter_leads SET country = 'Nigeria'
  WHERE LOWER(TRIM(country)) IN ('nigeria');

-- Garbage / inputs incorrectos / multi-country / ciudades sueltas →
-- NULL (los limpia del filtro, quedan en "Sin país").
UPDATE public.scouter_leads SET country = NULL
  WHERE country IS NOT NULL AND (
    -- Nombres de personas
    LOWER(TRIM(country)) IN ('julieth', 'miguel', 'luisa') OR
    -- Strings administrativos
    LOWER(TRIM(country)) IN ('manual', 'general', 'cuenta nueva') OR
    -- Multi-country ambiguous (contiene / o ,)
    country LIKE '%/%' OR
    (country LIKE '%,%' AND LOWER(TRIM(country)) NOT IN ('lima, peru'))
  );
