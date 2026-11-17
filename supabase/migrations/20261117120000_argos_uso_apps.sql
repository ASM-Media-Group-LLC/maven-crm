-- Argos desde la app de computador (Alvaro, 17/11/2026: «app y página», como
-- Hubstaff). La app de escritorio mira cada 5 s la ventana al frente y los
-- segundos sin tocar teclado ni mouse en todo el computador; cada minuto la
-- página guarda los tramos con la sesión de la persona.
create table if not exists public.argos_uso_apps (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  app text not null check (char_length(app) between 1 and 120),
  titulo text not null default '' check (char_length(titulo) <= 300),
  url text check (url is null or char_length(url) <= 500),
  desde timestamptz not null,
  hasta timestamptz not null,
  segundos integer not null check (segundos between 1 and 3600),
  segundos_inactivo integer not null default 0 check (segundos_inactivo between 0 and 3600),
  plataforma text check (plataforma in ('mac', 'windows', 'linux')),
  created_at timestamptz not null default now(),
  check (hasta >= desde)
);
create index if not exists argos_uso_apps_user_desde on public.argos_uso_apps (user_id, desde desc);

alter table public.argos_uso_apps enable row level security;

-- Cada uno guarda solo lo suyo; nadie edita ni borra desde la app.
create policy "argos_uso_apps_ins_propio" on public.argos_uso_apps
  for insert to authenticated with check (user_id = (select auth.uid()));
-- La persona ve lo suyo; supervisores para arriba ven a todos (como monitor_rondas).
create policy "argos_uso_apps_sel_propio" on public.argos_uso_apps
  for select to authenticated using (user_id = (select auth.uid()));
create policy "argos_uso_apps_sel_supervisor" on public.argos_uso_apps
  for select to authenticated
  using (public.is_in_role_group((select auth.uid()), 'supervisor_or_above'));

-- Se guarda 30 días.
select cron.schedule(
  'argos-uso-apps-limpieza',
  '20 9 * * *',
  $$delete from public.argos_uso_apps where desde < now() - interval '30 days'$$
);
