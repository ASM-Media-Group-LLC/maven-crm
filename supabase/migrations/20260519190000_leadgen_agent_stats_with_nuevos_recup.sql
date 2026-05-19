-- Extender leadgen_agent_stats con `nuevos` y `recuperacion` (record_type)
-- Mismo criterio que el reporte programado de LLGs:
--   record_type = 'reactivado'  → recuperacion
--   otro / NULL                  → nuevos
--
-- Shape devuelta (espejo del anterior + 2 campos):
--   { [user_id]: { total, byQuality, firstLead, phones, nuevos, recuperacion } }

CREATE OR REPLACE FUNCTION public.leadgen_agent_stats(
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH filtered AS (
    SELECT lg_user_id, quality, created_at, record_type
    FROM public.leadgen_entries
    WHERE (p_date_from IS NULL OR p_date_to IS NULL
           OR entry_date BETWEEN p_date_from AND p_date_to)
      AND lg_user_id IS NOT NULL
  ),
  agent_quality_counts AS (
    SELECT lg_user_id,
           COALESCE(LOWER(quality), 'c') AS ql,
           COUNT(*) AS ct
    FROM filtered
    GROUP BY lg_user_id, COALESCE(LOWER(quality), 'c')
  ),
  per_agent_quality AS (
    SELECT lg_user_id,
           jsonb_object_agg(ql, ct) AS by_quality
    FROM agent_quality_counts
    GROUP BY lg_user_id
  ),
  totals AS (
    SELECT lg_user_id,
           COUNT(*) AS total,
           MIN(created_at) AS first_lead,
           -- Mismo split que send-report.fetchLlgMetrics
           COUNT(*) FILTER (WHERE record_type = 'reactivado') AS recuperacion,
           COUNT(*) FILTER (WHERE record_type <> 'reactivado' OR record_type IS NULL) AS nuevos
    FROM filtered
    GROUP BY lg_user_id
  ),
  phones AS (
    SELECT cc.created_by AS lg_user_id,
           COUNT(*) AS phones_count
    FROM public.closers_contacts cc
    WHERE cc.phone IS NOT NULL
      AND cc.phone <> ''
      AND (
        p_date_from IS NULL OR p_date_to IS NULL
        OR (cc.created_at >= p_date_from::timestamptz
            AND cc.created_at < (p_date_to + 1)::timestamptz)
      )
      AND cc.created_by IS NOT NULL
    GROUP BY cc.created_by
  ),
  all_agents AS (
    SELECT lg_user_id FROM totals
    UNION
    SELECT lg_user_id FROM phones
  )
  SELECT COALESCE(
    jsonb_object_agg(
      a.lg_user_id::text,
      jsonb_build_object(
        'total',        COALESCE(t.total, 0),
        'byQuality',    COALESCE(paq.by_quality, '{}'::jsonb),
        'firstLead',    t.first_lead,
        'phones',       COALESCE(ph.phones_count, 0),
        'nuevos',       COALESCE(t.nuevos, 0),
        'recuperacion', COALESCE(t.recuperacion, 0)
      )
    ),
    '{}'::jsonb
  )
  FROM all_agents a
  LEFT JOIN totals t ON t.lg_user_id = a.lg_user_id
  LEFT JOIN per_agent_quality paq ON paq.lg_user_id = a.lg_user_id
  LEFT JOIN phones ph ON ph.lg_user_id = a.lg_user_id;
$function$;
