-- Autopilot batch con auto-feed: además de los seeds/hashtags
-- explícitos de Settings, agrega:
--   · Top-20 handles high_fit como seeds adicionales (refresh natural
--     del pool de alta calidad — dedup pre-scrape en el worker skipea
--     los <24h sin gastar crédito).
--   · Hasta 10 hashtags minados de las bios de high_fit que NO estaban
--     en Settings (feedback loop: las creadoras buenas usan ciertos
--     hashtags, los usamos para descubrir más como ellas).

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
  v_today_runs  int;
  v_cap         int := 870;
BEGIN
  SELECT paused_reason INTO v_paused
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
    WHERE tenant_id = p_tenant_id AND active = true
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

    -- Auto-feed seeds: top-20 high_fit, los más viejos primero (refresh)
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

    -- Auto-feed hashtags: extraer #tags de bios + names de high_fit
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

    -- Merge + dedup
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

COMMENT ON FUNCTION public.scouter_enqueue_autopilot_batch(uuid) IS
  'Encola batch de discovery para todas las compañías activas del tenant. Combina seeds/hashtags de Settings + AUTO-FEED: top-20 handles high_fit como seeds (refresh natural) + hasta 10 hashtags minados de las bios de high_fit que aún no están en Settings.';
