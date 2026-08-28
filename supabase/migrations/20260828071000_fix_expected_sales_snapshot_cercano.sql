-- La vara de un dia sale de las modelos asignadas ESE dia. Pero el snapshot de
-- asignaciones empezo a capturarse hoy: para cualquier dia anterior no hay fila,
-- y sin vara no hay nota de ventas. Sin esto, todo el historico —justo los
-- promedios de 15 y 30 dias que se piden en la pantalla— queda vacio hasta
-- dentro de un mes.
--
-- Se usa el snapshot mas cercano: el ultimo en <= _dia y, si el dia es anterior
-- a que empezaramos a capturar, el primero que exista. Es una aproximacion, y
-- por eso la funcion hermana devuelve DE QUE DIA salio la asignacion: la
-- pantalla puede marcar esos dias como estimados en vez de presentarlos como si
-- fueran medidos.

CREATE OR REPLACE FUNCTION public.chatter_assignment_day(_identity uuid, _dia date)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT max(dia) FROM public.chatter_creator_assignment_daily
      WHERE identity_id = _identity AND dia <= _dia),
    (SELECT min(dia) FROM public.chatter_creator_assignment_daily
      WHERE identity_id = _identity)
  );
$$;

COMMENT ON FUNCTION public.chatter_assignment_day(uuid, date) IS
  'De que dia se tomo la asignacion de modelos para evaluar _dia. Si es distinto de _dia, la vara es estimada y la pantalla debe decirlo.';

CREATE OR REPLACE FUNCTION public.chatter_expected_sales(_identity uuid, _dia date, _dias integer DEFAULT 30)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH modelos AS (
    SELECT DISTINCT a.blu_model_id
    FROM public.chatter_creator_assignment_daily a
    WHERE a.identity_id = _identity
      AND a.dia = public.chatter_assignment_day(_identity, _dia)
  ),
  prom AS (
    -- El promedio de cada modelo se mide sobre los dias en que HUBO registro, no
    -- sobre los N del calendario: dividir por dias sin dato hunde el promedio de
    -- una modelo que empezo hace una semana.
    SELECT m.blu_model_id,
           COALESCE(AVG(s.net_sales), 0) AS promedio
    FROM modelos m
    LEFT JOIN public.sophie_daily_stats s
      ON s.blu_model_id = m.blu_model_id
     AND s.date >= _dia - _dias
     AND s.date < _dia
    GROUP BY m.blu_model_id
  )
  SELECT COALESCE(SUM(promedio), 0) FROM prom;
$$;

COMMENT ON FUNCTION public.chatter_expected_sales(uuid, date, integer) IS
  'Vara del dia: suma del promedio de los ultimos N dias de cada modelo asignada. Es lo que hace que 400 sea malo para un chatter y bueno para otro.';
