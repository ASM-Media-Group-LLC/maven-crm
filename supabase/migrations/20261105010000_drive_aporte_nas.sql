-- Migración de los aportes del link público al NAS (Alvaro, 05/11). El edge
-- drive-aporte-nas corre cada 5 min, crea la ficha en el Drive y sube los bytes
-- al NAS; los grandes van por partes resumibles entre rondas.

-- Progreso por aporte (para reanudar un video grande entre rondas).
alter table public.drive_aportes
  add column if not exists nas_up      text,
  add column if not exists nas_parte   int not null default 0,
  add column if not exists nas_item_id uuid;

-- Salud del NAS: una fila que el edge actualiza y el frontend lee para el
-- pop-up / aviso en el header (solo admins/dueño).
create table if not exists public.drive_nas_salud (
  id           smallint primary key default 1,
  caido        boolean not null default false,
  desde        timestamptz,
  pendientes   int not null default 0,
  ultimo_aviso timestamptz,
  actualizado  timestamptz not null default now(),
  constraint drive_nas_salud_una_fila check (id = 1)
);
insert into public.drive_nas_salud (id) values (1) on conflict (id) do nothing;

alter table public.drive_nas_salud enable row level security;
drop policy if exists "ver salud nas" on public.drive_nas_salud;
create policy "ver salud nas" on public.drive_nas_salud
  for select to authenticated
  using (
    public.es_dueno((select auth.uid()))
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.nivel in ('dueno', 'admin')
    )
  );
revoke insert, update, delete on public.drive_nas_salud from authenticated, anon;
grant select on public.drive_nas_salud to authenticated;

-- Realtime para que el aviso aparezca solo (el frontend usa useCanalQueRevive).
do $$ begin
  alter publication supabase_realtime add table public.drive_nas_salud;
exception when duplicate_object then null; end $$;

-- Cron cada 5 min (misma puerta de cron que argos-al-nas).
select cron.schedule(
  'drive-aporte-nas',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/drive-aporte-nas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzYWdzbGJrbGlwcmVzcGJ5aHRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyODYzMjYsImV4cCI6MjA4MDg2MjMyNn0.4xDi5w0nKAE54OzVzR56XHMzXswQ8leXqzV-H21XrGw',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzYWdzbGJrbGlwcmVzcGJ5aHRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyODYzMjYsImV4cCI6MjA4MDg2MjMyNn0.4xDi5w0nKAE54OzVzR56XHMzXswQ8leXqzV-H21XrGw',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
