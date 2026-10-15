-- Telemetría de cortes de llamada: cada parpadeo (reconexión interna de
-- LiveKit) y cada caída definitiva queda anotada con su motivo. Responde a la
-- queja del equipo del 14/10 («se cae mucho»): sin esto no hay forma de saber
-- si el cuello es el servidor de LiveKit, la red de cada quien o la app.
-- La lee solo el service_role (centro-operaciones); no hay política de SELECT.
create table if not exists public.llamada_cortes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sala text,
  fase text not null,
  motivo text,
  creado timestamptz not null default now()
);

alter table public.llamada_cortes enable row level security;

create policy "llamada_cortes_inserta_el_propio" on public.llamada_cortes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create index if not exists llamada_cortes_creado_idx
  on public.llamada_cortes (creado desc);
