-- Fix: "new row violates row-level security policy for table creators" al convertir
-- un lead a creadora desde el pipeline de Closers.
--
-- La policy de INSERT solo reconocía los app_role BASE (admin/manager/closer/
-- supervisor). Miguel García es rol CUSTOM "Closer Supervisor" → has_role(...)
-- daba false en los 4 → INSERT rechazado, aunque tiene has_creators_global_scope
-- = true e is_in_role_group('supervisor_or_above') = true (puede operar el
-- pipeline y ver todas las creadoras).
--
-- Alineamos el WITH CHECK del INSERT con el gate que ya usa el SELECT
-- (has_creators_global_scope) + el role-group de supervisores, para que los roles
-- custom (Closer Supervisor, Team Leader, etc.) puedan convertir. Ver
-- [[roles_permission_system]] (3 capas: un rol custom no trae app_role base) +
-- [[closers_activity_dashboard]] (mismo patrón de gates para Closers).

alter policy "Authorized roles can insert creators" on public.creators
  with check (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'manager'::app_role)
    or has_role(auth.uid(), 'closer'::app_role)
    or has_role(auth.uid(), 'supervisor'::app_role)
    or has_creators_global_scope(auth.uid())
    or is_in_role_group(auth.uid(), 'supervisor_or_above')
  );
