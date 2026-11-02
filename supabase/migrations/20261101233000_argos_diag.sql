-- argos_diag: huella paso a paso de la edge argos-mirar (el cerebro de la muralla)
-- para poder ver desde afuera por qué no juzga, sin acceso a los logs del edge.
-- Solo la escribe y la lee service_role: RLS prendida sin políticas.
create table if not exists public.argos_diag (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  ronda text,
  paso text not null,
  detalle jsonb not null default '{}'::jsonb
);
create index if not exists argos_diag_at_idx on public.argos_diag (at desc);
alter table public.argos_diag enable row level security;
