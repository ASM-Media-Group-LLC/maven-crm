-- Refresco diario de los masivos.
--
-- BLU los devuelve completos en cada consulta (no hay incremental), asi que se
-- vuelven a pedir por lotes de modelos. Van todos de una: pg_net los dispara en
-- paralelo y cada llamada trae unas pocas modelos, que es lo que entra en el
-- limite de la edge function.

CREATE OR REPLACE FUNCTION public.chatter_masivos_refresh(_modelos_por_llamada integer DEFAULT 5)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token text;
  v_disparados integer := 0;
  r record;
BEGIN
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'cron_internal_token';

  FOR r IN
    WITH ids AS (SELECT DISTINCT blu_model_id FROM public.chatter_creator_assignment_daily),
    orden AS (SELECT blu_model_id, row_number() OVER (ORDER BY blu_model_id) AS n FROM ids)
    SELECT ((n - 1) / _modelos_por_llamada) AS lote, jsonb_agg(blu_model_id) AS ids
    FROM orden GROUP BY ((n - 1) / _modelos_por_llamada)
  LOOP
    PERFORM net.http_post(
      url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/chatter-sync',
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Token', v_token),
      body := jsonb_build_object('action', 'masivos', 'modelIds', r.ids),
      timeout_milliseconds := 150000
    );
    v_disparados := v_disparados + 1;
  END LOOP;

  RETURN v_disparados;
END $$;

COMMENT ON FUNCTION public.chatter_masivos_refresh(integer) IS
  'Vuelve a pedir los masivos de todas las modelos, por lotes. BLU no tiene incremental: cada consulta devuelve el historico completo de esa modelo.';

-- Cruce de identidades, todos los dias.
--
-- No es solo para dar de alta a los que entran: tambien CURA los vinculos que
-- se rompen. Cuando se borra una cuenta de Maven (por ejemplo al unificar los
-- duplicados de la migracion de correos), la referencia queda en NULL y esa
-- persona desaparece del dashboard. El cruce la vuelve a enganchar a la cuenta
-- que haya quedado. Sin este cron eso solo se arregla si alguien lo nota.
SELECT cron.schedule('chatter-identidades', '20 9 * * *',
  $$SELECT net.http_post(
      url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/chatter-sync',
      headers := jsonb_build_object('Content-Type','application/json',
        'X-Cron-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_internal_token')),
      body := '{"action":"identities"}'::jsonb,
      timeout_milliseconds := 120000);$$);

-- Nota del dia anterior. Va DESPUES del cruce y de la captura del cruce
-- chatter-modelo, que corre cada dos minutos: si se calculara antes, la vara
-- del dia saldria sin saber que modelos atendio cada uno.
SELECT cron.schedule('chatter-notas', '45 9 * * *',
  $$SELECT public.calcular_notas_chatters();$$);

SELECT cron.schedule('chatter-masivos', '10 10 * * *',
  $$SELECT public.chatter_masivos_refresh();$$);
