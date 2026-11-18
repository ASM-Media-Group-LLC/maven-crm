-- EL MEDIDOR DE LA APP (Alvaro, 18/11/2026): internet, computador y memoria de
-- cada persona que usa la app de computador. La app manda una muestra cada 5
-- minutos; la persona ve la suya en vivo y quien ve su Expediente de Argos
-- (dueño/admin, RR. HH. y su supervisor, igual que monitor_capturas) ve el día,
-- para saber si se trabó por el equipo o por el internet.
create table if not exists public.equipo_salud (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  creado timestamptz not null default now(),
  datos jsonb not null
);
create index if not exists equipo_salud_user_creado_idx on public.equipo_salud (user_id, creado desc);
alter table public.equipo_salud enable row level security;

create policy equipo_salud_inserta_el_propio on public.equipo_salud
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy equipo_salud_ve_el_propio on public.equipo_salud
  for select to authenticated using (user_id = (select auth.uid()));
create policy equipo_salud_ve_supervisor on public.equipo_salud
  for select to authenticated using (
    es_admin_o_dueno((select auth.uid()))
    or (es_rh((select auth.uid())) and not es_admin_o_dueno(user_id))
    or user_id in (select s.user_id from mi_equipo_supervisado() s(user_id))
  );
comment on table public.equipo_salud is 'Muestras del medidor de la app de computador (cada 5 min). Ver frontend/src/components/MedidorEquipo.tsx.';
