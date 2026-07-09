-- Cutover del scan de historias de IG: del actor de Apify (que devolvía datasets
-- vacíos → todo "pendiente/sin datos") a la LECTURA DIRECTA de IG con la sesión
-- (promolog-story-read). Da Sí/No limpio y solo deja 'pending' cuando de verdad
-- no se pudo leer (sesión caída / follow pendiente en cuenta privada).
--
-- Reemplaza el cron jobid 42 'promolog-scan-staggered' (promolog-dispatch one_chunk)
-- por 'promolog-story-read-staggered' (promolog-story-read one_chunk), MISMO horario.

select cron.unschedule('promolog-scan-staggered');

select cron.schedule('promolog-story-read-staggered', '*/5 18-21 * * *', $cron$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/promolog-story-read',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')
    ),
    body := jsonb_build_object('one_chunk', true),
    timeout_milliseconds := 150000
  );
$cron$);
