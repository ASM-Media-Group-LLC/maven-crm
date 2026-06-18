-- Cron de wa-inbox-analyze-image: barre imágenes de la bandeja sin analizar (body
-- null o placeholder "[imagen]", media en Storage) y las pasa por el LLM de visión
-- (OpenRouter → Gemini). Hermano del cron de wa-inbox-transcribe (audios/Whisper).
-- Backfilleó las ~13 existentes y procesa las nuevas de forma continua.
-- batch 5 cada 5 min (volumen de imágenes bajo): ~25s típico << 300s de intervalo
-- (sin solape); auto-curable (cada imagen se commitea individual; un corte solo
-- reintenta la faltante). Errores transitorios (timeout/5xx/empty) dejan body=null
-- para el próximo barrido; sólo lo genuinamente ilegible queda "[imagen no analizable]".
-- Mismo patrón/secretos de vault que wa-inbox-transcribe.
select cron.schedule(
  'wa-inbox-analyze-image',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/wa-inbox-analyze-image',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')
    ),
    body := '{"batch_size":5}'::jsonb,
    timeout_milliseconds := 240000
  );
  $$
);
