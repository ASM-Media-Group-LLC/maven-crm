-- ATENCIÓN AHORA (Argos): las alertas vivas por persona. Las abre y cierra el
-- vigía server-side (edge argos-vigia, cron cada 2 min) evaluando 4 señales:
-- fuera de lugar (IA), sin señal en horario, pausa de más y cámara/puesto. Una
-- alerta activa por persona+tipo; al abrirse, se avisa (notifications → push) a
-- supervisor+ de la empresa. Lo leen supervisor+ de su empresa; escribe solo
-- service_role.
create table if not exists public.argos_alertas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid not null,
  tipo text not null,
  gravedad smallint not null default 2, -- 3 alto · 2 medio · 1 bajo
  detalle text,
  captura_path text,
  abierta_at timestamptz not null default now(),
  actualizada_at timestamptz not null default now(),
  cerrada_at timestamptz,
  notificada_at timestamptz
);
create unique index if not exists argos_alertas_activa_idx
  on public.argos_alertas (user_id, tipo) where cerrada_at is null;
create index if not exists argos_alertas_abiertas_idx
  on public.argos_alertas (tenant_id, gravedad desc, abierta_at) where cerrada_at is null;
create index if not exists argos_alertas_user_idx
  on public.argos_alertas (user_id, abierta_at desc);
alter table public.argos_alertas enable row level security;

create policy argos_alertas_sel_supervisor on public.argos_alertas
  for select to authenticated
  using (public.is_in_role_group((select auth.uid()), 'supervisor_or_above')
         and tenant_id = (select public.current_tenant_id()));
