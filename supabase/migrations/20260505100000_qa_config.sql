-- qa_config — singleton de configuración global para Agency QA.
-- Mismo patrón que chatter_config (migration 20260502011215):
-- una sola row con id=1, tenant-scopeada vía RLS.
--
-- Campos:
--  - apps_script_url:     webhook a Google Apps Script donde se mandan
--                         las QAs (genera Drive doc + Sheet + emails
--                         externos en un mismo paso, igual que en chatter).
--  - notification_emails: lista de emails externos a notificar (clientes,
--                         auditores, supervisores no-CRM).
--  - notify_user_ids:     lista de profiles.id que reciben notificación
--                         interna en Maven cuando se completa una QA.

create table if not exists public.qa_config (
  id                    int primary key default 1,
  tenant_id             uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  apps_script_url       text,
  notification_emails   text[] not null default '{}',
  notify_user_ids       uuid[] not null default '{}',
  -- toggles por evento — si está false el dispatch no se manda aunque
  -- haya recipients configurados.
  notify_on_uploaded    boolean not null default false,
  notify_on_analyzed    boolean not null default true,
  notify_on_low_score   boolean not null default true,
  notify_on_failed      boolean not null default true,
  -- Threshold para "low score" (default 50, configurable).
  low_score_threshold   int not null default 50,
  updated_at            timestamptz not null default now(),
  constraint qa_config_singleton check (id = 1)
);

-- Seed explícito con el tenant_id de ASM Tech porque correr este
-- INSERT desde el SQL Editor (rol postgres, sin JWT) hace que el
-- DEFAULT current_tenant_id() devuelva NULL → violation. Cuando entren
-- más tenants, cada uno crea su propia row vía la app o un seed manual.
insert into public.qa_config (id, tenant_id)
  values (1, (select id from public.tenants where slug = 'asm-tech'))
  on conflict (id) do nothing;

create trigger qa_config_updated_at
  before update on public.qa_config
  for each row execute function public.update_updated_at_column();

alter table public.qa_config enable row level security;

-- RLS por tenant: cualquier user del tenant ve la config; solo admins
-- (a través de canAccess en frontend) la editan, pero mantenemos el
-- write abierto a authenticated para no requerir un rol DB extra.
create policy "qa_config_tenant_read" on public.qa_config
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "qa_config_tenant_write" on public.qa_config
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
