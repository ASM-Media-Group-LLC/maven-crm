-- get_promolog_action_feed v2 — no marcar "sin promocionar" a creadoras que NO
-- pudimos leer. Antes, tier_sin_promo = Elite/A+ activa SIN promo confirmada hoy;
-- eso contaba como "no promocionó" a las que el scraper no pudo leer (proxy 504 /
-- IG 401 / sin datos) → falsos positivos que se filtraban al digest de managers y
-- al Dashboard. Ahora solo se marca a las que SÍ leímos con éxito hoy (contenido
-- real, error_reason distinto de 'scrape_no_media') y aun así no promocionaron.
-- Mismo criterio que el fix #818 (story_count=0 = "sin datos", no "no promocionó").
CREATE OR REPLACE FUNCTION public.get_promolog_action_feed(p_tenant uuid)
RETURNS TABLE (
  kind text, priority int, creator_id uuid, name text, category text, instagram_handle text, reason text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH promoted_today AS (
    SELECT creator_id, array_agg(DISTINCT lower(network)) AS nets
    FROM promolog_entries
    WHERE tenant_id = p_tenant AND date::date = current_date
      AND promoted IN ('true', 'yes') AND creator_id IS NOT NULL
    GROUP BY creator_id
  ),
  -- Creadoras LEÍDAS con éxito hoy (vimos contenido real). Excluye las "sin datos"
  -- (scrape_no_media / story_count=0): no se puede afirmar que NO promocionaron si
  -- ni siquiera se pudieron leer.
  read_today AS (
    SELECT DISTINCT creator_id
    FROM promolog_entries
    WHERE tenant_id = p_tenant AND date::date = current_date
      AND creator_id IS NOT NULL
      AND coalesce(error_reason, '') <> 'scrape_no_media'
      AND coalesce(story_count, 0) > 0
  ),
  active AS (
    SELECT id, coalesce(NULLIF(artistic_name, ''), name) AS name, category, instagram_handle
    FROM creators WHERE status = 'active'
  )
  SELECT 'tier_sin_promo'::text, 1, a.id, a.name, a.category, a.instagram_handle,
         'Tier alto sin promocionar hoy — empujar promo'::text
  FROM active a
    JOIN read_today r ON r.creator_id = a.id
    LEFT JOIN promoted_today p ON p.creator_id = a.id
  WHERE a.category IN ('Elite', 'A+') AND p.creator_id IS NULL
  UNION ALL
  SELECT 'solo_ig'::text, 3, a.id, a.name, a.category, a.instagram_handle,
         'Solo promociona en IG hoy — empujar otra red'::text
  FROM active a JOIN promoted_today p ON p.creator_id = a.id
  WHERE p.nets = ARRAY['instagram']
  ORDER BY 2, 4;
$$;

GRANT EXECUTE ON FUNCTION public.get_promolog_action_feed(uuid) TO authenticated, service_role, anon;
NOTIFY pgrst, 'reload schema';
