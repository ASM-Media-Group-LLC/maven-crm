-- Dos bugs que se disparaban SOLOS al cambiar de mes (deadline real: 31/07 19:00).
--
-- (a) ZONA HORARIA. get_manager_growth_feed y get_manager_silent_no_promo usaban
--     current_date, que en el server es UTC. El cron alvaro-pulse corre a las 00:00
--     UTC = 19:00 Bogotá del día ANTERIOR → a esa hora las funciones ya "creen" que es
--     el día siguiente. Caso grave: el 31/07 a las 19:00 Bogotá, current_date UTC ya
--     es 2026-08-01 → date_trunc('month') salta a AGOSTO y el reporte sale con un
--     mes-a-la-fecha vacío, marcando a todas las creadoras como si se derrumbaran.
--
-- (b) LOS DÍAS 1-4 DEL MES EL FEED ES ALARMISTA. low_promo exige covered_days>=5
--     (imposible esos días) → nadie puede caer en 🔴 crítico ni 🟡 riesgo y TODAS se
--     vuelcan a 🟠 "promociona pero cae". Simulado: el 1/8 daría 0 críticas / 55
--     "calidad" / 0 riesgo, contra 11/12/18 hoy. Encima el ingreso compara 1 día
--     PARCIAL de BLU contra un día completo del mes pasado → income_down para casi
--     todas. Resultado: ~55 alertas falsas el primer día del mes.
--     Fix: no emitir veredicto sin al menos 5 días LEÍDOS. Mejor silencio que alarma
--     masiva falsa. (Al aplicarlo solo afectó a 1 de 41 filas del día.)
--
-- Se hace por reemplazo textual sobre la definición viva para no re-transcribir 8 KB
-- de SQL: verificado que las 7 ocurrencias de current_date están en expresiones
-- (date_trunc/extract/aritmética), ninguna dentro de un literal ni de un comentario.

-- (a) UTC → Bogotá
DO $mig$
DECLARE
  def text;
  fn  text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['get_manager_growth_feed','get_manager_silent_no_promo'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = fn
    LIMIT 1;

    IF def IS NULL THEN
      RAISE EXCEPTION 'no se encontró la función %', fn;
    END IF;

    IF position('current_date' in def) > 0 THEN
      def := replace(def, 'current_date', '(now() at time zone ''America/Bogota'')::date');
      EXECUTE def;
    END IF;
  END LOOP;
END $mig$;

-- (b) sin veredicto con menos de 5 días leídos
DO $mig$
DECLARE
  def text;
  viejo text := 'where not (s.low_promo = false and s.income_down = false)';
  nuevo text := 'where s.covered_days >= 5 and not (s.low_promo = false and s.income_down = false)';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_manager_growth_feed'
  LIMIT 1;

  IF def IS NULL THEN
    RAISE EXCEPTION 'no se encontró get_manager_growth_feed';
  END IF;

  -- idempotente: si ya está parcheada, no hacer nada
  IF position(nuevo in def) = 0 THEN
    IF position(viejo in def) = 0 THEN
      RAISE EXCEPTION 'no se encontró el filtro final esperado — abortado para no romper la función';
    END IF;
    EXECUTE replace(def, viejo, nuevo);
  END IF;
END $mig$;
