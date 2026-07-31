-- Ya aplicada en prod por MCP (2026-07-31, PR #1029). Este archivo evita el
-- drift repo↔prod: la tabla existía en prod pero no en las migraciones.
-- Jobs asíncronos de chequeo de handles IG pedidos desde el bot de WhatsApp
-- (tool check_ig_handles). El dispatch crea la fila, Apify corre el scrape y
-- el webhook (o profile-analyses-poll como fallback) dispara el callback que
-- clasifica y postea el resultado al grupo. status es el candado de
-- idempotencia: el callback reclama running->processing con UPDATE condicional
-- y solo el que gana el claim publica.
create table public.promolog_handle_check_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  group_id uuid not null references public.whatsapp_groups(id),
  requested_by text,
  handles jsonb not null,
  status text not null default 'pending'
    check (status in ('pending','running','processing','complete','failed')),
  apify_run_id text,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on table public.promolog_handle_check_jobs is
  'Chequeos on-demand de salud de handles IG pedidos por el equipo vía bot WhatsApp (tool check_ig_handles). Solo service_role: RLS activo sin policies.';

-- Solo el bot/edge functions (service_role) tocan esta tabla.
alter table public.promolog_handle_check_jobs enable row level security;

-- El poll de fallback barre jobs no terminales por antigüedad.
create index idx_promolog_handle_check_jobs_open
  on public.promolog_handle_check_jobs (created_at)
  where status in ('pending','running','processing');
