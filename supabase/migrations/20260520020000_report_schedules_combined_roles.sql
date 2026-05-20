-- report_schedules: agregar `combined_roles` para schedules con
-- module='combined'. Antes el módulo combinado renderizaba LLG +
-- Closers hardcodeado; ahora el admin elige cualquier combinación de
-- roles del tenant (LLG / closer / Chatter Supervisor / etc.) y el
-- email genera 1 sección por rol seleccionado.
--
-- Cada elemento del array es el `role` (text) que coincide con
-- `user_roles.role`. El backend usa `roleToModule(role)` para saber
-- qué set de métricas mostrar por sección.

ALTER TABLE public.report_schedules
  ADD COLUMN IF NOT EXISTS combined_roles text[];

COMMENT ON COLUMN public.report_schedules.combined_roles IS
  'Array de roles (matchean user_roles.role) cuando module=''combined''. '
  'Cada rol genera una sección en el email. NULL para schedules de '
  'un solo módulo.';
