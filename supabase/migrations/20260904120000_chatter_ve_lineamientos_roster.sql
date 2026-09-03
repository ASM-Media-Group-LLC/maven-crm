-- El chatter ve los LINEAMIENTOS de las creadoras de SU roster.
--
-- Contexto: desde Chatters · Horarios el chatter puede abrir el perfil de una
-- creadora que atiende (`chatter_can_view_creator` + CreadorRosterRoute), y ese
-- perfil es una "vista de trabajo": personaje y voz, precios, protocolo de
-- respuesta, lineamientos y redes públicas. Sin datos de contacto.
--
-- El problema: la policy existente `creator_guidelines_scope` exige
-- `has_permission(uid,'Creadores')`, que un chatter no tiene (es rol member sin
-- el módulo). La pestaña de Lineamientos le salía VACÍA por RLS, sin error.
--
-- Esta policy es SOLO SELECT y solo sobre las creadoras de su roster vigente.
-- Escribir sigue exigiendo el módulo Creadores (la policy vieja es FOR ALL, y
-- el front no le ofrece ninguna acción de edición).
--
-- Nota: qué lineamientos se le MUESTRAN es además una lista blanca en el
-- frontend (`LineamientosSoloLectura.tsx`): quedan afuera "Contacto de
-- Emergencia", "Info de Pagos", "Contratos y Legales", "Cuentas Backup" y todo
-- lo administrativo. Esta policy abre la tabla; la lista blanca decide la
-- pantalla. Si mañana hace falta que el corte viva en la BD, el lugar es acá.

create policy creator_guidelines_chatter_roster
  on public.creator_guidelines
  for select
  to authenticated
  using (public.chatter_can_view_creator(auth.uid(), creator_id));
