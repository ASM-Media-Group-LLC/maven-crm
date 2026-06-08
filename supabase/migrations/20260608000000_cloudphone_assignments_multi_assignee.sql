-- Multi-asignado: varias personas pueden estar asignadas a un mismo cloud phone.
-- (El "1 solo logueado a la vez" lo enforcea el micro cloudphone-gateway con un lock de sesión
--  en /phones/:id/start; la DB solo modela la ASIGNACIÓN, que ahora es muchos-a-uno.)
--
-- Antes: PK = profile_id  → un solo asignado por teléfono.
-- Ahora: PK = (profile_id, assigned_to), assigned_to NOT NULL, FK ON DELETE CASCADE
--        (borrar un usuario limpia sus asignaciones automáticamente → offboarding prolijo).
-- "Sin asignar" = sin filas para ese profile_id (ya no una fila con assigned_to NULL).

DELETE FROM public.cloudphone_assignments WHERE assigned_to IS NULL;

ALTER TABLE public.cloudphone_assignments DROP CONSTRAINT IF EXISTS cloudphone_assignments_pkey;
ALTER TABLE public.cloudphone_assignments DROP CONSTRAINT IF EXISTS cloudphone_assignments_assigned_to_fkey;

ALTER TABLE public.cloudphone_assignments ALTER COLUMN assigned_to SET NOT NULL;

ALTER TABLE public.cloudphone_assignments
  ADD CONSTRAINT cloudphone_assignments_pkey PRIMARY KEY (profile_id, assigned_to);

ALTER TABLE public.cloudphone_assignments
  ADD CONSTRAINT cloudphone_assignments_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE CASCADE;

-- RLS sin cambios: la policy "Users see own cloudphone assignment" (assigned_to = auth.uid())
-- ya funciona por-fila con múltiples asignados; admin mantiene acceso total.
