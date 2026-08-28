-- La vara, ahora sobre las modelos que el chatter ATENDIO de verdad.
--
-- La version anterior usaba `assignedCreators` (acceso), donde cada modelo esta
-- habilitada para 25-30 chatters: la suma de promedios daba a todos la misma
-- vara. Con chatter_model_daily sabemos que en un dia real cada quien atiende
-- entre 2 y 9 modelos, y cuanto vendio en cada una (verificado: la suma por
-- modelo reproduce al centavo el total diario que reporta BLU).
--
-- LA NORMALIZACION QUE FALTABA: una modelo la cubren varios chatters (los tres
-- turnos). Esperar de una sola persona TODO lo que produce esa modelo en un dia
-- seria pedirle el trabajo de sus companeros. Por eso el promedio se toma por
-- CHATTER-DIA: "cuanto suele producir un chatter en esta modelo", que es lo que
-- de verdad se le puede exigir a uno.

CREATE OR REPLACE FUNCTION public.chatter_expected_sales(_identity uuid, _dia date, _dias integer DEFAULT 30)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH modelos AS (
    -- Las modelos que atendio ESE dia. Si de ese dia todavia no se ingirio el
    -- cruce, no hay lista y la funcion devuelve NULL (no 0): sin saber a quien
    -- atendio no se puede fijar una vara.
    SELECT DISTINCT blu_model_id
    FROM public.chatter_model_daily
    WHERE identity_id = _identity AND dia = _dia
  ),
  prom AS (
    SELECT m.blu_model_id,
           -- Promedio por chatter-dia sobre la ventana previa, contando solo los
           -- dias en que HUBO registro de esa modelo.
           (SELECT AVG(h.sales)
              FROM public.chatter_model_daily h
             WHERE h.blu_model_id = m.blu_model_id
               AND h.dia >= _dia - _dias AND h.dia < _dia) AS promedio
    FROM modelos m
  )
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM modelos) THEN NULL
              ELSE COALESCE(SUM(promedio), 0) END
  FROM prom;
$$;

COMMENT ON FUNCTION public.chatter_expected_sales(uuid, date, integer) IS
  'Vara del dia: suma, sobre las modelos que el chatter atendio ese dia, de lo que suele producir UN chatter en cada una (promedio por chatter-dia de los ultimos N dias). NULL si aun no se ingirio el cruce chatter-modelo de ese dia.';

-- La lista real de modelos que atendio, para mostrarla junto a la nota.
CREATE OR REPLACE FUNCTION public.chatter_models_of_day(_identity uuid, _dia date)
RETURNS TABLE (blu_model_id bigint, model_name text, sales numeric, fans_chatted integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.blu_model_id, c.model_name, c.sales, c.fans_chatted
  FROM public.chatter_model_daily c
  WHERE c.identity_id = _identity AND c.dia = _dia
  ORDER BY c.sales DESC;
$$;
