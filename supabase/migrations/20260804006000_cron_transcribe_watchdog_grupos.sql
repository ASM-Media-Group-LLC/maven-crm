-- Watchdog de transcripción para audios de GRUPOS (whatsapp_messages).
-- (Aplicada en prod vía MCP el 03/08; este archivo la versiona.)
--
-- 03/08: el audio de Álvaro de las 15:54 tardó 40s en Whisper, el edge murió en
-- 520 y el texto quedó NULL para siempre — el bot publicó en 3 grupos sin oír la
-- última instrucción. El edge whatsapp-transcribe-audio YA trae modo batch
-- (catch-up de audios pending con media reciente, ventana 30 min) pero nadie lo
-- llamaba: el único disparo era el de ingest al llegar el mensaje, sin reintento.
-- Los media_url de Evolution caducan en ~5 min → el reintento corre CADA MINUTO
-- para tener 2-3 chances dentro del TTL. Con cero pendientes es un no-op barato.
-- (Distinto de cron 33 wa-inbox-transcribe, que es de la bandeja.)
select cron.schedule(
  'whatsapp-transcribe-watchdog',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/whatsapp-transcribe-audio',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='supabase_anon_key'),
      'X-Cron-Token',(select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := '{"batch":true,"batch_size":5}'::jsonb,
    timeout_milliseconds := 50000)
  where exists (
    select 1 from whatsapp_messages
    where msg_type = 'audio' and is_from_bot = false
      and transcribed_text is null and media_url is not null
      and received_at >= now() - interval '30 minutes'
      and received_at <= now() - interval '45 seconds'
  );
  $$
);
