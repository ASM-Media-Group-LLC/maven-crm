-- Auto-sanador de pg_net + timeouts de cron acotados.
--
-- PROBLEMA (30/07): el worker de pg_net (hay UNO SOLO) se trababa y dejaba la cola sin
-- drenar; cuando pasa, los crons no disparan y el bot deja de responder. Hubo que correr
-- net.worker_restart() a mano ~8 veces en un día.
--
-- CAUSA PROBABLE: varios crons pedían a pg_net que ESPERARA respuestas larguísimas
-- (wa-inbox-analyze-image y wa-conversation-summarize 240s, wa-inbox-transcribe 180s
-- —que tarda 90-100s de verdad, cada 10 min—, promolog-handle-check 290s). Con un solo
-- worker, eso mantiene conexiones retenidas minutos enteros de forma casi permanente.
--
-- CLAVE: esperar NO sirve para nada. pg_net solo tiene que ENTREGAR el POST; la edge
-- function sigue corriendo aunque pg_net corte la conexión. Probado: el cron
-- whatsapp-supervisor-tick tuvo timeout de 5s todo el día (default de pg_net, no pasaba
-- timeout_milliseconds) y la función tarda 7-11s — completó igual 113 ticks, y su evento
-- se escribe DESPUÉS del trabajo. Nadie lee la respuesta de estos crons.
--
-- Por eso: (1) todos los crons con timeout > 60s se bajaron a 30s vía cron.alter_job
-- (aplicado en vivo; queda documentado acá porque los crons no viven en migraciones), y
-- (2) este watchdog, que cubre igual por si la causa fuera otra.
--
-- DETECCIÓN: "hay cola" NO alcanza (una cola con movimiento es normal). La señal de trabado
-- es cola > 0 Y que el último id de respuesta NO haya avanzado entre dos chequeos
-- consecutivos: entró trabajo y no salió nada.
CREATE TABLE IF NOT EXISTS public.pg_net_watchdog_state (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_queue_count int,
  last_max_response_id bigint,
  checked_at timestamptz,
  restarts_count int NOT NULL DEFAULT 0,
  last_restart_at timestamptz,
  last_note text
);
INSERT INTO public.pg_net_watchdog_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON public.pg_net_watchdog_state FROM public, anon;
GRANT ALL ON public.pg_net_watchdog_state TO service_role;

CREATE OR REPLACE FUNCTION public.pg_net_watchdog()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net'
AS $function$
DECLARE
  v_queue int;
  v_max_resp bigint;
  v_prev record;
  v_stuck boolean := false;
  v_note text;
BEGIN
  SELECT count(*) INTO v_queue FROM net.http_request_queue;
  SELECT coalesce(max(id), 0) INTO v_max_resp FROM net._http_response;
  SELECT * INTO v_prev FROM public.pg_net_watchdog_state WHERE id = 1;

  v_stuck := v_queue > 0
         AND coalesce(v_prev.last_queue_count, 0) > 0
         AND v_max_resp = coalesce(v_prev.last_max_response_id, -1);

  IF v_stuck THEN
    PERFORM net.worker_restart();
    v_note := format('RESTART: cola=%s sin avance desde id=%s', v_queue, v_max_resp);
    UPDATE public.pg_net_watchdog_state
       SET last_queue_count = v_queue, last_max_response_id = v_max_resp, checked_at = now(),
           restarts_count = restarts_count + 1, last_restart_at = now(), last_note = v_note
     WHERE id = 1;
    RETURN v_note;
  END IF;

  v_note := format('ok: cola=%s max_resp=%s', v_queue, v_max_resp);
  UPDATE public.pg_net_watchdog_state
     SET last_queue_count = v_queue, last_max_response_id = v_max_resp, checked_at = now(), last_note = v_note
   WHERE id = 1;
  RETURN v_note;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.pg_net_watchdog() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pg_net_watchdog() TO service_role;

-- Cron cada 5 min (aplicado en vivo como jobid 66):
--   SELECT cron.schedule('pg-net-watchdog', '*/5 * * * *', $$SELECT public.pg_net_watchdog();$$);
