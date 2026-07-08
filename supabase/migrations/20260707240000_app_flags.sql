-- app_flags — toggles simples controlables por SQL (sin redeploy ni secrets de edge).
-- Primer uso: manager_supervisor_live = el bot supervisor de Managers manda en vivo.
create table if not exists public.app_flags (
  key text primary key,
  enabled boolean not null default false,
  note text,
  updated_at timestamptz not null default now()
);
alter table public.app_flags enable row level security;
-- lectura para autenticados (UI/admin puede ver); escritura solo service_role / SQL directo.
drop policy if exists app_flags_read on public.app_flags;
create policy app_flags_read on public.app_flags for select to authenticated using (true);

insert into public.app_flags(key, enabled, note)
values ('manager_supervisor_live', true,
        'Bot supervisor de Managers (promolog-manager-tick) manda en vivo al grupo')
on conflict (key) do update set enabled = excluded.enabled, updated_at = now();
