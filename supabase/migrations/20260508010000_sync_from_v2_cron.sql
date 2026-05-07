-- Cron horario que dispara la edge function sync-from-v2 cada hora a
-- los 5 minutos (`5 * * * *`). Corre dentro del minuto debido a que
-- el sync de leadgen toma ~30s y el resto va más rápido.
--
-- Disparador: net.http_post (extension pg_net) con header
-- x-cron-token = CRON_INTERNAL_TOKEN para auth interno.
--
-- Para que esto funcione necesita:
--   - Extensiones pg_cron + pg_net habilitadas (ya están)
--   - Vault secret: project_url (configurado por Supabase auto)
--   - Vault secret: cron_internal_token con el valor de CRON_INTERNAL_TOKEN

-- Si ya hay un job con este nombre lo reemplazamos (idempotente).
SELECT cron.unschedule('sync-from-v2-hourly')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-from-v2-hourly'
);

SELECT cron.schedule(
  'sync-from-v2-hourly',
  '5 * * * *',  -- minuto 5 de cada hora
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/sync-from-v2',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_internal_token')
    ),
    body := '{}'::jsonb
  );
  $$
);
