-- Re-chequeo NOCTURNO de nombres de la bandeja de WhatsApp.
--
-- Problema: el trigger de resolución (trg_wa_contacts_resolved_name) sólo corre al
-- insertar/actualizar un wa_contact. Si después se COMPLETA/CORRIGE el teléfono de una
-- creadora en su perfil (creators), las conversaciones que YA existían no se re-resuelven
-- solas → siguen mostrando el push-name. Y hoy ~52% de las creadoras activas no tienen
-- teléfono cargado en Maven, así que hay mucho por recuperar a medida que se completa.
--
-- Fix: un cron nocturno que reintenta resolver SÓLO los contactos sin nombre resuelto
-- (resolved_name null). Mecanismo: un no-op update sobre phone_e164 dispara el trigger,
-- que vuelve a correr resolve_wa_name con los datos actuales del pipeline. Así la bandeja
-- se AUTO-CORRIGE sin tocar nada a medida que se completan teléfonos en los perfiles.
-- (No toca manual_name: el rename manual del usuario siempre gana.)
--
-- 03:15 Bogotá (08:15 UTC), horario de bajo tráfico. cron.schedule por nombre = idempotente.
select cron.schedule(
  'wa-contacts-reresolve-nightly',
  '15 8 * * *',
  $$ update public.wa_contacts set phone_e164 = phone_e164 where resolved_name is null $$
);
