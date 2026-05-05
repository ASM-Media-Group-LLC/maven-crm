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

-- 2. Update has_role() function to cast app_role param to text for comparison.
--    The function signature stays (uuid, app_role) so existing RLS policies
--    that call has_role(auth.uid(), 'admin'::app_role) keep working.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role::text
  )
$$;

-- 3. Also create a text overload so new code can call has_role(uid, 'spammer')
--    without needing to cast to app_role.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
