-- Automatización de la foto de perfil de creadoras (creators-avatar-sync):
--  (1) CRON DIARIO: cada día trae el avatar de las activas SIN foto (idempotente,
--      barato). → toda creadora nueva tiene foto en ≤24h, sola.
--  (2) TRIGGER INSTANTÁNEO: cuando una creadora pasa a 'active' (o se crea activa)
--      con IG y sin foto, dispara el fetch de ESA sola al toque. El cron es el backstop.

-- (1) cron diario 07:00 UTC (02:00 Bogotá, off-peak).
select cron.schedule('creators-avatar-sync-daily', '0 7 * * *', $cron$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/creators-avatar-sync',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$cron$);

-- (2) trigger: solo cuando pasa a active con IG y sin foto. Scopeado a status/handle
-- para que el propio UPDATE de profile_photo_url (que hace el micro) NO lo re-dispare.
create or replace function public.trg_creator_avatar_fetch()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if NEW.status = 'active'
     and nullif(trim(NEW.instagram_handle), '') is not null
     and nullif(trim(coalesce(NEW.profile_photo_url, '')), '') is null
     and (TG_OP = 'INSERT'
          or NEW.status is distinct from OLD.status
          or NEW.instagram_handle is distinct from OLD.instagram_handle) then
    perform net.http_post(
      url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/creators-avatar-sync',
      headers := jsonb_build_object('Content-Type','application/json',
        'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
      body := jsonb_build_object('only_handles', jsonb_build_array(NEW.instagram_handle)),
      timeout_milliseconds := 60000
    );
  end if;
  return NEW;
end; $$;

drop trigger if exists creator_avatar_fetch on public.creators;
create trigger creator_avatar_fetch
  after insert or update of status, instagram_handle on public.creators
  for each row execute function public.trg_creator_avatar_fetch();
