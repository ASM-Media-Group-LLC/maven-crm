-- Argos solo para el dueño (admin): también el latido del rondín (monitor_rondas),
-- que solo se muestra dentro de Argos. monitor_eventos se deja igual porque lo
-- usa también el Monitoreo general de RRHH.
alter policy monitor_rondas_sel_supervisor on public.monitor_rondas
  using (public.is_in_role_group((select auth.uid()), 'admin'));
