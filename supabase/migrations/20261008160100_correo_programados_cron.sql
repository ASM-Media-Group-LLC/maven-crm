-- CORREO · el cron que manda los correos programados (20261008160000).
--
-- Cada minuto: «Programar para las 8:00» tiene que salir a las 8:00, no a las
-- 8:04. Y es barato: la edge solo se llama si HAY algo vencido (el `where
-- exists` mira el índice parcial de los pendientes, que casi siempre está
-- vacío). Sin nada que mandar, no hay ni una llamada.
--
-- Va a mail-fetch con X-Cron-Token (el mismo secreto que mail-despertador): el
-- envío vive ahí (enviar.ts) y un correo programado sale por el mismo camino
-- que uno mandado a mano.
--
-- Vuelta atrás:
--| select cron.unschedule('mail-programados');
select cron.schedule(
  'mail-programados',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/mail-fetch',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := '{"action":"send_due"}'::jsonb
  )
  where exists (
    select 1 from public.mail_programados where estado = 'pendiente' and enviar_en <= now()
  );
  $$
);
