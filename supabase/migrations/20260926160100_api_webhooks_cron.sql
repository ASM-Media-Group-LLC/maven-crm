-- Webhooks del Messenger, parte 4b: el cron que despierta al despachador. NACE
-- APAGADO: se prende a mano recién cuando haya un endpoint activo y probado.
--
-- Cada 15 s mira api_webhooks_hay_trabajo() (sin endpoints listos es una lectura
-- de una tabla chica) y SOLO si da true despierta a la edge messenger-webhooks. La
-- lectura del vault está dentro del SELECT que filtra ese WHERE: es un InitPlan que
-- Postgres evalúa recién si hace falta, así que con el gate en false no se lee.
--
-- La edge contesta 202 en el acto y trabaja en segundo plano: pg_net (un solo
-- worker, que también lleva los push del Messenger) queda tomado lo que tarda en
-- arrancar, no lo que tarda el integrador en contestar. Por eso el timeout es de 5 s.
--
-- Apagar: select cron.alter_job((select jobid from cron.job where jobname =
-- 'messenger-webhooks-tick'), active := false); o Dashboard → Integrations → Cron.
-- Prender: lo mismo con active := true.

select cron.unschedule('messenger-webhooks-tick')
where exists (select 1 from cron.job where jobname = 'messenger-webhooks-tick');

select cron.alter_job(
  cron.schedule(
    'messenger-webhooks-tick',
    '15 seconds',
    $cron$
    select net.http_post(
      url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/messenger-webhooks',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000)
    where public.api_webhooks_hay_trabajo();
    $cron$
  ),
  active := false
);
