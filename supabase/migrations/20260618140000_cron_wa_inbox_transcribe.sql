-- Cron de wa-inbox-transcribe: barre audios de la bandeja sin transcribir (body
-- null, media en Storage) y los pasa por el Whisper self-hosted. Backfillea los
-- ~156 audios existentes (~2hs) y procesa los nuevos de forma continua.
-- batch 4 cada 3 min: ~160s típico < 180s de intervalo (sin solape); auto-curable
-- (cada audio se commitea individual, un corte solo reintenta el faltante).
-- Mismo patrón/secretos de vault que whatsapp-followup-tick.
select cron.schedule(
  'wa-inbox-transcribe',
  '*/3 * * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/wa-inbox-transcribe',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')
    ),
    body := '{"batch_size":4}'::jsonb,
    timeout_milliseconds := 240000
  );
  $$
);
