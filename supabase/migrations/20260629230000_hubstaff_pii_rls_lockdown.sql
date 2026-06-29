-- Cerrar la fuga POTENCIAL de PII en las tablas de Hubstaff ANTES de encender el sync.
-- Las tablas (creadas en 20260407000012) tenían `SELECT ... USING (true)` → cualquier
-- usuario autenticado podía leer la actividad y, peor, los SCREENSHOTS (vigilancia de
-- TODA la empresa, incluido el dueño). Hoy están vacías (el sync nunca se construyó), así
-- que no hay fuga real todavía; esto lo cierra ANTES de que entre un solo dato real.
--
-- Se restringe la LECTURA al tier de management (admin + manager vía blu_is_management),
-- que es quien usa HR → Monitoreo. Las policies "Admins can manage" (ALL) quedan intactas.
-- `hubstaff_members` (roster/mapeo) y `hubstaff_config` (flags) NO son sensibles y la UI de
-- Monitoreo + la pantalla de conciliación los necesitan → se dejan como están.

-- hubstaff_activities (tiempo trabajado + % de actividad teclado/mouse) → solo management
drop policy if exists "Authenticated users can view hubstaff_activities" on public.hubstaff_activities;
create policy "Management can view hubstaff_activities" on public.hubstaff_activities
  for select to authenticated
  using (public.blu_is_management(auth.uid()) or public.has_role(auth.uid(), 'admin'));

-- hubstaff_screenshots (PII sensible: capturas de pantalla del empleado) → solo management
drop policy if exists "Authenticated users can view hubstaff_screenshots" on public.hubstaff_screenshots;
create policy "Management can view hubstaff_screenshots" on public.hubstaff_screenshots
  for select to authenticated
  using (public.blu_is_management(auth.uid()) or public.has_role(auth.uid(), 'admin'));
