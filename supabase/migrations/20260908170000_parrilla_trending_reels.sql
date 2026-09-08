-- Reels en tendencia para el bot de Managers (pedido de Luis 31/08) — tool
-- get_trending_reels → edge parrilla-refs-trending (Apify hashtag scraper, async).

create table if not exists public.parrilla_trending_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  group_id uuid not null,
  requested_by text,
  params jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','running','processing','complete','failed')),
  apify_run_id text,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_parrilla_trending_jobs_status on public.parrilla_trending_jobs (status, created_at);
-- Solo la escriben/leen las edge functions (service_role): RLS sin policies.
alter table public.parrilla_trending_jobs enable row level security;

-- La tool entra a la allowlist del Bot de Managers + guía en su manual.
update public.wa_bots
set tool_allowlist = tool_allowlist || '["get_trending_reels"]'::jsonb
where department = 'manager'
  and not (tool_allowlist @> '["get_trending_reels"]'::jsonb);

update public.wa_bots
set manual_prompt = manual_prompt || E'\n\n## REELS EN TENDENCIA (referencias para la parrilla)\nSi piden reels/tendencias/referencias de contenido ("reels en tendencia de este mes en chicos y chicas", "qué está funcionando en fitness", "referencias para la parrilla"), llama get_trending_reels con genero (chicas/chicos/ambos), nicho si lo dicen, y requested_by_display_name. Es ASÍNCRONA: responde solo "dame ~2 min, estoy buscando" — el listado llega como segundo mensaje automático con links, reproducciones y autor, y queda guardado como referencias de la Parrilla. No inventes links ni tendencias de memoria: si no llamaste la tool, no tienes el dato.'
where department = 'manager'
  and manual_prompt not ilike '%get_trending_reels%';
