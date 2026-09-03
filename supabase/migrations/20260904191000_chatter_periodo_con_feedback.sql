-- La nota del período ahora incluye el FEEDBACK DEL TL.
--
-- Se aplica al LEER, por día: `nota_del_dia + puntos_de_ese_dia`, acotado a
-- 1-10 (la escala de la nota). El promedio del período es el promedio de las
-- notas YA ajustadas, que es la única forma en que "un negativo descuenta y un
-- positivo suma" da un número explicable.
--
-- `chatter_daily_score` NO se toca: la sigue recalculando su proceso y el
-- ajuste vive aparte (ver 20260904190000_feedback_tl.sql).
--
-- Se agregan tres columnas al final para que la pantalla pueda mostrar el
-- antes/después sin adivinar: `nota_base_promedio` (sin feedback),
-- `feedback_puntos` (neto del período) y `feedback_n` (cuántos registros).
-- `nota_promedio` pasa a ser la nota FINAL — así todo lo que ya la leía
-- (Rendimiento, el tablero del supervisor) muestra la nota que cuenta.
create or replace function public.chatter_dashboard_periodo(_desde date, _hasta date)
returns table(
  identity_id uuid, display_name text, maven_user_id uuid, activo boolean,
  dias_con_nota integer, dias_del_periodo integer, nota_promedio numeric,
  ventas_total numeric, ventas_esperadas_total numeric, horas_total numeric,
  dias_con_ventas integer, modelos_distintas integer,
  masivos integer, masivos_enviados integer, masivos_vistos integer,
  masivos_comprados integer, masivos_generado numeric,
  nota_base_promedio numeric, feedback_puntos numeric, feedback_n integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  SELECT
    i.id, i.display_name, i.maven_user_id, i.active,
    (SELECT count(*)::integer FROM public.chatter_daily_score s
      WHERE s.identity_id = i.id AND s.dia BETWEEN _desde AND _hasta AND s.nota IS NOT NULL),
    ((_hasta - _desde) + 1)::integer,
    -- Nota FINAL: promedio de las notas del día ya ajustadas por el feedback.
    (SELECT round(avg(least(10, greatest(1, s.nota + coalesce(f.pts, 0)))), 2)
       FROM public.chatter_daily_score s
       LEFT JOIN LATERAL (
         SELECT sum(t.puntos) AS pts FROM public.chatter_tl_feedback t
         WHERE t.identity_id = s.identity_id AND t.dia = s.dia
       ) f ON true
      WHERE s.identity_id = i.id AND s.dia BETWEEN _desde AND _hasta AND s.nota IS NOT NULL),
    (SELECT sum(s.ventas) FROM public.chatter_daily_score s
      WHERE s.identity_id = i.id AND s.dia BETWEEN _desde AND _hasta),
    (SELECT sum(s.ventas_esperadas) FROM public.chatter_daily_score s
      WHERE s.identity_id = i.id AND s.dia BETWEEN _desde AND _hasta),
    (SELECT sum(s.horas) FROM public.chatter_daily_score s
      WHERE s.identity_id = i.id AND s.dia BETWEEN _desde AND _hasta),
    (SELECT count(DISTINCT m.dia)::integer FROM public.chatter_model_daily m
      WHERE m.identity_id = i.id AND m.dia BETWEEN _desde AND _hasta AND m.sales > 0),
    (SELECT count(DISTINCT m.blu_model_id)::integer FROM public.chatter_model_daily m
      WHERE m.identity_id = i.id AND m.dia BETWEEN _desde AND _hasta),
    (SELECT count(*)::integer FROM public.chatter_mass_messages m
      WHERE m.identity_id = i.id AND m.dia BETWEEN _desde AND _hasta),
    (SELECT coalesce(sum(m.sent), 0)::integer FROM public.chatter_mass_messages m
      WHERE m.identity_id = i.id AND m.dia BETWEEN _desde AND _hasta),
    (SELECT coalesce(sum(m.viewed), 0)::integer FROM public.chatter_mass_messages m
      WHERE m.identity_id = i.id AND m.dia BETWEEN _desde AND _hasta),
    (SELECT coalesce(sum(m.purchased), 0)::integer FROM public.chatter_mass_messages m
      WHERE m.identity_id = i.id AND m.dia BETWEEN _desde AND _hasta),
    (SELECT coalesce(sum(m.earnings), 0) FROM public.chatter_mass_messages m
      WHERE m.identity_id = i.id AND m.dia BETWEEN _desde AND _hasta),
    -- Nota BASE (sin feedback), para poder mostrar el antes/después.
    (SELECT round(avg(s.nota), 2) FROM public.chatter_daily_score s
      WHERE s.identity_id = i.id AND s.dia BETWEEN _desde AND _hasta AND s.nota IS NOT NULL),
    -- Neto de puntos del período y cuántos registros lo componen. Cuenta TODO
    -- el feedback del rango, incluso de días sin nota calculada: si el TL
    -- registró algo, se ve.
    (SELECT coalesce(sum(t.puntos), 0) FROM public.chatter_tl_feedback t
      WHERE t.identity_id = i.id AND t.dia BETWEEN _desde AND _hasta),
    (SELECT count(*)::integer FROM public.chatter_tl_feedback t
      WHERE t.identity_id = i.id AND t.dia BETWEEN _desde AND _hasta)
  FROM public.chatter_identity i
  WHERE (
      public.is_in_role_group(auth.uid(), 'supervisor_or_above')
      OR i.maven_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = i.maven_user_id AND ur.role::text = 'Chatter'
    )
  ORDER BY i.active DESC, i.display_name;
$function$;
