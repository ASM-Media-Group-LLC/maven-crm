-- pg_net: el default de 5000 ms cortaba la espera cuando el sync creaba grupos
-- nuevos (cada createGroup en Zoho ~1-2 s + releer + reconciliar 16 grupos). El
-- edge terminaba igual (pg_net no cancela la request), pero en net._http_response
-- quedaba "Timeout of 5000 ms reached" y ninguna respuesta útil para diagnosticar.
-- 60 s captura la respuesta real; pg_net sigue siendo asíncrono, no bloquea nada.
create or replace function public.trg_role_groups_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/role-email-groups',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := '{"action":"sync"}'::jsonb,
    timeout_milliseconds := 60000
  );
  return null;
end
$$;

-- Mismo ajuste en el cron nocturno (cron.schedule con el mismo nombre lo reemplaza).
select cron.schedule(
  'role-email-groups-sync',
  '0 8 * * *',
  $cron$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/role-email-groups',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := '{"action":"sync"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
