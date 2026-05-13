-- role_name: nombre del rol elegido en UI (closer, employee, etc).
-- Mapea internamente a `module` (llg/closers/chatters) — la column
-- module queda por compat backend pero el UI ahora muestra el rol.

ALTER TABLE public.report_schedules
  ADD COLUMN role_name text;

COMMENT ON COLUMN public.report_schedules.role_name IS
  'Nombre del rol elegido en UI (closer, employee, etc). Mapea a module via roleToModule().';
