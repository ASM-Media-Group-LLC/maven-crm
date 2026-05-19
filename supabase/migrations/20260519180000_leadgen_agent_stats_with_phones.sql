-- Extender leadgen_agent_stats para incluir `phones` — teléfonos
-- registrados por cada agente en el rango. Misma definición que el
-- reporte programado de LLGs: contamos rows en closers_contacts donde
-- created_by = agent_id, phone IS NOT NULL, y created_at cae en el rango.
--
-- El filtro de fechas se aplica con boundaries de día completo: el rango
-- conceptualmente es [d_from 00:00, d_to 23:59:59.999] — para no perder
-- contactos creados en las últimas horas del último día.
--
-- Shape devuelta (espejo del antiguo + nuevo campo):
--   { [user_id]: { total, byQuality, firstLead, phones } }

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
    SELECT lg_user_id, quality, created_at
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
           MIN(created_at) AS first_lead
    FROM filtered
    GROUP BY lg_user_id
  ),
  phones AS (
    -- Teléfonos por agente en el rango. Mismo criterio que send-report:
    -- created_by = agente, phone NOT NULL, created_at en rango.
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
  -- Union de agentes con leads Y/O phones — un agente que sólo registró
  -- phones pero no creó leads en el rango también debe aparecer.
  all_agents AS (
    SELECT lg_user_id FROM totals
    UNION
    SELECT lg_user_id FROM phones
  )
  SELECT COALESCE(
    jsonb_object_agg(
      a.lg_user_id::text,
      jsonb_build_object(
        'total',     COALESCE(t.total, 0),
        'byQuality', COALESCE(paq.by_quality, '{}'::jsonb),
        'firstLead', t.first_lead,
        'phones',    COALESCE(ph.phones_count, 0)
      )
    ),
    '{}'::jsonb
  )
  FROM all_agents a
  LEFT JOIN totals t ON t.lg_user_id = a.lg_user_id
  LEFT JOIN per_agent_quality paq ON paq.lg_user_id = a.lg_user_id
  LEFT JOIN phones ph ON ph.lg_user_id = a.lg_user_id;
$function$;
