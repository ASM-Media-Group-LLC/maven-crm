-- Avisar general (Supervisor Hub): amplía QUIÉN puede avisar A QUIÉN.
--
-- Antes: los 4 designados le avisaban a cualquiera de la sesión. Ahora la matriz
-- que pidió Álvaro:
--   • los 4 designados  → a un CHATTER  (el objetivo NO es host de la sesión)
--   • el dueño (admin)  → a un SUPERVISOR (el objetivo SÍ es host de la sesión)
--   • entre supervisores → NO
--   • a sí mismo         → NO
--
-- host de la sesión = supervisor; participant = chatter (is_cowork_host lo mide).
-- Se ALTERa la policy existente (no se dropea): el front pre-filtra los objetivos,
-- pero la base es la que manda, fila por fila (un broadcast son N filas).
alter policy "avisos_insert_supervisores" on public.cowork_avisos
  with check (
    created_by = (select auth.uid())
    and is_cowork_host((select auth.uid()), session_id)   -- quien avisa es host de la sesión
    and user_id <> (select auth.uid())                     -- nunca a sí mismo
    and (
      -- A) uno de los 4 designados → puede avisar a un CHATTER (objetivo NO host)
      (
        (select auth.uid()) in (
          '41b35cef-82a8-4991-9234-3514b0064767',  -- Luis Carlos Ortega Roman
          '4d502376-eb16-42f6-bda2-4b92582a26e6',  -- Daniel Ospina
          '8b90f141-8546-4cfd-a358-56ff227623df',  -- Grace Gelves M.
          '528453bd-f1e1-43d3-85c1-01c5fa5bbcfb'   -- Álvaro Stephan Mejía (dueño)
        )
        and not is_cowork_host(user_id, session_id)
      )
      -- B) el dueño/admin → puede avisar a un SUPERVISOR (objetivo SÍ host)
      or (
        public.is_in_role_group((select auth.uid()), 'admin')
        and is_cowork_host(user_id, session_id)
      )
    )
  );
