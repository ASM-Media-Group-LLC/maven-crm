-- Cron de wa-conversation-summarize: genera/refresca el rolling summary de las
-- conversaciones activas de la bandeja (Haiku). Incremental por watermark — una vez
-- al día la conversación queda resumida y solo se re-resume si llegan mensajes nuevos,
-- así que tras drenar el backlog inicial (~102) los barridos quedan casi vacíos.
-- batch 5 cada 10 min: ~150s peor caso (5 convos largas × Haiku) < 240s timeout.
-- Mismo patrón/secretos de vault que wa-inbox-transcribe / wa-inbox-analyze-image.
select cron.schedule(
  'wa-conversation-summarize',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/wa-conversation-summarize',
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
