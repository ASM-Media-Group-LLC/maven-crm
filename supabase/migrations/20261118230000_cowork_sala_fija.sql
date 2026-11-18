-- SALA FIJA POR PERSONA EN COWORK (Alvaro, 18/11/2026).
-- En una sesión con salas (p. ej. «Chatters Kash»: Plus 1, Plus 2…) cada chatter
-- tiene que sentarse en LA suya. Antes, al abrir Cowork, el servidor metía a quien
-- era nuevo en la PRIMERA sala, y el supervisor solo podía mover a quien ya estaba
-- conectado. Ahora cada persona tiene una sala fija por sesión:
--   · la pone el supervisor (o un admin) desde el tablero, aunque no esté conectada;
--   · también queda fija la sala del código o del enlace que el supervisor le dio;
--   · al entrar sin sala, la edge cowork-session la manda a su fija.
-- Se escribe SOLO desde la edge (service_role): no hay políticas de escritura.
-- Si la sala se cierra (se borra), la fila se va con ella (on delete cascade) y la
-- persona vuelve a la regla de antes (su última sala o la primera).

do $$
begin
  if to_regclass('public.cowork_sessions') is null
     or to_regclass('public.cowork_rooms') is null then
    return;
  end if;

  create table if not exists public.cowork_sala_fija (
    session_id uuid not null references public.cowork_sessions(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    room_id uuid not null references public.cowork_rooms(id) on delete cascade,
    asignado_por uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now(),
    primary key (session_id, user_id)
  );

  create index if not exists cowork_sala_fija_room_idx on public.cowork_sala_fija (room_id);

  alter table public.cowork_sala_fija enable row level security;

  -- Lectura: la persona ve la suya; los anfitriones (supervisores/admins) de la
  -- sesión ven todas, igual que con cowork_room_assignments.
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'cowork_sala_fija'
                    and policyname = 'Cada quien ve su sala fija') then
    create policy "Cada quien ve su sala fija" on public.cowork_sala_fija
      for select to authenticated
      using (user_id = (select auth.uid()));
  end if;

  if to_regprocedure('public.is_cowork_host(uuid, uuid)') is not null
     and not exists (select 1 from pg_policies
                      where schemaname = 'public' and tablename = 'cowork_sala_fija'
                        and policyname = 'Anfitriones ven las salas fijas de su sesion') then
    create policy "Anfitriones ven las salas fijas de su sesion" on public.cowork_sala_fija
      for select to authenticated
      using (public.is_cowork_host((select auth.uid()), session_id));
  end if;

  revoke insert, update, delete on public.cowork_sala_fija from anon, authenticated;
  grant select on public.cowork_sala_fija to authenticated;
end
$$;
