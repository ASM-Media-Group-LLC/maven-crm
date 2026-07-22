-- Cola de sync ON-DEMAND de BLU: promolog-highlights encola 'pending'; el micro
-- blu-bridge (Dokploy) la pollea cada ~20s, corre una pasada LIVIANA (hoy+ayer) y
-- marca done/error. Así los reportes de ingresos salen con data 100% fresca sin
-- abrir puertos HTTP en el micro (solo habla con Supabase, como siempre).
-- YA APLICADA en prod vía MCP (2026-07-23) — este archivo es el registro en repo.
create table if not exists public.blu_sync_requests (
  id bigint generated always as identity primary key,
  requested_at timestamptz not null default now(),
  requested_by text,
  status text not null default 'pending',  -- pending | running | done | error | expired
  started_at timestamptz,
  finished_at timestamptz,
  note text
);
alter table public.blu_sync_requests enable row level security;
-- sin policies → solo service_role (edge + micro) puede leer/escribir.
