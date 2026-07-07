-- Programa el digest diario de Promolog al grupo de MANAGERS (promolog-manager-tick).
-- 22:00 UTC = 5pm Bogotá, DESPUÉS de la ventana del scan (18-21 UTC) para que los
-- datos del día estén frescos. La función es no-op seguro si falta el secret
-- PROMOLOG_MANAGER_GROUP_ID (id del whatsapp_groups del grupo de managers) o si
-- no hay nada que reportar. bot_mode='off' en ese grupo → el bot solo publica el
-- digest, no chatea.
select cron.schedule(
  'promolog-manager-tick',
  '0 22 * * *',
  $CRON$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/promolog-manager-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $CRON$
);
