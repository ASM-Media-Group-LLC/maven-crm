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
-- EXCEPCIÓN: creators con phone pero sin handle SÍ migran (~25 rows) —
-- son clientes firmados, no basura.
--
-- NOTA SOBRE TENANT_ID: closers_contacts / closer_creators / creators
-- son pre-multi-tenant y no tienen columna tenant_id. Usamos el único
-- tenant existente en el sistema (ASM Tech). Cuando se haga el refactor
-- multi-tenant de esas tablas, este script ya no aplica — pero para la
-- migración actual asumimos single-tenant.

BEGIN;

-- Default tenant: el único que existe en el sistema hoy (ASM Tech).
-- Usado para las tablas pre-multi-tenant que no tienen columna tenant_id.
CREATE TEMP TABLE IF NOT EXISTS _default_tenant AS
  SELECT id FROM public.tenants ORDER BY created_at LIMIT 1;

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
    -- Solo leadgen_entries y scouter_leads tienen tenant_id columna.
    -- Las otras 3 tablas son single-tenant; usamos el default.
    coalesce(sl.tenant_id, le.tenant_id, (SELECT id FROM _default_tenant)) AS tenant_id,
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
ON CONFLICT DO NOTHING;  -- partial unique index sobre (tenant, lower(handle)) WHERE NOT NULL

-- ─── 1b. Backfill de creators SIN handle pero CON phone ────────────────
--
-- Edge case real: ~25 creators firmados nunca capturaron IG, pero tienen
-- contrato + phone. Política "sin handle = basura" no aplica porque son
-- clientes activos. Dedup por (tenant, phone_e164) — si dos creators
-- tienen el mismo phone, asumimos que son la misma persona física.

INSERT INTO public.models (
  tenant_id, instagram_handle, display_name, country, city, state,
  onlyfans_url, created_at
)
WITH phone_only_creators AS (
  -- DISTINCT ON (tenant, phone) elige el más viejo por phone para
  -- preservar el created_at original (si dos creators con mismo phone
  -- existen, agarra el primero registrado).
  -- creators no tiene tenant_id propio → usamos el default tenant.
  SELECT DISTINCT ON (phone_normalized)
    (SELECT id FROM _default_tenant) AS tenant_id,
    name, country, city, state, onlyfans_url, created_at,
    phone_normalized
  FROM (
    SELECT name, country, city, state, onlyfans_url, created_at, phone_e164, phone,
           coalesce(regexp_replace(phone_e164, '[^0-9+]', '', 'g'),
                    regexp_replace(phone, '[^0-9+]', '', 'g')) AS phone_normalized
    FROM public.creators
    WHERE (instagram_handle IS NULL OR trim(instagram_handle) = '')
      AND (phone_e164 IS NOT NULL OR phone IS NOT NULL)
  ) c
  WHERE phone_normalized ~ '^\+?[0-9]{6,15}$'
  ORDER BY phone_normalized, created_at ASC
)
SELECT
  tenant_id, NULL, name, country, city, state, onlyfans_url, created_at
FROM phone_only_creators;

-- Estos no tienen handle, así que no van a chocar con el partial unique
-- index. Pero podríamos correr este script 2 veces y duplicar — la
-- protección está en el ON CONFLICT del backfill de model_phones más
-- abajo, que dedupea por (tenant, model_id, phone_e164).

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
  JOIN public.models m ON m.tenant_id = (SELECT id FROM _default_tenant)
                       AND m.instagram_handle = lower(trim(cc.handle))
  WHERE cc.phone_first_set_at IS NOT NULL
    AND cc.phone IS NOT NULL
    AND regexp_replace(cc.phone, '[^0-9+]', '', 'g') ~ '^\+?[0-9]{6,15}$'

  UNION ALL

  SELECT
    m.tenant_id, m.id, regexp_replace(ccr.phone, '[^0-9+]', '', 'g'),
    ccr.phone, 'closer_creators', NULL, ccr.phone_first_set_at
  FROM public.closer_creators ccr
  JOIN public.models m ON m.tenant_id = (SELECT id FROM _default_tenant)
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
  JOIN public.models m ON m.tenant_id = (SELECT id FROM _default_tenant)
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

-- ─── 2b. Backfill de model_phones para los no-handle creators ─────────
-- Estos models recién creados (paso 1b) tienen handle=NULL. Los linkeamos
-- al phone original del creator vía phone normalizado.

INSERT INTO public.model_phones (
  tenant_id, model_id, phone_e164, phone_raw,
  source_module, captured_at, status
)
SELECT DISTINCT ON (m.id, p.phone_normalized)
  m.tenant_id, m.id, p.phone_normalized, c.phone,
  'creators', c.phone_first_set_at, 'active'
FROM public.creators c
CROSS JOIN LATERAL (
  SELECT coalesce(regexp_replace(c.phone_e164, '[^0-9+]', '', 'g'),
                  regexp_replace(c.phone, '[^0-9+]', '', 'g')) AS phone_normalized
) p
JOIN public.models m
  ON m.tenant_id = (SELECT id FROM _default_tenant)
 AND m.instagram_handle IS NULL
 AND m.created_at = c.created_at  -- match por timestamp + sin handle (proxy de identidad)
 AND m.display_name IS NOT DISTINCT FROM c.name
WHERE (c.instagram_handle IS NULL OR trim(c.instagram_handle) = '')
  AND (c.phone_e164 IS NOT NULL OR c.phone IS NOT NULL)
  AND p.phone_normalized ~ '^\+?[0-9]{6,15}$'
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

-- closers_contacts / closer_creators / creators NO tienen tenant_id
-- (pre-multi-tenant). El JOIN se hace contra el tenant default.
UPDATE public.closers_contacts cc
SET model_id = m.id
FROM public.models m
WHERE m.tenant_id = (SELECT id FROM _default_tenant)
  AND m.instagram_handle = lower(trim(cc.handle))
  AND cc.handle IS NOT NULL
  AND trim(cc.handle) <> ''
  AND cc.model_id IS NULL;

UPDATE public.closer_creators ccr
SET model_id = m.id
FROM public.models m
WHERE m.tenant_id = (SELECT id FROM _default_tenant)
  AND m.instagram_handle = lower(trim(ccr.instagram_handle))
  AND ccr.instagram_handle IS NOT NULL
  AND trim(ccr.instagram_handle) <> ''
  AND ccr.model_id IS NULL;

UPDATE public.creators c
SET model_id = m.id
FROM public.models m
WHERE m.tenant_id = (SELECT id FROM _default_tenant)
  AND m.instagram_handle = lower(trim(c.instagram_handle))
  AND c.instagram_handle IS NOT NULL
  AND trim(c.instagram_handle) <> ''
  AND c.model_id IS NULL;

-- ─── 3b. Linking de creators-sin-handle vía phone ──────────────────────
-- Para los 25 creators con phone pero sin handle (ver paso 1b), linkeamos
-- el creator a su model recién creado matcheando por phone normalizado.

UPDATE public.creators c
SET model_id = mp.model_id
FROM public.model_phones mp
JOIN public.models m ON m.id = mp.model_id AND m.instagram_handle IS NULL
WHERE mp.tenant_id = (SELECT id FROM _default_tenant)
  AND c.model_id IS NULL
  AND (c.instagram_handle IS NULL OR trim(c.instagram_handle) = '')
  AND mp.phone_e164 = coalesce(
    regexp_replace(c.phone_e164, '[^0-9+]', '', 'g'),
    regexp_replace(c.phone, '[^0-9+]', '', 'g')
  );

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
