-- Router cross-compañía. Para cada compañía activa del tenant,
-- decide cuán bien matchea el lead usando:
--   1. HARD FILTERS — descartan la compañía si no aplica:
--      · target_countries seteado Y lead.country no está en la lista.
--      · followers_max/min seteado Y lead.followers fuera de rango.
--   2. SIMILARITY SCORE:
--      · Embedding (lead.embedding existe + compañía tiene seeds con
--        embedding): cosine similarity vs el mejor seed.
--      · Heurística keyword (fallback): bio_keywords - 2×exclude_keywords
--        normalizado por # total de keywords de la compañía.
--
-- El worker llama el RPC después del scoring y aplica:
--   · company_id = primer row (best match).
--   · target_companies = slugs con score >= 0.55.
-- Si todos los scores son 0 o negativos, mantiene company_id actual.

CREATE OR REPLACE FUNCTION public.scouter_route_lead(p_lead_id uuid)
RETURNS TABLE(
  company_id   uuid,
  company_slug text,
  score        numeric,
  method       text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant     uuid;
  v_emb        vector(768);
  v_bio        text;
  v_name       text;
  v_followers  int;
  v_country    text;
BEGIN
  SELECT tenant_id, embedding, bio, name, followers, country
  INTO v_tenant, v_emb, v_bio, v_name, v_followers, v_country
  FROM scouter_leads
  WHERE id = p_lead_id;

  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH companies AS (
    SELECT c.id, c.slug, c.search_config
    FROM scouter_companies c
    WHERE c.tenant_id = v_tenant AND c.active = true
  ),
  filtered AS (
    SELECT *
    FROM companies c
    WHERE
      (COALESCE((c.search_config->>'followers_max')::int, 999999999) >= COALESCE(v_followers, 0))
      AND (COALESCE((c.search_config->>'followers_min')::int, 0) <= COALESCE(v_followers, 999999999))
      AND (
        c.search_config->'target_countries' IS NULL
        OR jsonb_array_length(c.search_config->'target_countries') = 0
        OR v_country IS NULL
        OR (c.search_config->'target_countries') @> to_jsonb(v_country)
      )
  ),
  emb_scores AS (
    SELECT
      f.id AS company_id,
      f.slug AS company_slug,
      MAX(1 - (s.embedding <=> v_emb))::numeric AS sim
    FROM filtered f
    LEFT JOIN scouter_leads s
      ON s.company_id = f.id
      AND s.embedding IS NOT NULL
      AND (s.discovery_source LIKE 'seed:%' OR s.manual_company_assignment = true)
      AND s.id <> p_lead_id
    WHERE v_emb IS NOT NULL
    GROUP BY f.id, f.slug
  ),
  kw_scores AS (
    SELECT
      f.id AS company_id,
      f.slug AS company_slug,
      (
        (
          SELECT COUNT(*)::numeric
          FROM jsonb_array_elements_text(
            COALESCE(f.search_config->'bio_keywords', '[]'::jsonb)
          ) AS kw
          WHERE COALESCE(v_bio, '') || ' ' || COALESCE(v_name, '') ILIKE '%' || kw || '%'
        )
        -
        2 * (
          SELECT COUNT(*)::numeric
          FROM jsonb_array_elements_text(
            COALESCE(f.search_config->'exclude_keywords', '[]'::jsonb)
          ) AS kw
          WHERE COALESCE(v_bio, '') || ' ' || COALESCE(v_name, '') ILIKE '%' || kw || '%'
        )
      ) /
      GREATEST(
        jsonb_array_length(COALESCE(f.search_config->'bio_keywords', '[]'::jsonb)) +
        jsonb_array_length(COALESCE(f.search_config->'exclude_keywords', '[]'::jsonb)),
        1
      ) AS sim
    FROM filtered f
  ),
  combined AS (
    SELECT
      f.id AS company_id,
      f.slug AS company_slug,
      CASE
        WHEN e.sim IS NOT NULL AND e.sim > 0 THEN e.sim
        ELSE GREATEST(k.sim, 0)
      END AS score,
      CASE
        WHEN e.sim IS NOT NULL AND e.sim > 0 THEN 'embedding'
        ELSE 'keywords'
      END AS method
    FROM filtered f
    LEFT JOIN emb_scores e ON e.company_id = f.id
    LEFT JOIN kw_scores k ON k.company_id = f.id
  )
  SELECT c.company_id, c.company_slug, c.score::numeric(4, 3), c.method
  FROM combined c
  ORDER BY c.score DESC NULLS LAST, c.company_slug;
END;
$$;

COMMENT ON FUNCTION public.scouter_route_lead(uuid) IS
  'Rankea compañías activas del tenant por fit con el lead. Hard filters: target_countries, followers_min/max. Score: embedding cosine vs seeds (si hay) o heurística bio_keywords - exclude_keywords (fallback). El worker usa la primera fila como company_id y entradas con score>=0.55 como target_companies.';
