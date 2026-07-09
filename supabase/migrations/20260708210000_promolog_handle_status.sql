-- promolog_handle_status — salud del handle de IG por creadora. Lo llena
-- promolog-handle-check (modo "sospechosas"): solo chequea a las que llevan N días
-- sin NINGUNA historia leída (persistentemente vacías), no a las que simplemente no
-- subieron hoy. status: 'broken' (not_found = handle inexistente), 'restricted'
-- (existe pero privado/age-gated, no legible sin sesión que la siga), 'alive' (existe).
create table if not exists public.promolog_handle_status (
  creator_id uuid primary key references public.creators(id) on delete cascade,
  handle text not null,
  status text not null check (status in ('broken', 'restricted', 'alive')),
  ig_error text,
  days_empty int,
  checked_at timestamptz not null default now(),
  first_broken_at timestamptz,   -- cuándo se detectó 'broken' por primera vez (para no re-alertar)
  resolved_at timestamptz        -- cuándo dejó de estar 'broken' (handle arreglado)
);
alter table public.promolog_handle_status enable row level security;
-- lectura para autenticados (la sección de Promolog en la UI); escritura solo service_role.
drop policy if exists phs_read on public.promolog_handle_status;
create policy phs_read on public.promolog_handle_status for select to authenticated using (true);
notify pgrst, 'reload schema';
