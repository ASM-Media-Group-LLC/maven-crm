-- Sync nightly de los grupos de correo por rol (8:00 UTC ~ 3:00 Bogotá).
-- Entra al edge con X-Cron-Token (desde vault); el edge agrega/saca miembros
-- según user_roles. Idempotente. Depende del secret de vault 'cron_internal_token'.
select cron.schedule(
  'role-email-groups-sync',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/role-email-groups',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := '{"action":"sync"}'::jsonb
  );
  $$
);
