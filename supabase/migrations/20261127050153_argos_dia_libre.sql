-- DÍA LIBRE EN LA TABLA DEL TURNO (Alvaro, 27/11/2026).
-- Casi todos tienen horario los 7 días, así que su día libre salía como «no vino».
-- Desde la tabla del turno de Argos, RR. HH. o el supervisor marca ese día como
-- libre (o con permiso) y deja de contar como falta. Solo agrega: no cambia nada.
create table if not exists public.argos_dia_libre (
  user_id uuid not null references public.profiles(id) on delete cascade,
  dia date not null,
  motivo text,
  marcado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (user_id, dia)
);

alter table public.argos_dia_libre enable row level security;

-- Lo ven la persona y quien ya la puede vigilar en Argos.
create policy argos_dia_libre_ver on public.argos_dia_libre for select to authenticated
  using (user_id = (select auth.uid()) or public.puede_vigilar(user_id));

-- Lo marcan o quitan quienes ya pueden editar su horario (RR. HH. y su supervisor).
create policy argos_dia_libre_marcar on public.argos_dia_libre for insert to authenticated
  with check (public.puede_editar_horario(user_id) and marcado_por = (select auth.uid()));
create policy argos_dia_libre_quitar on public.argos_dia_libre for delete to authenticated
  using (public.puede_editar_horario(user_id));

grant select, insert, delete on public.argos_dia_libre to authenticated;
