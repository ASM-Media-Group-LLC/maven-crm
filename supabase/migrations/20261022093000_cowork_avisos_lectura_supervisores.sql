-- Lectura de avisos para el perfil de desempeño del empleado (sección Empleados).
--
-- Hasta ahora cowork_avisos solo se podía LEER siendo el DESTINATARIO del aviso
-- (avisos_select_destinatario) o el HOST de esa sesión (avisos_select_host).
-- Para el perfil de un empleado, un supervisor necesita ver TODOS los avisos
-- que recibió esa persona, también los de sesiones que él no hospedó.
--
-- Esta policy ABRE solo LECTURA a supervisores y superiores (el mismo predicado
-- is_in_role_group(..., 'supervisor_or_above') que usa useRoleTier y el guard
-- SupervisorRoute del front). AVISAR (INSERT) no se toca: sigue restringido a
-- los cuatro designados por avisos_insert_supervisores.
create policy "avisos_select_supervisores"
  on public.cowork_avisos
  for select
  to authenticated
  using (
    public.is_in_role_group((select auth.uid()), 'supervisor_or_above')
    or public.is_in_role_group((select auth.uid()), 'admin')
  );
