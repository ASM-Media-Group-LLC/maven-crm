-- Argos solo para el dueño (admin), por ahora (decisión de Alvaro, 02/11/2026).
-- Se ajustan las políticas existentes con ALTER (nunca DROP+CREATE). Las de
-- escritura propia (cada quien sube su captura) y las de service_role no cambian.
alter policy monitor_capturas_sel_supervisor on public.monitor_capturas
  using (public.is_in_role_group((select auth.uid()), 'admin'));

alter policy monitor_capturas_upd_supervisor on public.monitor_capturas
  using (public.is_in_role_group((select auth.uid()), 'admin'))
  with check (public.is_in_role_group((select auth.uid()), 'admin'));

alter policy monitor_capturas_read_supervisor on storage.objects
  using (bucket_id = 'monitor-capturas' and public.is_in_role_group((select auth.uid()), 'admin'));

alter policy argos_alertas_sel_supervisor on public.argos_alertas
  using (public.is_in_role_group((select auth.uid()), 'admin')
         and tenant_id = (select public.current_tenant_id()));

alter policy argos_contexto_sel_supervisor on public.argos_contexto
  using (public.is_in_role_group((select auth.uid()), 'admin')
         and tenant_id = (select public.current_tenant_id()));
