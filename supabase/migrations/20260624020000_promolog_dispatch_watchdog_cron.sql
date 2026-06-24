-- Watchdog del Promobot IG: si el dispatch de las 08:00 (cron jobid 23, 13:00 UTC) no
-- produjo un scan COMPLETO hoy (por pg_net, error de la edge, Apify caído, etc.), este
-- cron lo re-dispara con force=true a las 09:00 y 10:00 Bogota. Es idempotente: solo
-- dispara si NO existe un dispatch_run completo (creators_count>1) hoy en NY; en cuanto
-- uno corre, deja de re-disparar. Belt-and-suspenders para que un hipo no cueste el día.
select cron.schedule(
  'promolog-dispatch-watchdog',
  '0 14,15 * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/promolog-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')
    ),
    body := '{"force": true}'::jsonb,
    timeout_milliseconds := 60000
  )
  where not exists (
    select 1 from public.promolog_dispatch_runs
    where status in ('running','succeeded','partial')
      and coalesce(creators_count,0) > 1
      and (started_at at time zone 'America/New_York')::date = (now() at time zone 'America/New_York')::date
  );
  $$
);
