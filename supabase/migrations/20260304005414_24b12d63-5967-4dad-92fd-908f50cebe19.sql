
-- =========================================================
-- Notifications v2 – enrich schema + preferences + RLS + realtime
-- =========================================================

-- 1) Add new columns to notifications
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS module_origin text,
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS deep_link_url text,
  ADD COLUMN IF NOT EXISTS required_permission_module text,
  ADD COLUMN IF NOT EXISTS required_permission_submodule text,
  ADD COLUMN IF NOT EXISTS visibility_scope text DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS role_target text;

-- Add check constraints via validation trigger (not CHECK to be safe with restores)
CREATE OR REPLACE FUNCTION public.validate_notification_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.priority IS NOT NULL AND NEW.priority NOT IN ('high', 'medium', 'low') THEN
    RAISE EXCEPTION 'Invalid priority: %', NEW.priority;
  END IF;
  IF NEW.status IS NOT NULL AND NEW.status NOT IN ('new', 'read', 'archived') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  IF NEW.visibility_scope IS NOT NULL AND NEW.visibility_scope NOT IN ('personal', 'team', 'global') THEN
    RAISE EXCEPTION 'Invalid visibility_scope: %', NEW.visibility_scope;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_notification_fields
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_notification_fields();

-- 2) Migrate is_read → status
UPDATE public.notifications SET status = CASE WHEN is_read THEN 'read' ELSE 'new' END;

-- 3) Indexes for performant queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_status ON public.notifications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_module ON public.notifications(module_origin);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.notifications(priority);

-- 4) Create notification_preferences table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  module text NOT NULL,
  notification_type text NOT NULL,
  channel_in_app boolean DEFAULT true,
  channel_email boolean DEFAULT false,
  is_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, module, notification_type)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification preferences"
  ON public.notification_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5) Helper function to check if user has a specific role (for RLS)
CREATE OR REPLACE FUNCTION public.user_has_role_name(_user_id uuid, _role_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = _role_name
  )
$$;

-- 6) Drop existing RLS policies on notifications and recreate
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

-- SELECT: user sees own notifications OR notifications targeted to their role
CREATE POLICY "Users can view own or role-targeted notifications"
  ON public.notifications FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      user_id IS NULL
      AND role_target IS NOT NULL
      AND public.user_has_role_name(auth.uid(), role_target)
    )
  );

-- INSERT: any authenticated user can create notifications (modules emit events)
CREATE POLICY "Authenticated users can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: user can update own notifications (mark read, archive)
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id OR (user_id IS NULL AND role_target IS NOT NULL AND public.user_has_role_name(auth.uid(), role_target)));

-- DELETE: user can delete own notifications
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- 7) Enable Realtime on notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
