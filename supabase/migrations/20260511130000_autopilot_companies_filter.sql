-- Companies scope para el autopilot. NULL = todas las compañías
-- activas (comportamiento anterior). Array = solo esas IDs.
-- Antes el RPC iteraba TODAS las activas, ignorando el picker del
-- frontend que vivía en localStorage.

ALTER TABLE public.scouter_autopilot
  ADD COLUMN IF NOT EXISTS companies_filter uuid[];

COMMENT ON COLUMN public.scouter_autopilot.companies_filter IS
  'NULL = el autopilot busca para todas las compañías activas. Array = solo esas IDs (refleja el picker del frontend).';

-- RPC: respeta companies_filter cuando filtra compañías a iterar.
CREATE OR REPLACE FUNCTION public.scouter_enqueue_autopilot_batch(p_tenant_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count       int := 0;
  v_company     record;
  v_seeds       text[];
  v_hashtags    text[];
  v_high_fit_seeds text[];
  v_mined_tags  text[];
  v_tag         text;
  v_paused      text;
  v_filter      uuid[];
  v_today_runs  int;
  v_cap         int := 870;
BEGIN
  SELECT paused_reason, companies_filter
  INTO v_paused, v_filter
  FROM scouter_autopilot
  WHERE tenant_id = p_tenant_id;
  IF v_paused = 'budget' THEN RETURN 0; END IF;

  SELECT runs_count INTO v_today_runs
  FROM scouter_apify_budget
  WHERE day = CURRENT_DATE AND tenant_id = p_tenant_id;
  IF COALESCE(v_today_runs, 0) >= v_cap THEN
    UPDATE scouter_autopilot
    SET paused_reason = 'budget', paused_at = NOW(), updated_at = NOW()
    WHERE tenant_id = p_tenant_id;
    RETURN 0;
  END IF;

  FOR v_company IN
    SELECT id, name, search_config
    FROM scouter_companies
    WHERE tenant_id = p_tenant_id
      AND active = true
      AND (v_filter IS NULL OR id = ANY(v_filter))
  LOOP
    SELECT array_agg(DISTINCT lower(regexp_replace(trim(value), '^[@#]+', '')))
    INTO v_seeds
    FROM jsonb_array_elements_text(
      COALESCE(v_company.search_config->'seed_accounts', '[]'::jsonb)
    ) AS t(value)
    WHERE trim(value) <> '';

    SELECT array_agg(DISTINCT lower(regexp_replace(trim(value), '^[@#]+', '')))
    INTO v_hashtags
    FROM jsonb_array_elements_text(
      COALESCE(v_company.search_config->'hashtags', '[]'::jsonb)
    ) AS t(value)
    WHERE trim(value) <> '';

    SELECT array_agg(DISTINCT lower(instagram_handle))
    INTO v_high_fit_seeds
    FROM (
      SELECT instagram_handle
      FROM scouter_leads
      WHERE tenant_id = p_tenant_id
        AND company_id = v_company.id
        AND ai_status = 'high_fit'
        AND COALESCE(ai_score, 0) >= 7
      ORDER BY updated_at ASC
      LIMIT 20
    ) sub;

    SELECT array_agg(DISTINCT tag_lower)
    INTO v_mined_tags
    FROM (
      SELECT lower(substring(match[1] FROM 2)) AS tag_lower
      FROM scouter_leads
      CROSS JOIN LATERAL regexp_matches(
        COALESCE(bio, '') || ' ' || COALESCE(name, ''),
        '(#[A-Za-z0-9_]{3,30})',
        'g'
      ) AS match
      WHERE tenant_id = p_tenant_id
        AND company_id = v_company.id
        AND ai_status = 'high_fit'
        AND COALESCE(ai_score, 0) >= 7
    ) mined
    WHERE NOT (v_hashtags @> ARRAY[tag_lower])
    LIMIT 10;

    v_seeds := COALESCE(v_seeds, ARRAY[]::text[]) ||
               COALESCE(v_high_fit_seeds, ARRAY[]::text[]);
    SELECT array_agg(DISTINCT s) INTO v_seeds FROM unnest(v_seeds) s;

    v_hashtags := COALESCE(v_hashtags, ARRAY[]::text[]) ||
                  COALESCE(v_mined_tags, ARRAY[]::text[]);
    SELECT array_agg(DISTINCT s) INTO v_hashtags FROM unnest(v_hashtags) s;

    IF v_seeds IS NOT NULL AND array_length(v_seeds, 1) > 0 THEN
      INSERT INTO scouter_jobs (kind, status, tenant_id, company_id, payload, priority)
      VALUES (
        'discover_seed', 'queued', p_tenant_id, v_company.id,
        jsonb_build_object('seeds', to_jsonb(v_seeds), 'maxLeads', array_length(v_seeds, 1)),
        7
      );
      v_count := v_count + 1;
    END IF;

    IF v_hashtags IS NOT NULL THEN
      FOREACH v_tag IN ARRAY v_hashtags LOOP
        INSERT INTO scouter_jobs (kind, status, tenant_id, company_id, payload, priority)
        VALUES (
          'discover_hashtag', 'queued', p_tenant_id, v_company.id,
          jsonb_build_object('hashtag', v_tag, 'maxLeads', 30),
          7
        );
        v_count := v_count + 1;
      END LOOP;
    END IF;
  END LOOP;

  UPDATE scouter_autopilot
  SET last_tick_at = NOW(),
      updated_at = NOW(),
      paused_reason = CASE
        WHEN v_count > 0 AND paused_reason IS DISTINCT FROM 'budget' THEN NULL
        ELSE paused_reason
      END
  WHERE tenant_id = p_tenant_id;

  RETURN v_count;
END;
$$;

DROP FUNCTION IF EXISTS public.scouter_autopilot_state();
CREATE OR REPLACE FUNCTION public.scouter_autopilot_state()
RETURNS TABLE (
  active boolean,
  paused_reason text,
  paused_at timestamptz,
  last_tick_at timestamptz,
  companies_filter uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  INSERT INTO scouter_autopilot (tenant_id, active)
  VALUES (v_tenant, true)
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN QUERY
  SELECT sa.active, sa.paused_reason, sa.paused_at, sa.last_tick_at, sa.companies_filter
  FROM scouter_autopilot sa
  WHERE sa.tenant_id = v_tenant;
END;
$$;
