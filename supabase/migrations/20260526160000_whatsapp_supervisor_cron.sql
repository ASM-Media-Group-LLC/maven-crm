-- Cron del supervisor: corre cada 15 min. La function filtra por horario
-- internamente (Bogotá, 8-19 lun-vie, 8-13 sáb). Si bot_enabled=false en
-- los grupos, no manda nada (es la guarda de seguridad).

SELECT cron.unschedule('whatsapp-supervisor-tick')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-supervisor-tick');

SELECT cron.schedule(
  'whatsapp-supervisor-tick',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/whatsapp-supervisor-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_internal_token')
    ),
    body := '{}'::jsonb
  );
  $$
);
