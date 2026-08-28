-- Resumen del periodo por chatter, para la tabla principal del dashboard.
--
-- Va como RPC y no como consultas sueltas desde el front por dos razones: el
-- promedio del periodo debe calcularse sobre los dias CON nota (promediar
-- tratando los dias sin dato como cero seria el mismo error que ya se corrigio
-- en el calculo diario), y porque PostgREST corta a 1000 filas — con 42
-- chatters x 30 dias eso ya se pasa y el promedio saldria de una muestra.

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
  WHERE i.is_chatter
  ORDER BY i.active DESC, i.display_name;
$$;

COMMENT ON FUNCTION public.chatter_dashboard_periodo(date, date) IS
  'Resumen por chatter de un periodo. El promedio se toma sobre los dias CON nota; dias_con_nota vs dias_del_periodo dice sobre cuanto se calculo, para que la pantalla no presente un promedio de 2 dias como si fuera del mes. SECURITY INVOKER: respeta las RLS de cada tabla.';

-- Cobertura del periodo: cuantos dias tienen el cruce chatter-modelo traido.
-- Es lo que le permite a la pantalla distinguir "no trabajo" de "no lo tenemos".
CREATE OR REPLACE FUNCTION public.chatter_dashboard_cobertura(_desde date, _hasta date)
RETURNS TABLE (dia date, modelos_traidos integer, chatters_con_actividad integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT d::date,
         (SELECT count(*)::integer FROM public.chatter_model_daily_sync s WHERE s.dia = d::date),
         (SELECT count(DISTINCT c.identity_id)::integer FROM public.chatter_model_daily c WHERE c.dia = d::date)
  FROM generate_series(_desde, _hasta, '1 day') d
  ORDER BY 1;
$$;
