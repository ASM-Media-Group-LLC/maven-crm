-- Barridos de cobertura para X y Facebook (como el de IG, jobid 39): unas horas
-- después del scan diario, re-escanean SOLO las creadoras activas con handle que NO
-- quedaron registradas ese día (created_at en hora Bogotá). only_creator_ids=[] si no
-- falta ninguna → el scanner no llama a Apify (costo cero). Dirigido = barato.
-- Motivo: FB venía cubriendo ~2/10 al día; X ~27-30/30 pero volátil. Cierra el hueco.

select cron.schedule('x-scan-coverage-sweep', '0 18 * * *', $cron$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/x-scan',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='supabase_anon_key'),
      'X-Cron-Token',(select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')
    ),
    body := jsonb_build_object('only_creator_ids', (
      select coalesce(jsonb_agg(c.id), '[]'::jsonb)
      from creators c
      where c.status = 'active' and nullif(trim(c.twitter_handle), '') is not null
        and not exists (
          select 1 from promolog_entries e
          where e.creator_id = c.id and e.network ilike 'x'
            and e.created_at >= (now() at time zone 'America/Bogota')::date::timestamp at time zone 'America/Bogota'
        )
    )),
    timeout_milliseconds := 120000
  );
$cron$);

select cron.schedule('fb-scan-coverage-sweep', '0 19 * * *', $cron$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/fb-scan',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='supabase_anon_key'),
      'X-Cron-Token',(select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')
    ),
    body := jsonb_build_object('only_creator_ids', (
      select coalesce(jsonb_agg(c.id), '[]'::jsonb)
      from creators c
      where c.status = 'active' and nullif(trim(c.facebook_handle), '') is not null
        and not exists (
          select 1 from promolog_entries e
          where e.creator_id = c.id and e.network ilike 'facebook'
            and e.created_at >= (now() at time zone 'America/Bogota')::date::timestamp at time zone 'America/Bogota'
        )
    )),
    timeout_milliseconds := 120000
  );
$cron$);
