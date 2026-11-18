-- CUANDO LA APP DE COMPUTADOR SE CAE O SE REFRESCA SOLA (Alvaro, 17/11/2026:
-- «se recupera sola y me avisa»).
--
-- La app (desktop/src/recuperarse.js) anota cuando la página se queda en blanco
-- o se congela y se recupera sola; la página (components/AppLiviana.tsx) lo
-- guarda acá al volver, junto con los refrescos por memoria del modo liviano.
-- Sirve para ver quién sufre, con cuánta memoria, y arreglar la causa.
create table if not exists public.app_caidas (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  creado timestamptz not null default now(),
  ocurrio timestamptz,
  motivo text not null check (char_length(motivo) <= 60),
  codigo integer,
  ram_app_mb integer,
  ram_equipo_gb numeric(5,1),
  ram_libre_gb numeric(5,1),
  version text check (char_length(version) <= 40),
  plataforma text check (plataforma in ('mac', 'windows', 'linux'))
);

create index if not exists app_caidas_creado on public.app_caidas (creado desc);

alter table public.app_caidas enable row level security;

create policy "app_caidas anotar la propia" on public.app_caidas
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "app_caidas ver admin o dueño" on public.app_caidas
  for select to authenticated
  using (public.es_admin_o_dueno((select auth.uid())));

grant insert, select on public.app_caidas to authenticated;
