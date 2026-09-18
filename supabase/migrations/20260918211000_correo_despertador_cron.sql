-- CORREO · el cron que despierta a los pospuestos.
--
-- Sin esto, "posponer" sería "esconder para siempre": el correo se va a
-- Snoozed y no lo trae nadie de vuelta.
--
-- Cada 5 minutos. No es caprichoso: es el grano más fino que tiene sentido
-- ofrecer. Con cada hora, alguien que pospone "para las 3" lo ve aparecer a
-- las 3:59 y deja de confiar; con cada minuto, son doce corridas por hora que
-- casi siempre no encuentran nada que hacer.
--
-- ⚠️ La función NO hace nada si no hay vencidos: corta apenas la consulta
-- vuelve vacía, sin abrir una sola sesión IMAP. Correr seguido es barato.
--
-- ⚠️ Se escalona en :03 y no en :00 para no chocar con los otros crons, que
-- ya se movieron por el incidente del 17/09.
select cron.schedule(
  'mail-despertador',
  '3-59/5 * * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/mail-despertador',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := '{}'::jsonb
  );
  $$
);
