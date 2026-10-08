-- MESSENGER · el cron que manda los mensajes programados (20261008170000).
--
-- Cada minuto, en SQL: el envío vive en la base (chat_programados_enviar), así
-- que no hace falta llamar a ninguna edge. Y solo trabaja si HAY algo vencido:
-- el `where exists` mira el índice parcial de los pendientes, casi siempre vacío.
--
-- Vuelta atrás:
--| select cron.unschedule('chat-programados');
select cron.schedule(
  'chat-programados',
  '* * * * *',
  $$
  select public.chat_programados_enviar()
  where exists (
    select 1 from public.chat_programados where estado = 'pendiente' and enviar_en <= now()
  );
  $$
);
