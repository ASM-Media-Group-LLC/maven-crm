-- `chatter_dashboard_periodo` devolvía CERO filas a los supervisores.
--
-- La función es SECURITY INVOKER y filtra así:
--
--   FROM chatter_identity i
--   WHERE EXISTS (SELECT 1 FROM user_roles ur
--                  WHERE ur.user_id = i.maven_user_id AND ur.role = 'Chatter')
--
-- …y las policies de `user_roles` son "los admins ven todo" + "cada uno ve la
-- suya". Para cualquier no-admin ese EXISTS es FALSE para todos → la función
-- devuelve una tabla vacía, sin error. Con un admin anda, así que el bug no se
-- ve desarrollando. Es exactamente la clase de bug del PR #901 (leer user_roles
-- para armar una lista de personas por rol), esta vez adentro de un RPC.
--
-- Efecto real: **Chatters · Rendimiento estaba vacía para los 7 supervisores**
-- (Chatter Supervisor, HHRR, Team Leader) desde que existe, y el tablero nuevo
-- del supervisor heredó el mismo cero — que es como Jhon lo encontró.
--
-- ARREGLO: SECURITY DEFINER (para que el EXISTS sobre user_roles lo evalúe el
-- dueño) + guarda adentro con el MISMO predicado que la RLS de las tablas que
-- lee (`chatter_daily_score`, `chatter_model_daily`: supervisor_or_above o la
-- propia fila). No abre nada nuevo: quien pasa la guarda ya podía leer esas
-- tablas directo. Si la guarda no pasa, devuelve cero filas, igual que antes.
--
-- NO se cambia el criterio de QUIÉNES entran a la lista: sigue siendo "tiene
-- rol Chatter en Maven" (20 personas). Se evaluó usar `chatter_identity.is_chatter`
-- —que sí es legible por todos— pero marca 57 de 58 identidades (37 son de BLU
-- sin usuario de Maven): habría cambiado la lista también para el admin.
create or replace function public.chatter_dashboard_periodo(_desde date, _hasta date)
returns table(
  identity_id uuid, display_name text, maven_user_id uuid, activo boolean,
  dias_con_nota integer, dias_del_periodo integer, nota_promedio numeric,
  ventas_total numeric, ventas_esperadas_total numeric, horas_total numeric,
  dias_con_ventas integer, modelos_distintas integer,
  masivos integer, masivos_enviados integer, masivos_vistos integer,
  masivos_comprados integer, masivos_generado numeric
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
    (SELECT round(avg(s.nota), 2) FROM public.chatter_daily_score s
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
      WHERE m.identity_id = i.id AND m.dia BETWEEN _desde AND _hasta)
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
