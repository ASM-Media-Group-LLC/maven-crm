-- SEGURIDAD: la tabla `tickets` tenía una única policy `Allow all access to
-- tickets` con cmd=ALL, roles=PUBLIC (incluye `anon`) y qual=true → cualquiera
-- con la anon key (que viaja en el frontend) podía LEER/EDITAR/BORRAR todos los
-- tickets SIN estar autenticado. Los tickets contienen notas internas y quejas
-- de creadoras (description, creator_notes), así que es una fuga real.
--
-- Fix mínimo y SIN cambio de comportamiento para usuarios logueados: restringir
-- la policy al rol `authenticated` (saca a anon). Sigue siendo "todos los
-- autenticados ven todo" como hoy; el alcance fino por data_scope se evaluará
-- aparte (auditoría de permisos 2026-06). tickets no tiene tenant_id, así que no
-- se puede tenant-scopear acá.
DROP POLICY IF EXISTS "Allow all access to tickets" ON public.tickets;
CREATE POLICY tickets_authenticated_all ON public.tickets
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
