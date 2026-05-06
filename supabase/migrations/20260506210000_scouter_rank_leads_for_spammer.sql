-- Ranking SQL para scouter-generate-tasks. Reemplaza el path JS-fallback
-- + agrega EXCLUSIÓN cross-spammer:
--
-- Bug previo: rankLeads() en el edge function recibía solo tenant_id.
-- Si el tenant tenía varios spammers, los 3 podían recibir el MISMO
-- lead el mismo día. La rúbrica/cooldown filtraban si el lead había
-- sido asignado al MISMO spammer recientemente, pero no si lo había
-- recibido OTRO spammer.
--
-- Esta función:
--   1. Filtra leads candidate/discovery/contacting con ai_status válido.
--   2. Excluye leads asignados a CUALQUIER spammer del tenant en los
--      últimos `p_cooldown_days` días — eso es lo que da la dedupción
--      cross-spammer real.
--   3. Mantiene el composite rank_score (ai_score + recency + interactions
--      + status weight) que ya estaba en el edge function.
--
-- El edge function actualizado pasa p_spammer_id; lo guardamos en la
-- firma aunque hoy no se use para filtrar (todos los spammers comparten
-- pool y la dedupción es global), por si en el futuro queremos asignar
-- subsets por nicho.

CREATE OR REPLACE FUNCTION public.scouter_rank_leads_for_spammer(
  p_tenant_id    uuid,
  p_spammer_id   uuid,
  p_cooldown_days int DEFAULT 3,
  p_batch_size   int DEFAULT 50
)
RETURNS TABLE (
  id                   uuid,
  instagram_handle     text,
  ai_score             numeric,
  followers            int,
  bio                  text,
  country              text,
  status               text,
  interaction_count    bigint,
  days_since_assigned  int,
  rank_score           numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH lead_scores AS (
    SELECT
      l.id,
      l.instagram_handle,
      l.ai_score::numeric AS ai_score,
      l.followers,
      l.bio,
      l.country,
      l.status::text AS status,
      COUNT(DISTINCT ih.id)::bigint AS interaction_count,
      COALESCE(
        (CURRENT_DATE - MAX(da.assigned_date)::date)::int,
        999
      ) AS days_since_assigned,
      (
        COALESCE(l.ai_score, 0) * 10
        + LEAST(COALESCE((CURRENT_DATE - MAX(da.assigned_date)::date)::int, 30), 30)
        - COUNT(DISTINCT ih.id) * 2
        + CASE l.status::text
            WHEN 'candidate'  THEN 15
            WHEN 'discovery'  THEN 10
            WHEN 'contacting' THEN 5
            ELSE 0
          END
      )::numeric AS rank_score
    FROM public.scouter_leads l
    LEFT JOIN public.scouter_daily_assignments da ON da.lead_id = l.id
    LEFT JOIN public.scouter_interaction_history ih ON ih.lead_id = l.id
    WHERE l.tenant_id = p_tenant_id
      AND l.ai_status::text IN ('high_fit', 'medium_fit', 'approved')
      AND l.status::text NOT IN ('active', 'rejected', 'discarded')
    GROUP BY l.id
    HAVING COALESCE((CURRENT_DATE - MAX(da.assigned_date)::date)::int, 999) >= p_cooldown_days
  ),
  -- Cross-spammer dedup: excluye leads que tienen daily_assignments
  -- abiertos (status != 'completed') de cualquier spammer del tenant en
  -- los últimos cooldown_days. Esto evita que dos spammers reciban el
  -- mismo perfil para interactuar el mismo día.
  cross_blocked AS (
    SELECT DISTINCT da.lead_id
    FROM public.scouter_daily_assignments da
    WHERE da.tenant_id = p_tenant_id
      AND da.assigned_date >= CURRENT_DATE - p_cooldown_days
  )
  SELECT ls.*
  FROM lead_scores ls
  WHERE ls.id NOT IN (SELECT lead_id FROM cross_blocked)
  ORDER BY ls.rank_score DESC
  LIMIT p_batch_size;
END;
$$;

REVOKE ALL ON FUNCTION public.scouter_rank_leads_for_spammer(uuid, uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scouter_rank_leads_for_spammer(uuid, uuid, int, int) TO service_role;

-- Drop old name si existe — lo dejamos por si alguien lo consulta vía
-- /rest/v1/rpc/scouter_rank_leads.
DROP FUNCTION IF EXISTS public.scouter_rank_leads(uuid, int, int);
