-- El dashboard lista solo a quien tiene el rol Chatter EN MAVEN.
--
-- Antes salia cualquiera con cuenta en BLU que no fuera owner (`is_chatter` se
-- derivaba de eso), y ahi caen managers, supervisores y gente de otras areas
-- que tiene acceso a BLU sin ser chatter. La fuente de verdad de que hace cada
-- quien es el rol en Maven, no el acceso a una herramienta.
--
-- Se filtra en la LECTURA y no en el calculo: las notas se siguen guardando
-- para todos, asi que si a alguien le corrigen el rol manana su historial ya
-- esta ahi y no arranca en blanco.
--
-- 'Chatter Supervisor' NO entra: supervisa, no chatea. Si se quisiera incluir,
-- va aca y no repartido por la pantalla.

CREATE OR REPLACE FUNCTION public.chatter_dashboard_periodo(_desde date, _hasta date)
RETURNS TABLE (
  identity_id uuid, display_name text, maven_user_id uuid, activo boolean,
  dias_con_nota integer, dias_del_periodo integer, nota_promedio numeric,
  ventas_total numeric, ventas_esperadas_total numeric, horas_total numeric,
  dias_con_ventas integer, modelos_distintas integer,
  masivos integer, masivos_enviados integer, masivos_vistos integer,
  masivos_comprados integer, masivos_generado numeric
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT
    i.id, i.display_name, i.maven_user_id, i.active,
    (SELECT count(*)::integer FROM public.chatter_daily_score s
      WHERE s.identity_id = i.id AND s.dia BETWEEN _desde AND _hasta AND s.nota IS NOT NULL),
    ((_hasta - _desde) + 1)::integer,
    (SELECT round(avg(s.nota), 2) FROM public.chatter_daily_score s
      WHERE s.identity_id = i.id AND s.dia BETWEEN _desde AND _hasta AND s.nota IS NOT NULL),
    (SELECT sum(s.ventas) FROM public.chatter_daily_score s
      WHERE s.identity_id = i.id AND s.dia BETWEEN _desde AND _hasta),
    (SELECT sum(s.ventas_esperadas) FROM public.chatter_daily_score s
      WHERE s.identity_id = i.id AND s.dia BETWEEN _desde AND _hasta),
    (SELECT round(sum(s.horas), 1) FROM public.chatter_daily_score s
      WHERE s.identity_id = i.id AND s.dia BETWEEN _desde AND _hasta),
    (SELECT count(*)::integer FROM public.chatter_daily_score s
      WHERE s.identity_id = i.id AND s.dia BETWEEN _desde AND _hasta AND s.ventas IS NOT NULL),
    (SELECT count(DISTINCT c.blu_model_id)::integer FROM public.chatter_model_daily c
      WHERE c.identity_id = i.id AND c.dia BETWEEN _desde AND _hasta),
    (SELECT count(*)::integer FROM public.chatter_mass_messages m
      WHERE m.identity_id = i.id AND m.dia BETWEEN _desde AND _hasta),
    (SELECT coalesce(sum(m.sent), 0)::integer FROM public.chatter_mass_messages m
      WHERE m.identity_id = i.id AND m.dia BETWEEN _desde AND _hasta),
    (SELECT coalesce(sum(m.viewed), 0)::integer FROM public.chatter_mass_messages m
      WHERE m.identity_id = i.id AND m.dia BETWEEN _desde AND _hasta),
    (SELECT coalesce(sum(m.purchased), 0)::integer FROM public.chatter_mass_messages m
      WHERE m.identity_id = i.id AND m.dia BETWEEN _desde AND _hasta),
    (SELECT coalesce(sum(m.earnings), 0) FROM public.chatter_mass_messages m
      WHERE m.identity_id = i.id AND m.dia BETWEEN _desde AND _hasta)
  FROM public.chatter_identity i
  WHERE EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = i.maven_user_id AND ur.role::text = 'Chatter'
  )
  ORDER BY i.active DESC, i.display_name;
$$;

COMMENT ON FUNCTION public.chatter_dashboard_periodo(date, date) IS
  'Resumen por chatter de un periodo. Lista SOLO a quien tiene el rol Chatter en Maven — el acceso a BLU no alcanza, ahi hay managers y otras areas. El promedio se toma sobre los dias CON nota; dias_con_nota vs dias_del_periodo dice sobre cuanto se calculo. SECURITY INVOKER: respeta las RLS de cada tabla.';
