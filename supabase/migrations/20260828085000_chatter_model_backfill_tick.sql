-- Trae el historico del cruce chatter-modelo desde BLU, de a poco.
--
-- POR QUE ASI: cada par (dia, modelo) es una consulta por WebSocket de varios
-- segundos. No entran en una sola corrida, y hacerlas todas de golpe seria una
-- tromba sobre BLU. Este tick agarra el siguiente pedazo pendiente y lo
-- dispara; un cron lo llama cada par de minutos hasta que no queda nada.
--
-- Lo que ya se trajo NO se vuelve a pedir: la tabla de cobertura
-- (chatter_model_daily_sync) es la que dice que par ya esta hecho, asi que el
-- proceso se puede cortar y retomar sin repetir trabajo ni perder nada.
--
-- URGENTE POR DISEÑO: BLU pierde la atribucion por empleado a las ~2 semanas.
-- Lo que no se capture ahora no se puede recuperar despues.

CREATE OR REPLACE FUNCTION public.chatter_model_backfill_tick(
  _dias integer DEFAULT 30,
  _modelos_por_llamada integer DEFAULT 6,
  _llamadas integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token text;
  v_pendientes integer;
  v_disparados integer := 0;
  r record;
BEGIN
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'cron_internal_token';

  CREATE TEMP TABLE IF NOT EXISTS _pend (dia date, blu_model_id bigint) ON COMMIT DROP;
  INSERT INTO _pend
  SELECT d.dia, m.blu_model_id
  FROM generate_series(
         ((now() AT TIME ZONE 'America/Bogota')::date - _dias),
         ((now() AT TIME ZONE 'America/Bogota')::date - 1),
         '1 day') AS d(dia)
  CROSS JOIN (SELECT DISTINCT blu_model_id FROM public.chatter_creator_assignment_daily) m
  WHERE NOT EXISTS (
    SELECT 1 FROM public.chatter_model_daily_sync s
    WHERE s.dia = d.dia AND s.blu_model_id = m.blu_model_id
  );

  SELECT count(*) INTO v_pendientes FROM _pend;
  IF v_pendientes = 0 THEN
    RETURN jsonb_build_object('pendientes', 0, 'disparados', 0, 'listo', true);
  END IF;

  FOR r IN
    WITH orden AS (
      SELECT dia, blu_model_id,
             row_number() OVER (PARTITION BY dia ORDER BY blu_model_id) AS n
      FROM _pend
    ),
    lotes AS (
      SELECT dia, ((n - 1) / _modelos_por_llamada) AS lote, jsonb_agg(blu_model_id) AS ids
      FROM orden GROUP BY dia, ((n - 1) / _modelos_por_llamada)
    )
    SELECT dia, ids FROM lotes ORDER BY dia DESC, lote LIMIT _llamadas
  LOOP
    PERFORM net.http_post(
      url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/chatter-sync',
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Token', v_token),
      body := jsonb_build_object('action', 'model-day', 'dia', r.dia, 'modelIds', r.ids),
      timeout_milliseconds := 150000
    );
    v_disparados := v_disparados + 1;
  END LOOP;

  RETURN jsonb_build_object('pendientes', v_pendientes, 'disparados', v_disparados, 'listo', false);
END $$;

COMMENT ON FUNCTION public.chatter_model_backfill_tick(integer, integer, integer) IS
  'Trae un pedazo del historico chatter-modelo desde BLU. Idempotente: se guia por chatter_model_daily_sync, asi que se puede cortar y retomar. Pensado para un cron cada 2 minutos hasta que devuelva listo=true.';
