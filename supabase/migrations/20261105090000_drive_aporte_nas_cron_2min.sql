-- El disparo inmediato (drive-aporte confirmar) hace el grueso; el cron pasa a
-- cada 2 min como respaldo (antes 5). (Alvaro, 05/11 — "que se sienta fluido".)
select cron.schedule(
  'drive-aporte-nas',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/drive-aporte-nas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzYWdzbGJrbGlwcmVzcGJ5aHRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyODYzMjYsImV4cCI6MjA4MDg2MjMyNn0.4xDi5w0nKAE54OzVzR56XHMzXswQ8leXqzV-H21XrGw',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzYWdzbGJrbGlwcmVzcGJ5aHRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyODYzMjYsImV4cCI6MjA4MDg2MjMyNn0.4xDi5w0nKAE54OzVzR56XHMzXswQ8leXqzV-H21XrGw',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
