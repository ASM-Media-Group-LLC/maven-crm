-- Cron del cerebro de Argos: cada 2 min (= monitor_config.intervalo_ia_seg) la
-- edge argos-mirar juzga el pantallazo más reciente de cada persona, haya o no
-- un supervisor mirando. Misma puerta que los demás crons (X-Cron-Token del
-- vault). El gateway sigue con verify_jwt=true: por eso va la llave pública
-- (anon, un JWT) como Bearer; adentro autoriza el X-Cron-Token.
select cron.schedule(
  'argos-mirar',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/argos-mirar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzYWdzbGJrbGlwcmVzcGJ5aHRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyODYzMjYsImV4cCI6MjA4MDg2MjMyNn0.4xDi5w0nKAE54OzVzR56XHMzXswQ8leXqzV-H21XrGw',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzYWdzbGJrbGlwcmVzcGJ5aHRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyODYzMjYsImV4cCI6MjA4MDg2MjMyNn0.4xDi5w0nKAE54OzVzR56XHMzXswQ8leXqzV-H21XrGw',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')),
    body := '{}'::jsonb
  );
  $$
);
