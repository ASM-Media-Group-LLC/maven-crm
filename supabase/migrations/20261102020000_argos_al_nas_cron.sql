-- Mover al NAS cada minuto: drena el buzón de Supabase (copia al NAS + nas_path).
-- Fase segura: no borra del buzón todavía (eso va con el camino para servir la
-- foto desde el NAS). Misma puerta de cron que los demás.
select cron.schedule(
  'argos-al-nas',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/argos-al-nas',
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
