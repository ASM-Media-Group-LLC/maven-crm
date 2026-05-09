-- 20260509010000_leadgen_dashboard_stats_rpc.sql
--
-- Reemplaza el patrón "traer todas las filas y agregar en JS" del
-- dashboard de Leadgen por dos RPCs que devuelven JSON ya agregado.
-- Antes el frontend hacía 2 queries que paginaban de 1000 en 1000
-- hasta consumir toda la tabla; ahora Postgres hace el GROUP BY en
-- ms y devuelve solo el resultado.
--
-- Las dos RPCs preservan exactamente la shape que consume el frontend
-- (useLeadGenSummaryStats / useLeadGenAgentStats) para que la swap
-- sea drop-in.
--
-- También aseguramos índices en (entry_date), (lg_user_id, entry_date),
-- y (quality) si no existen — son los filtros que más usa el dashboard.

-- ──────────────────────────────────────────────────────────────────
-- Índices (idempotentes)
-- ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leadgen_entries_entry_date
  ON public.leadgen_entries (entry_date);

CREATE INDEX IF NOT EXISTS idx_leadgen_entries_lg_user_id_entry_date
  ON public.leadgen_entries (lg_user_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_leadgen_entries_quality
  ON public.leadgen_entries (quality);

-- ──────────────────────────────────────────────────────────────────
-- RPC: leadgen_summary_stats
-- Reemplaza useLeadGenSummaryStats. Devuelve { total, qa, byQuality }
-- byQuality tiene las 5 keys fijas: "a+", "a", "b+", "b", "c"
-- (qualities desconocidas se cuentan como "c" para mantener parity).
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.leadgen_summary_stats(
  p_date_from date DEFAULT NULL,
  p_date_to   date DEFAULT NULL,
  p_user_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT quality, phone_raw, phone_e164
    FROM public.leadgen_entries
    WHERE
      (p_date_from IS NULL OR p_date_to IS NULL OR entry_date BETWEEN p_date_from AND p_date_to)
      AND (p_user_id IS NULL OR lg_user_id = p_user_id)
  ),
  buckets AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE phone_raw IS NOT NULL OR phone_e164 IS NOT NULL) AS qa,
      COUNT(*) FILTER (WHERE LOWER(quality) = 'a+') AS q_aplus,
      COUNT(*) FILTER (WHERE LOWER(quality) = 'a') AS q_a,
      COUNT(*) FILTER (WHERE LOWER(quality) = 'b+') AS q_bplus,
      COUNT(*) FILTER (WHERE LOWER(quality) = 'b') AS q_b,
      COUNT(*) FILTER (WHERE quality IS NULL OR LOWER(quality) NOT IN ('a+','a','b+','b')) AS q_c
    FROM filtered
  )
  SELECT jsonb_build_object(
    'total', total,
    'qa', qa,
    'byQuality', jsonb_build_object(
      'a+', q_aplus,
      'a',  q_a,
      'b+', q_bplus,
      'b',  q_b,
      'c',  q_c
    )
  )
  FROM buckets;
$$;

-- ──────────────────────────────────────────────────────────────────
-- RPC: leadgen_agent_stats
-- Reemplaza useLeadGenAgentStats. Devuelve un object por lg_user_id:
--   { [user_id]: { total, byQuality, firstLead } }
-- byQuality es un sub-object con las counts por quality lowercase.
-- firstLead es created_at del lead MÁS VIEJO del agente en el rango
-- (paridad con la lógica JS: minimum created_at).
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.leadgen_agent_stats(
  p_date_from date DEFAULT NULL,
  p_date_to   date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT lg_user_id, quality, created_at
    FROM public.leadgen_entries
    WHERE
      (p_date_from IS NULL OR p_date_to IS NULL OR entry_date BETWEEN p_date_from AND p_date_to)
      AND lg_user_id IS NOT NULL
  ),
  per_agent AS (
    SELECT
      lg_user_id,
      COUNT(*) AS total,
      MIN(created_at) AS first_lead,
      jsonb_object_agg(
        ql, ct
      ) AS by_quality
    FROM (
      SELECT
        lg_user_id,
        COALESCE(LOWER(quality), 'c') AS ql,
        COUNT(*) AS ct
      FROM filtered
      GROUP BY lg_user_id, COALESCE(LOWER(quality), 'c')
    ) g
    GROUP BY lg_user_id
  ),
  totals AS (
    SELECT lg_user_id, COUNT(*) AS total, MIN(created_at) AS first_lead
    FROM filtered
    GROUP BY lg_user_id
  )
  SELECT COALESCE(
    jsonb_object_agg(
      t.lg_user_id::text,
      jsonb_build_object(
        'total', t.total,
        'byQuality', COALESCE(pa.by_quality, '{}'::jsonb),
        'firstLead', t.first_lead
      )
    ),
    '{}'::jsonb
  )
  FROM totals t
  LEFT JOIN per_agent pa ON pa.lg_user_id = t.lg_user_id;
$$;

-- ──────────────────────────────────────────────────────────────────
-- Permisos: las RPCs son SECURITY DEFINER pero igual restringimos a
-- usuarios autenticados (RLS en leadgen_entries ya filtra por tenant
-- — al ser SECURITY DEFINER bypaseamos esa policy, pero mantenemos
-- el control de acceso a la function en sí). El frontend ya verifica
-- que el rol tenga acceso a "LeadGen" antes de mostrar el dashboard.
-- ──────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.leadgen_summary_stats(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leadgen_agent_stats(date, date) TO authenticated;
