-- Avisos de un supervisor a un chatter dentro de una sesión de Cowork.
--
-- El supervisor (desde el tablero) elige una "situación" y al chatter le llega
-- en su propia pantalla: un cartel, una campana y la voz Mario diciéndoselo.
--
-- Por qué una FILA en base y no un broadcast de realtime: el broadcast comparte
-- un topic y, con el canal que revive (que versiona el nombre al reconectar), un
-- corte de un segundo en cualquiera de las dos puntas —justo lo que le pasa a
-- Grace— dejaría el aviso sin entregar. La fila sobrevive la reconexión (el
-- chatter escucha postgres_changes y, al revivir, relee las frescas), queda
-- REGISTRO de quién avisó a quién, y no hace falta edge function: el supervisor
-- inserta directo y la RLS valida que sea host de la sesión y uno de los 4
-- designados.
create table if not exists public.cowork_avisos (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cowork_sessions(id) on delete cascade,
  room_id    uuid,
  user_id    uuid not null,                       -- el chatter destinatario
  situacion  text not null,                       -- slug de lib/coworkAvisos.ts
  created_by uuid not null default auth.uid(),    -- el supervisor que avisó
  created_at timestamptz not null default now()
);

-- El chatter solo lee lo suyo y reciente; este índice es por eso.
create index if not exists cowork_avisos_user_fresh_idx
  on public.cowork_avisos (user_id, created_at desc);

alter table public.cowork_avisos enable row level security;

-- Quién puede avisar: host de la sesión Y uno de los 4 designados (Álvaro,
-- 20/10). NO se usa el rol admin a propósito: hoy hay varios admin que él no
-- nombró (Jhon entre ellos). La lista se cambia editando esta policy y el
-- AVISADORES de lib/coworkAvisos.ts a la vez.
create policy "avisos_insert_supervisores" on public.cowork_avisos
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and is_cowork_host((select auth.uid()), session_id)
    and (select auth.uid()) in (
      '41b35cef-82a8-4991-9234-3514b0064767',  -- Luis Carlos Ortega Roman
      '4d502376-eb16-42f6-bda2-4b92582a26e6',  -- Daniel Ospina
      '8b90f141-8546-4cfd-a358-56ff227623df',  -- Grace Gelves M.
      '528453bd-f1e1-43d3-85c1-01c5fa5bbcfb'   -- Álvaro Stephan Mejía (dueño)
    )
  );

-- El chatter ve (y recibe por realtime) los avisos dirigidos a él.
create policy "avisos_select_destinatario" on public.cowork_avisos
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Los hosts de la sesión ven los avisos de su sesión (registro / auditoría).
create policy "avisos_select_host" on public.cowork_avisos
  for select to authenticated
  using (is_cowork_host((select auth.uid()), session_id));

alter publication supabase_realtime add table public.cowork_avisos;
