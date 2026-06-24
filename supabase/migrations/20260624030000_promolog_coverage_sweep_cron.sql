-- Barrido por COBERTURA del Promobot IG (cron jobid 39, 11:00 y 12:00 Bogota = 16,17 UTC).
-- Objetivo del dueño: que el scan diario cubra a TODAS, sin trabajo manual.
-- Tras asentarse el dispatch de las 08:00 + sus reintentos, este cron re-escanea SOLO las
-- creadoras elegibles que quedaron SIN entry de IG hoy (stragglers por timeout de Apify),
-- vía promolog-dispatch con force + only_handles. Tope 1..30: si faltan >30 es una falla
-- mayor (eso lo cubre el watchdog/alerta), no un barrido — así no re-escanea en masa ni
-- quema el presupuesto de Apify. Idempotente: si no falta ninguna, no dispara.
select cron.schedule(
  'promolog-coverage-sweep',
  '0 16,17 * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/promolog-dispatch',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='supabase_anon_key'),
      'X-Cron-Token',(select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')
    ),
    body := jsonb_build_object('force', true, 'only_handles', (
      select jsonb_agg(e.instagram_handle)
      from v_promolog_eligible_creators e
      where e.instagram_handle is not null and e.instagram_handle <> ''
        and e.id not in (
          select creator_id from promolog_entries
          where lower(network)='instagram' and creator_id is not null
            and (date at time zone 'America/New_York')::date = (now() at time zone 'America/New_York')::date
        )
    )),
    timeout_milliseconds := 60000
  )
  where (
    select count(*) from v_promolog_eligible_creators e
    where e.instagram_handle is not null and e.instagram_handle <> ''
      and e.id not in (
        select creator_id from promolog_entries
        where lower(network)='instagram' and creator_id is not null
          and (date at time zone 'America/New_York')::date = (now() at time zone 'America/New_York')::date
      )
  ) between 1 and 30;
  $$
);
