
-- hubstaff_members
CREATE TABLE public.hubstaff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hubstaff_user_id text,
  hubstaff_org_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id)
);
ALTER TABLE public.hubstaff_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view hubstaff_members" ON public.hubstaff_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage hubstaff_members" ON public.hubstaff_members FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- hubstaff_activities
CREATE TABLE public.hubstaff_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.hubstaff_members(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  tracked_seconds int NOT NULL DEFAULT 0,
  mouse_events int DEFAULT 0,
  keyboard_events int DEFAULT 0,
  overall_activity int DEFAULT 0,
  mouse_activity int DEFAULT 0,
  keyboard_activity int DEFAULT 0,
  project_name text,
  task_name text
);
CREATE INDEX idx_hubstaff_activities_member_starts ON public.hubstaff_activities(member_id, starts_at DESC);
ALTER TABLE public.hubstaff_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view hubstaff_activities" ON public.hubstaff_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage hubstaff_activities" ON public.hubstaff_activities FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- hubstaff_screenshots
CREATE TABLE public.hubstaff_screenshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.hubstaff_members(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL,
  screenshot_url text NOT NULL,
  activity_percent int DEFAULT 0
);
CREATE INDEX idx_hubstaff_screenshots_member_captured ON public.hubstaff_screenshots(member_id, captured_at DESC);
ALTER TABLE public.hubstaff_screenshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view hubstaff_screenshots" ON public.hubstaff_screenshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage hubstaff_screenshots" ON public.hubstaff_screenshots FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- hubstaff_config (singleton)
CREATE TABLE public.hubstaff_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_token_set boolean NOT NULL DEFAULT false,
  org_id text,
  sync_enabled boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  sync_interval_minutes int NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hubstaff_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view hubstaff_config" ON public.hubstaff_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage hubstaff_config" ON public.hubstaff_config FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default config row
INSERT INTO public.hubstaff_config (api_token_set, sync_enabled) VALUES (false, false);
