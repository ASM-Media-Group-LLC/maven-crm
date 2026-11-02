-- EL DUEÑO de la empresa (Alvaro, 02/11/2026): «por ahora Argos solo lo puede ver
-- el dueño, o sea yo». Hay 8 cuentas admin, así que admin ≠ dueño. Los dueños
-- viven en tenant_owners (por empresa; Alvaro tiene dos cuentas) y es_dueno()
-- lo responde para las políticas y el frontend. Las políticas de Argos se
-- ajustan con ALTER (nunca DROP+CREATE).
create table if not exists public.tenant_owners (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
alter table public.tenant_owners enable row level security;
-- Cada quien puede saber si ES dueño (una fila propia); nada más.
create policy tenant_owners_sel_propio on public.tenant_owners
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.es_dueno(_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.tenant_owners o where o.user_id = _user_id)
$$;

insert into public.tenant_owners (tenant_id, user_id) values
  ('30869615-f579-4981-8a1f-dbebc61eae2d', 'fcdfdfcb-c0ab-4c82-b6d9-d50d37ab086e'), -- Alvaro René
  ('30869615-f579-4981-8a1f-dbebc61eae2d', '528453bd-f1e1-43d3-85c1-01c5fa5bbcfb')  -- Alvaro Stephan Mejía
on conflict do nothing;

alter policy monitor_capturas_sel_supervisor on public.monitor_capturas
  using (public.es_dueno((select auth.uid())));
alter policy monitor_capturas_upd_supervisor on public.monitor_capturas
  using (public.es_dueno((select auth.uid())))
  with check (public.es_dueno((select auth.uid())));
alter policy monitor_capturas_read_supervisor on storage.objects
  using (bucket_id = 'monitor-capturas' and public.es_dueno((select auth.uid())));
alter policy monitor_rondas_sel_supervisor on public.monitor_rondas
  using (public.es_dueno((select auth.uid())));
alter policy argos_alertas_sel_supervisor on public.argos_alertas
  using (public.es_dueno((select auth.uid())) and tenant_id = (select public.current_tenant_id()));
alter policy argos_contexto_sel_supervisor on public.argos_contexto
  using (public.es_dueno((select auth.uid())) and tenant_id = (select public.current_tenant_id()));
alter policy argos_contexto_ins_admin on public.argos_contexto
  with check (public.es_dueno((select auth.uid())) and tenant_id = (select public.current_tenant_id()));
alter policy argos_contexto_upd_admin on public.argos_contexto
  using (public.es_dueno((select auth.uid())) and tenant_id = (select public.current_tenant_id()))
  with check (public.es_dueno((select auth.uid())) and tenant_id = (select public.current_tenant_id()));
