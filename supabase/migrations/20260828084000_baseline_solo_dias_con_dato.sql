-- La vara por modelo, medida SOLO sobre dias que tienen dato.
--
-- POR QUE: BLU conserva la atribucion por empleado apenas unas dos semanas.
-- Medido el 28/08 preguntandole directamente: el 5 y el 10 de agosto devuelven
-- CERO chatters, el 14 dos, el 17 cuatro, el 27 trece. No es que el equipo no
-- trabajara: es que ese detalle ya no existe del lado de BLU.
--
-- Por eso la version anterior estaba mal calibrada: dividia el total de una
-- ventana de 30 dias entre 30, cuando en la practica esa ventana contenia uno o
-- dos dias de datos. En varias modelos el 27/08 solo representaba el 95-100% de
-- "todo el mes". Eso deflactaba la vara ~30x y hacia que cualquiera pareciera
-- vender 10 o 60 veces lo esperado.
--
-- Ahora el promedio se toma sobre los dias en que HUBO registro, y dentro de
-- cada dia se reparte entre los chatters que atendieron esa modelo — que es el
-- "1/3 por turno" de Jhon, pero contado en vez de supuesto.
--
-- CONSECUENCIA OPERATIVA: cada dia que no se capture se pierde para siempre.
-- La captura diaria no es un lujo, es la unica forma de que esto tenga
-- historia.

CREATE OR REPLACE FUNCTION public.chatter_model_baseline(_blu_model_id bigint, _hasta date, _dias integer DEFAULT 30)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH por_dia AS (
    SELECT c.dia,
           sum(c.sales) AS total_dia,
           count(DISTINCT c.identity_id) AS chatters_dia
    FROM public.chatter_model_daily c
    WHERE c.blu_model_id = _blu_model_id
      AND c.dia <= _hasta AND c.dia > _hasta - _dias
    GROUP BY c.dia
  )
  -- Promedio, entre los dias con registro, de lo que produjo UN chatter.
  SELECT AVG(total_dia / GREATEST(1, chatters_dia)) FROM por_dia;
$$;

COMMENT ON FUNCTION public.chatter_model_baseline(bigint, date, integer) IS
  'Vara de UN chatter en UNA modelo por dia: promedio, sobre los dias CON REGISTRO, del total de la modelo repartido entre los chatters que la atendieron. Solo dias con dato: BLU pierde la atribucion por empleado a las ~2 semanas y contar los dias vacios deflactaria la vara.';

-- La vara del chatter: suma de lo exigible en cada modelo que atendio ese dia.
CREATE OR REPLACE FUNCTION public.chatter_expected_sales(_identity uuid, _dia date, _dias integer DEFAULT 30)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT SUM(public.chatter_model_baseline(c.blu_model_id, _dia, _dias))
  FROM public.chatter_model_daily c
  WHERE c.identity_id = _identity AND c.dia = _dia;
$$;

COMMENT ON FUNCTION public.chatter_expected_sales(uuid, date, integer) IS
  'Vara del dia: suma, sobre las modelos que el chatter atendio ese dia, de lo que suele producir un chatter en cada una. NULL si de ese dia no se ingirio el cruce chatter-modelo — sin saber a quien atendio no hay vara.';
