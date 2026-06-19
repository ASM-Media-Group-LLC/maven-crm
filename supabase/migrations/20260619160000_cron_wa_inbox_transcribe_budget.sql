-- Ajuste del cron wa-inbox-transcribe tras el incidente pg_net 2026-06-19.
-- Problema: con batch 4 y Whisper lento (CPU), los lotes pasaban los ~150s de la edge
-- function → 504; las llamadas colgadas tenían a pg_net (timeout 240s) y terminaron
-- WEDGEANDO al worker → toda la cola de net.http_post se trabó (los crons no disparaban).
--
-- Fix (combinado con el wall-clock budget en la función, que corta a los ~55s para no
-- llegar al 504):
--   - frecuencia */3 → */10: las llamadas largas (≤145s) ya no se pisan entre sí ni con
--     los otros crons; sin acumulación en pg_net.
--   - timeout_milliseconds 240000 → 180000: pg_net no espera de más por una llamada colgada.
--   - batch_size 4 → 8: el budget igual lo acota; en ticks con Whisper rápido drena más.
-- (El wedge puntual se limpió con `select net.worker_restart();`.)
select cron.schedule(
  'wa-inbox-transcribe',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/wa-inbox-transcribe',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')
    ),
    body := '{"batch_size":8}'::jsonb,
    timeout_milliseconds := 180000
  );
  $$
);
