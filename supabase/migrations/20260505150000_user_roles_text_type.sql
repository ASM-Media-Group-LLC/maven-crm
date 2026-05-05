-- ============================================================================
-- Convert user_roles.role from enum to text
-- ============================================================================
-- The app_role enum prevents new roles created via the UI from being assigned
-- to users (INSERT fails because the value isn't in the enum). Converting to
-- text makes the system fully dynamic: any role added to roles_config can be
-- assigned immediately without a migration.

-- 1. Convert the column from enum to text
ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE text USING role::text;

-- 2. Add a CHECK constraint that validates against roles_config at write time
--    (optional — the Edge Function already validates, but belt-and-suspenders)
-- Note: we intentionally do NOT add a CHECK here because it would require a
-- subquery which Postgres doesn't support in CHECK constraints. Validation
-- happens in the manage-user-roles Edge Function.
