-- COWORK SOLO CON LA APP DE COMPUTADOR (Alvaro, 17/11/2026).
--
-- «Esta plataforma vive de que alguien comparta pantalla todo el tiempo.» En el
-- navegador, compartir exige un clic cada vez y se corta con cada recarga; la
-- app de computador comparte la pantalla completa sola y vuelve sola. Decisión:
-- Cowork funciona solo con la app para TODOS (admins incluidos), primero 2 días
-- de prueba con Grace Gelves, Jackeline Mejía y Luis Roman.
--
-- Una sola fila:
--   desde       desde cuándo es obligatoria para todos (null = todavía no). Antes
--               de esa fecha, en el navegador se muestra el aviso con la fecha.
--   probadores  para ellos ya es obligatoria (la prueba).
-- Los celulares quedan afuera (no comparten pantalla); eso lo decide la página.
create table if not exists public.cowork_app_obligatoria (
  id boolean primary key default true check (id),
  desde timestamptz,
  probadores uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.cowork_app_obligatoria enable row level security;

create policy "cowork_app_obligatoria leer" on public.cowork_app_obligatoria
  for select to authenticated using (true);

create policy "cowork_app_obligatoria cambiar" on public.cowork_app_obligatoria
  for update to authenticated
  using (public.es_admin_o_dueno((select auth.uid())))
  with check (public.es_admin_o_dueno((select auth.uid())));

grant select, update on public.cowork_app_obligatoria to authenticated;

-- Viernes 20/11/2026 a las 00:00 de Colombia para todos (miércoles y jueves de prueba); la prueba arranca ya.
insert into public.cowork_app_obligatoria (id, desde, probadores)
values (
  true,
  '2026-11-20 05:00:00+00',
  array[
    '8b90f141-8546-4cfd-a358-56ff227623df', -- Grace Gelves
    '69d693c9-8620-4549-9c2f-3436b484bde1', -- Jackeline Mejía
    '41b35cef-82a8-4991-9234-3514b0064767'  -- Luis Roman
  ]::uuid[]
)
on conflict (id) do nothing;
