-- Las ventas del dia salen del cruce chatter-modelo, no del reporte de ventas.
--
-- POR QUE: BLU solo lista a alguien en el reporte de ventas si VENDIO. Quien
-- trabajo y no vendio no tiene fila, y yo leia esa ausencia como "no tenemos el
-- dato" — cuando en realidad si lo tenemos: chatter_model_daily muestra que
-- atendio modelos y cuantos fans chateo. Alexandra Giraldo aparecia sin nota
-- teniendo 4 modelos y 17 fans el 20/08; son 7 personas en la misma situacion.
--
-- Cero vendido y "no sabemos" son cosas distintas, y confundirlas en cualquiera
-- de los dos sentidos rompe la nota: hacia un lado regala el beneficio de la
-- duda, hacia el otro castiga por un dato que falta.
--
-- El cruce es ademas una fuente MEJOR: se verifico que la suma por modelo
-- reproduce al centavo el total diario del reporte, y encima cubre a los que
-- vendieron cero.
--
-- Orden: 1) el cruce, si ese dia tiene actividad registrada; 2) el reporte de
-- ventas, para dias que todavia no se ingirieron por modelo; 3) NULL.

CREATE OR REPLACE FUNCTION public.chatter_ventas_del_dia(_identity uuid, _dia date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT SUM(c.sales) FROM public.chatter_model_daily c
      WHERE c.identity_id = _identity AND c.dia = _dia
      HAVING count(*) > 0),
    (SELECT SUM(d.total_sales) FROM public.chatter_daily_sales d
      JOIN public.chatter_identity_link l
        ON l.external_id = d.blu_employee_id::text
       AND l.source = 'blu' AND l.valid_to IS NULL
      WHERE l.identity_id = _identity AND d.date = _dia)
  );
$$;

COMMENT ON FUNCTION public.chatter_ventas_del_dia(uuid, date) IS
  'Ventas de un chatter en un dia. Prefiere chatter_model_daily: BLU solo lista en su reporte de ventas a quien vendio, asi que quien trabajo y vendio cero no tiene fila y se leeria como "sin datos". NULL solo si no hay ninguna de las dos fuentes.';

-- Rellena los nombres que faltaban en el cruce, tomandolos de los masivos, que
-- ya los tienen por modelo. Lo nuevo entra con nombre desde la ingesta.
UPDATE public.chatter_model_daily c
SET model_name = m.model_name
FROM (
  SELECT DISTINCT ON (blu_model_id) blu_model_id, model_name
  FROM public.chatter_mass_messages WHERE model_name IS NOT NULL
) m
WHERE c.blu_model_id = m.blu_model_id AND c.model_name IS NULL;
