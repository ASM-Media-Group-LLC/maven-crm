-- "Team Leader" estaba a medio cablear: existe en roles_config (activo) y tiene
-- permisos en role_permissions (169 filas), pero NUNCA se registró en role_groups.
-- La función SECURITY DEFINER public.is_in_role_group() hace un INNER JOIN
-- user_roles.role = role_groups.role_name, así que un rol ausente de role_groups
-- devuelve FALSE para TODAS las capacidades (admin/manager/supervisor/incluso
-- 'member') → el rol quedaba sin acceso a nada vía RLS (inbox, bots, closers,
-- monetización, etc.), aunque se pudiera asignar. La única persona con el rol
-- tenía todas las capacidades en false.
--
-- Lo registramos a nivel SUPERVISOR (ve los datos de su equipo), igual que los
-- roles 'supervisor' / 'Closer Supervisor' / 'Chatter Supervisor'.
-- Idempotente: ON CONFLICT por si ya existiera.
INSERT INTO public.role_groups
  (role_name, is_admin, is_manager_or_above, is_supervisor_or_above, is_member, description, created_at, updated_at)
VALUES
  ('Team Leader', false, false, true, true, 'Líder de equipo — nivel supervisor (ve datos de su equipo)', now(), now())
ON CONFLICT (role_name) DO UPDATE SET
  is_admin               = EXCLUDED.is_admin,
  is_manager_or_above    = EXCLUDED.is_manager_or_above,
  is_supervisor_or_above = EXCLUDED.is_supervisor_or_above,
  is_member              = EXCLUDED.is_member,
  description            = EXCLUDED.description,
  updated_at             = now();
