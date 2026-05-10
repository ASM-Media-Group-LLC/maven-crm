-- 20260510130000_models_master_backfill.sql
--
-- Sprint 2 — paso 2 del refactor de identidad de modelos.
-- Depende de 20260510120000_models_master_schema.sql (las tablas ya
-- existen, las columnas model_id ya están en las 5 tablas viejas).
--
-- Esta migration mueve data: extrae los 15,325 handles únicos de las 5
-- fuentes, los consolida en `models` aplicando política de merge (ver
-- docs/refactor-models-master.md), backfillea `model_phones`, y
-- finalmente updatea `model_id` en cada tabla vieja.
--
-- Es idempotente: cada paso usa ON CONFLICT DO NOTHING o un WHERE que
-- excluye lo ya migrado. Se puede correr varias veces sin duplicar.
--
-- IMPORTANTE: rows con handle NULL o vacío NO migran (decisión: "lead
-- sin handle = basura"). Quedan en sus tablas viejas con model_id NULL.

BEGIN;

-- ─── 1. Backfill de `models` ───────────────────────────────────────────
--
-- Política de merge para handles que aparecen en N tablas (1,657 casos):
-- recorremos las 5 fuentes en orden de "más confiable → menos confiable"
-- (creators > closer_creators > closers_contacts > scouter_leads > leadgen_entries)
-- y la primera fuente que encontremos con datos para cada campo, gana.
--
-- COALESCE en orden de prioridad implementa esa política directamente.

INSERT INTO public.models (
  tenant_id, instagram_handle, display_name, avatar_url, bio,
  is_verified, country, city, state, onlyfans_url,
  followers_count, posts_count, last_scraped_at, created_at
)
WITH all_handles AS (
  -- Una fila por (tenant, handle_lower) con los datos consolidados.
  -- Aggregate functions con FILTER recorren todos los rows y eligen
  -- el primer non-null según el orden de prioridad (creators primero).
  SELECT
    coalesce(c.tenant_id, ccr.tenant_id, cc.tenant_id, sl.tenant_id, le.tenant_id) AS tenant_id,
    h.handle AS instagram_handle,
    -- display_name: creators > closer_creators > closers_contacts > scouter_leads
    coalesce(c.name, ccr.name, cc.name, sl.name) AS display_name,
    -- avatar: scouter_leads (es el único con foto fresca del scraper)
    sl.profile_pic_url AS avatar_url,
    sl.bio,
    sl.is_verified,
    coalesce(c.country, ccr.country, cc.country, sl.country) AS country,
    coalesce(c.city, ccr.city, cc.city, sl.city) AS city,
    coalesce(c.state, sl.state) AS state,
    coalesce(c.onlyfans_url, cc.onlyfans_url, le.onlyfans_url) AS onlyfans_url,
    sl.followers_count,
    sl.posts_count,
    sl.recent_posts_last_fetched_at AS last_scraped_at,
    -- created_at = el más viejo entre las 5 fuentes
    least(c.created_at, ccr.created_at, cc.created_at, sl.created_at, le.created_at) AS created_at
  FROM (
    -- Universo de handles únicos lowercased, no vacíos.
    -- IMPORTANTE: filtramos NULL/empty acá — son los "leads sin handle = basura"
    SELECT DISTINCT lower(trim(h)) AS handle FROM (
      SELECT model_handle AS h FROM public.leadgen_entries WHERE model_handle IS NOT NULL AND trim(model_handle) <> ''
      UNION SELECT instagram_handle FROM public.scouter_leads WHERE instagram_handle IS NOT NULL AND trim(instagram_handle) <> ''
      UNION SELECT handle FROM public.closers_contacts WHERE handle IS NOT NULL AND trim(handle) <> ''
      UNION SELECT instagram_handle FROM public.closer_creators WHERE instagram_handle IS NOT NULL AND trim(instagram_handle) <> ''
      UNION SELECT instagram_handle FROM public.creators WHERE instagram_handle IS NOT NULL AND trim(instagram_handle) <> ''
    ) u
  ) h
  -- LEFT JOINs con DISTINCT ON para asegurar 1 row por handle por fuente
  -- (algunas tablas tienen múltiples rows con el mismo handle).
  LEFT JOIN LATERAL (
    SELECT * FROM public.creators
    WHERE lower(trim(instagram_handle)) = h.handle
    ORDER BY created_at DESC LIMIT 1
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT * FROM public.closer_creators
    WHERE lower(trim(instagram_handle)) = h.handle
    ORDER BY created_at DESC LIMIT 1
  ) ccr ON true
  LEFT JOIN LATERAL (
    SELECT * FROM public.closers_contacts
    WHERE lower(trim(handle)) = h.handle
    ORDER BY created_at DESC LIMIT 1
  ) cc ON true
  LEFT JOIN LATERAL (
    SELECT * FROM public.scouter_leads
    WHERE lower(trim(instagram_handle)) = h.handle
    ORDER BY created_at DESC LIMIT 1
  ) sl ON true
  LEFT JOIN LATERAL (
    SELECT * FROM public.leadgen_entries
    WHERE lower(trim(model_handle)) = h.handle
    ORDER BY created_at DESC LIMIT 1
  ) le ON true
)
SELECT
  tenant_id, instagram_handle, display_name, avatar_url, bio,
  is_verified, country, city, state, onlyfans_url,
  followers_count, posts_count, last_scraped_at, created_at
FROM all_handles
WHERE tenant_id IS NOT NULL  -- defensa: handles huérfanos sin tenant
ON CONFLICT (tenant_id, instagram_handle) DO NOTHING;

-- ─── 2. Backfill de `model_phones` ─────────────────────────────────────
--
-- Cada (handle, phone) único de las 5 fuentes con phone_first_set_at no
-- null se inserta como un row en model_phones con el source_module
-- correspondiente. El más reciente por modelo se marca is_primary.

WITH all_phones AS (
  SELECT
    m.tenant_id,
    m.id AS model_id,
    regexp_replace(le.phone_e164, '[^0-9+]', '', 'g') AS phone_e164,
    le.phone_raw,
    'leadgen' AS source_module,
    le.lg_user_id AS captured_by,
    le.phone_first_set_at AS captured_at
  FROM public.leadgen_entries le
  JOIN public.models m ON m.tenant_id = le.tenant_id
                       AND m.instagram_handle = lower(trim(le.model_handle))
  WHERE le.phone_first_set_at IS NOT NULL
    AND le.phone_e164 IS NOT NULL
    AND regexp_replace(le.phone_e164, '[^0-9+]', '', 'g') ~ '^\+?[0-9]{6,15}$'

  UNION ALL

  SELECT
    m.tenant_id, m.id, regexp_replace(sl.phone, '[^0-9+]', '', 'g'),
    sl.phone, 'scouter', NULL, sl.phone_first_set_at
  FROM public.scouter_leads sl
  JOIN public.models m ON m.tenant_id = sl.tenant_id
                       AND m.instagram_handle = lower(trim(sl.instagram_handle))
  WHERE sl.phone_first_set_at IS NOT NULL
    AND sl.phone IS NOT NULL
    AND regexp_replace(sl.phone, '[^0-9+]', '', 'g') ~ '^\+?[0-9]{6,15}$'

  UNION ALL

  SELECT
    m.tenant_id, m.id, regexp_replace(cc.phone, '[^0-9+]', '', 'g'),
    cc.phone, 'closers_contacts', NULL, cc.phone_first_set_at
  FROM public.closers_contacts cc
  JOIN public.models m ON m.tenant_id = cc.tenant_id
                       AND m.instagram_handle = lower(trim(cc.handle))
  WHERE cc.phone_first_set_at IS NOT NULL
    AND cc.phone IS NOT NULL
    AND regexp_replace(cc.phone, '[^0-9+]', '', 'g') ~ '^\+?[0-9]{6,15}$'

  UNION ALL

  SELECT
    m.tenant_id, m.id, regexp_replace(ccr.phone, '[^0-9+]', '', 'g'),
    ccr.phone, 'closer_creators', NULL, ccr.phone_first_set_at
  FROM public.closer_creators ccr
  JOIN public.models m ON m.tenant_id = ccr.tenant_id
                       AND m.instagram_handle = lower(trim(ccr.instagram_handle))
  WHERE ccr.phone_first_set_at IS NOT NULL
    AND ccr.phone IS NOT NULL
    AND regexp_replace(ccr.phone, '[^0-9+]', '', 'g') ~ '^\+?[0-9]{6,15}$'

  UNION ALL

  SELECT
    m.tenant_id, m.id,
    coalesce(regexp_replace(c.phone_e164, '[^0-9+]', '', 'g'),
             regexp_replace(c.phone, '[^0-9+]', '', 'g')),
    coalesce(c.phone, c.phone_e164), 'creators', NULL, c.phone_first_set_at
  FROM public.creators c
  JOIN public.models m ON m.tenant_id = c.tenant_id
                       AND m.instagram_handle = lower(trim(c.instagram_handle))
  WHERE c.phone_first_set_at IS NOT NULL
    AND (c.phone_e164 IS NOT NULL OR c.phone IS NOT NULL)
    AND coalesce(regexp_replace(c.phone_e164, '[^0-9+]', '', 'g'),
                 regexp_replace(c.phone, '[^0-9+]', '', 'g')) ~ '^\+?[0-9]{6,15}$'
),
deduped AS (
  -- Si el mismo (model_id, phone) aparece en varias fuentes, nos
  -- quedamos con el más viejo captured_at (la primera vez que se
  -- capturó es lo que mejor refleja cuándo entró al sistema).
  SELECT DISTINCT ON (model_id, phone_e164)
    tenant_id, model_id, phone_e164, phone_raw, source_module,
    captured_by, captured_at
  FROM all_phones
  WHERE phone_e164 <> ''
  ORDER BY model_id, phone_e164, captured_at ASC
)
INSERT INTO public.model_phones (
  tenant_id, model_id, phone_e164, phone_raw,
  source_module, captured_by, captured_at, status
)
SELECT
  tenant_id, model_id, phone_e164, phone_raw,
  source_module, captured_by, captured_at, 'active'
FROM deduped
ON CONFLICT (tenant_id, model_id, phone_e164) DO NOTHING;

-- Marcar como is_primary el phone más reciente por modelo. Si tiene
-- múltiples (los 372 casos), los anteriores quedan con status='replaced'.

WITH ranked AS (
  SELECT id, model_id,
         row_number() OVER (PARTITION BY model_id ORDER BY captured_at DESC) AS rk,
         count(*) OVER (PARTITION BY model_id) AS total
  FROM public.model_phones
)
UPDATE public.model_phones mp
SET is_primary = (r.rk = 1),
    status = CASE WHEN r.rk = 1 THEN 'active' ELSE 'replaced' END
FROM ranked r
WHERE mp.id = r.id
  AND r.total > 0;

-- ─── 3. Backfill de `model_id` en las 5 tablas viejas ──────────────────

UPDATE public.leadgen_entries le
SET model_id = m.id
FROM public.models m
WHERE le.tenant_id = m.tenant_id
  AND m.instagram_handle = lower(trim(le.model_handle))
  AND le.model_handle IS NOT NULL
  AND trim(le.model_handle) <> ''
  AND le.model_id IS NULL;

UPDATE public.scouter_leads sl
SET model_id = m.id
FROM public.models m
WHERE sl.tenant_id = m.tenant_id
  AND m.instagram_handle = lower(trim(sl.instagram_handle))
  AND sl.instagram_handle IS NOT NULL
  AND trim(sl.instagram_handle) <> ''
  AND sl.model_id IS NULL;

UPDATE public.closers_contacts cc
SET model_id = m.id
FROM public.models m
WHERE cc.tenant_id = m.tenant_id
  AND m.instagram_handle = lower(trim(cc.handle))
  AND cc.handle IS NOT NULL
  AND trim(cc.handle) <> ''
  AND cc.model_id IS NULL;

UPDATE public.closer_creators ccr
SET model_id = m.id
FROM public.models m
WHERE ccr.tenant_id = m.tenant_id
  AND m.instagram_handle = lower(trim(ccr.instagram_handle))
  AND ccr.instagram_handle IS NOT NULL
  AND trim(ccr.instagram_handle) <> ''
  AND ccr.model_id IS NULL;

UPDATE public.creators c
SET model_id = m.id
FROM public.models m
WHERE c.tenant_id = m.tenant_id
  AND m.instagram_handle = lower(trim(c.instagram_handle))
  AND c.instagram_handle IS NOT NULL
  AND trim(c.instagram_handle) <> ''
  AND c.model_id IS NULL;

-- ─── 4. Validation queries (no hacen cambios, solo reportan) ───────────
-- Estos resultados se loggean al aplicar la migration para verificar
-- que la migración cuadra.

DO $$
DECLARE
  v_models_count int;
  v_phones_count int;
  v_leadgen_with_model int;
  v_leadgen_total int;
  v_leadgen_no_handle int;
  v_scouter_with_model int;
  v_scouter_total int;
  v_creators_with_model int;
  v_creators_total int;
BEGIN
  SELECT count(*) INTO v_models_count FROM public.models;
  SELECT count(*) INTO v_phones_count FROM public.model_phones;

  SELECT count(*) INTO v_leadgen_total FROM public.leadgen_entries;
  SELECT count(*) INTO v_leadgen_with_model FROM public.leadgen_entries WHERE model_id IS NOT NULL;
  SELECT count(*) INTO v_leadgen_no_handle FROM public.leadgen_entries WHERE model_handle IS NULL OR trim(model_handle) = '';

  SELECT count(*) INTO v_scouter_total FROM public.scouter_leads;
  SELECT count(*) INTO v_scouter_with_model FROM public.scouter_leads WHERE model_id IS NOT NULL;

  SELECT count(*) INTO v_creators_total FROM public.creators;
  SELECT count(*) INTO v_creators_with_model FROM public.creators WHERE model_id IS NOT NULL;

  RAISE NOTICE '──────── BACKFILL VALIDATION ────────';
  RAISE NOTICE 'models inserted:                    %', v_models_count;
  RAISE NOTICE 'model_phones inserted:              %', v_phones_count;
  RAISE NOTICE 'leadgen_entries: % / % linked (% sin handle)',
               v_leadgen_with_model, v_leadgen_total, v_leadgen_no_handle;
  RAISE NOTICE 'scouter_leads:   % / % linked', v_scouter_with_model, v_scouter_total;
  RAISE NOTICE 'creators:        % / % linked', v_creators_with_model, v_creators_total;
  RAISE NOTICE '─────────────────────────────────────';
END $$;

COMMIT;
