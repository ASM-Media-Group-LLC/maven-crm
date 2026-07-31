-- Conteo EXACTO de closer_creators por stage, para la tool get_closer_pipeline_status.
--
-- POR QUÉ: la tool contaba los stages iterando un `.limit(200)` ordenado por
-- updated_at, o sea la composición de una MUESTRA. El cierre del día del 30/07
-- publicó "77 Asignadas · 112 Nuevas sin tomar" cuando los totales reales eran
-- 129 y 2.306 — los dos números salían clavados de las 200 filas más recientes.
-- El bug era invisible por closer (una cartera entra entera en 200 filas) y solo
-- mentía en el agregado del equipo, que es justo el que se publica a diario.
--
-- Se hace en SQL y no con N `count: 'exact', head: true` desde la edge porque eso
-- serían 6+ round-trips en una function que ya corre con presupuesto de pared
-- ajustado (MAX_WALL_MS = 30s). Acá es una sola query agregada.
--
-- ⚠️ Nombres de OUT distintos a los de la tabla (stage_name/total, no stage/count):
-- un OUT homónimo de una columna vuelve la referencia ambigua en runtime.
CREATE OR REPLACE FUNCTION public.get_closer_stage_counts(p_assigned_to uuid DEFAULT NULL)
 RETURNS TABLE(stage_name text, total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(nullif(btrim(cc.stage), ''), 'Sin stage') AS stage_name,
         count(*) AS total
  FROM closer_creators cc
  WHERE (p_assigned_to IS NULL OR cc.assigned_to = p_assigned_to)
  GROUP BY 1
  ORDER BY 2 DESC;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_closer_stage_counts(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_closer_stage_counts(uuid) TO authenticated, service_role;
