-- Dashboard de Ventas: alinear la RLS de creator_daily_earnings al permiso otorgado.
-- Antes solo LEÍA management (policy cde_management USING blu_is_management), pero el owner
-- otorgó el módulo 'Creator Sales' a más roles (Team Leader, Chatter Supervisor, supervisor) →
-- veían el menú pero 0 datos. Agregamos una policy de SELECT según has_permission('Creator Sales').
-- Las ESCRITURAS siguen solo para management (cde_management es FOR ALL; el bridge escribe con
-- service_role, que bypassa RLS).
drop policy if exists cde_sales_read on public.creator_daily_earnings;
create policy cde_sales_read on public.creator_daily_earnings
  for select to authenticated
  using (public.has_permission(auth.uid(), 'Creator Sales'));
