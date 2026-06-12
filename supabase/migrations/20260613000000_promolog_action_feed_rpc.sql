-- get_promolog_action_feed — "brain" del feed de acciones recomendadas de Promolog.
-- Lo consume el Dashboard y (próximamente) el supervisor de WhatsApp de managers.
-- v1 (reglas SQL-limpias):
--   P1 tier_sin_promo: creadora activa Elite/A+ sin ninguna promo HOY.
--   P3 solo_ig: creadora activa que HOY solo promocionó en Instagram (empujar multi-red).
-- (La regla de "baja calidad" depende del dayScore ponderado que hoy vive en el front;
--  se suma cuando el scoring esté server-side.)
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
  active AS (
    SELECT id, coalesce(NULLIF(artistic_name, ''), name) AS name, category, instagram_handle
    FROM creators WHERE status = 'active'
  )
  SELECT 'tier_sin_promo'::text, 1, a.id, a.name, a.category, a.instagram_handle,
         'Tier alto sin promocionar hoy — empujar promo'::text
  FROM active a LEFT JOIN promoted_today p ON p.creator_id = a.id
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
