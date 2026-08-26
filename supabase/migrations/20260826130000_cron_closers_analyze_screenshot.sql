-- Red de seguridad para el análisis de las capturas de Closers.
--
-- El camino normal es que el frontend dispare closers-analyze-screenshot apenas se
-- sube la captura (fire-and-forget con el file_id), así queda legible para el bot en
-- segundos. Este cron solo levanta lo que se haya perdido: pestaña cerrada a mitad,
-- red caída, o un error transitorio de OpenRouter.
--
-- La función se autolimita: solo toma filas con analyzed_at NULL y analysis_attempts < 3,
-- así que un fallo permanente sale de la cola solo después de 3 vueltas.
--
-- Cada 15 min (no cada 5 como wa-inbox-analyze-image): acá el disparo inmediato ya cubre
-- el caso normal, el volumen es mucho menor y no hay razón para barrer tan seguido.
--
-- ⚠️ Este cron 404ea hasta que el merge a main deploye closers-analyze-screenshot
-- (.github/workflows/deploy-edge-functions.yml). Es inofensivo: pg_net recibe el 404 y
-- no toca ninguna fila, así que no quema intentos.

select cron.unschedule('closers-analyze-screenshot')
where exists (select 1 from cron.job where jobname = 'closers-analyze-screenshot');

select cron.schedule(
  'closers-analyze-screenshot',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/closers-analyze-screenshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')
    ),
    body := jsonb_build_object('batch_size', 15),
    timeout_milliseconds := 120000
  );
  $cron$
);
