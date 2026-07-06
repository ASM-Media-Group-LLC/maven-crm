-- Escalonar el scan de Promolog: en vez de 1 blast diario de ~5 Apify runs
-- SIMULTÁNEOS (misma sesión de IG desde 5 IPs → IG bloquea → no_story_media
-- masivo; validado en prod que un run SOLO lee bien: 57 items/10 handles vs
-- casi vacío en el blast), un cron cada 5 min tickea de a UN run (one_chunk)
-- hasta cubrir a todas las creadoras sin scan de hoy.
-- Reemplaza el blast diario + watchdog + sweep. Se mantiene poll-stuck-runs (jobid 24).
-- El modo one_chunk vive en la edge function promolog-dispatch (deploy aparte).
select cron.unschedule('promolog-dispatch-daily');
select cron.unschedule('promolog-dispatch-watchdog');
select cron.unschedule('promolog-coverage-sweep');

select cron.schedule(
  'promolog-scan-staggered',
  '*/5 18-21 * * *',  -- cada 5 min, 18:00–21:55 UTC (1:00–4:55 pm Bogotá)
  $CRON$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/promolog-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')
    ),
    body := jsonb_build_object('one_chunk', true)
  );
  $CRON$
);
