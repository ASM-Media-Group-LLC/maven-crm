-- Opt-in a Web Push por usuario (mensajes del Messenger, llamados de Cowork,
-- asignaciones de bandeja). Hasta hoy el push solo avisaba de llamadas y lo
-- disparaba el cliente de quien llama; los avisos nuevos salen del SERVIDOR
-- (trigger → pg_net → edge web-push, action "notify"), así que hace falta un
-- interruptor que diga quién quiere recibirlos.
--
-- Default FALSE a propósito: el piloto (5 personas) se autoactiva desde la app
-- (Ajustes → Notificaciones → Canales) y nadie más recibe nada nuevo, aunque
-- ya tenga suscripciones en push_subscriptions por las llamadas. Sin fila en
-- notification_settings tampoco se envía (el trigger hace JOIN, no LEFT JOIN).
--
-- Sin policies nuevas: las de notification_settings ya dejan al usuario hacer
-- upsert de su propia fila (user_id = auth.uid()).
alter table public.notification_settings
  add column if not exists push_enabled boolean not null default false;

comment on column public.notification_settings.push_enabled is
  'Opt-in a Web Push en los dispositivos suscritos en push_subscriptions (mensajes, llamados, asignaciones). Sin fila o false = no se envía nada. Las llamadas entrantes no dependen de esto.';
