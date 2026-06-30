-- El editor de horarios (RRHH, frontend) necesita leer/escribir whatsapp_user_schedules.
-- Hoy no tiene policies → la abro a management/admin (el whatsapp-agent la lee por service_role,
-- que bypassa RLS, así que no se afecta). También la asegura si estaba sin RLS.
alter table public.whatsapp_user_schedules enable row level security;

drop policy if exists wus_mgmt_read on public.whatsapp_user_schedules;
create policy wus_mgmt_read on public.whatsapp_user_schedules
  for select to authenticated
  using (public.blu_is_management(auth.uid()) or public.has_role(auth.uid(), 'admin'::text));

drop policy if exists wus_mgmt_write on public.whatsapp_user_schedules;
create policy wus_mgmt_write on public.whatsapp_user_schedules
  for all to authenticated
  using (public.blu_is_management(auth.uid()) or public.has_role(auth.uid(), 'admin'::text))
  with check (public.blu_is_management(auth.uid()) or public.has_role(auth.uid(), 'admin'::text));
