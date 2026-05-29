-- Cron de promolog-poll: red de seguridad cada 5 min.
--
-- Por qué: el actor apify/instagram-scraper NO engancha los webhooks ad-hoc
-- que le pasamos en el query string (siempre devuelve webhooks: []), así que
-- cuando el scrape termina nunca avisa a promolog-webhook. promolog-poll es
-- el fallback: mira dispatch_runs en "running" hace >2 min, le pregunta a
-- Apify si el run terminó, y si terminó dispara el webhook a mano (idempotente).
--
-- Este cron FALTABA: se había creado a mano el de promolog-dispatch (diario)
-- pero no el del poll → un run de flota completa (ej. 2026-05-29 13:00, 97
-- creadoras) quedó 5h colgado en "running" con 0 entries porque nada lo
-- reconciliaba. Acá lo versionamos para que no vuelva a pasar.
--
-- Idempotente: unschedule + schedule. Mismo patrón y vault token que
-- whatsapp-supervisor-tick / sync-from-v2-hourly.
--
-- NOTA: el cron de promolog-dispatch sigue creado manualmente (no versionado).
-- La feature "Promobot" expondrá la gestión de ambos crons vía RPC/UI; cuando
-- eso aterrice, capturamos el dispatch acá también.

SELECT cron.unschedule('promolog-poll-tick')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'promolog-poll-tick');

SELECT cron.schedule(
  'promolog-poll-tick',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/promolog-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_internal_token')
    ),
    body := '{}'::jsonb
  );
  $$
);
