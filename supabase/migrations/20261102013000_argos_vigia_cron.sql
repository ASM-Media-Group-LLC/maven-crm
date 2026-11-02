-- Cron del vigía de Argos (ATENCIÓN AHORA): cada 2 min en los minutos IMPARES
-- (el cerebro argos-mirar corre en los pares), evalúa las 4 señales por persona,
-- abre/cierra argos_alertas y avisa a los dueños. Misma puerta que los demás
-- crons (X-Cron-Token del vault) y la llave pública como Bearer para el gateway.
select cron.schedule(
  'argos-vigia',
  '1-59/2 * * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/argos-vigia',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzYWdzbGJrbGlwcmVzcGJ5aHRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyODYzMjYsImV4cCI6MjA4MDg2MjMyNn0.4xDi5w0nKAE54OzVzR56XHMzXswQ8leXqzV-H21XrGw',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzYWdzbGJrbGlwcmVzcGJ5aHRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyODYzMjYsImV4cCI6MjA4MDg2MjMyNn0.4xDi5w0nKAE54OzVzR56XHMzXswQ8leXqzV-H21XrGw',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')),
    body := '{}'::jsonb
  );
  $$
);
