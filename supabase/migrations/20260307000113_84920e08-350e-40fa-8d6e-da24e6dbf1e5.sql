
-- =============================================
-- Phase 1: Announcements v2 - Advanced Internal Communications
-- =============================================

-- 1. Add new columns to internal_announcements
ALTER TABLE public.internal_announcements
  ADD COLUMN IF NOT EXISTS content_html text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS delivery_channels text[] NOT NULL DEFAULT '{feed}',
  ADD COLUMN IF NOT EXISTS related_module text,
  ADD COLUMN IF NOT EXISTS recurrence_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;

-- Backfill existing rows: set status based on is_active, starts_at, expires_at
UPDATE public.internal_announcements SET status = 
  CASE
    WHEN is_active = false THEN 'draft'
    WHEN expires_at IS NOT NULL AND expires_at < now() THEN 'expired'
    WHEN starts_at > now() THEN 'scheduled'
    ELSE 'active'
  END;

-- 2. Create announcement_audience table
CREATE TABLE IF NOT EXISTS public.announcement_audience (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.internal_announcements(id) ON DELETE CASCADE,
  target_type text NOT NULL, -- 'all', 'department', 'role', 'user', 'project'
  target_id text,
  target_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create announcement_views table
CREATE TABLE IF NOT EXISTS public.announcement_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.internal_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  UNIQUE(announcement_id, user_id)
);

-- 4. Create storage bucket for announcement files
INSERT INTO storage.buckets (id, name, public)
VALUES ('announcement-files', 'announcement-files', true)
ON CONFLICT (id) DO NOTHING;

-- 5. RLS on announcement_audience
ALTER TABLE public.announcement_audience ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read announcement_audience"
  ON public.announcement_audience FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert announcement_audience"
  ON public.announcement_audience FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update announcement_audience"
  ON public.announcement_audience FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete announcement_audience"
  ON public.announcement_audience FOR DELETE TO authenticated
  USING (true);

-- 6. RLS on announcement_views
ALTER TABLE public.announcement_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read announcement_views"
  ON public.announcement_views FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own views"
  ON public.announcement_views FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own views"
  ON public.announcement_views FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- 7. Storage RLS for announcement-files
DROP POLICY IF EXISTS "Authenticated users can upload announcement files" ON storage.objects;
CREATE POLICY "Authenticated users can upload announcement files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'announcement-files');

DROP POLICY IF EXISTS "Anyone can read announcement files" ON storage.objects;
CREATE POLICY "Anyone can read announcement files"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'announcement-files');

DROP POLICY IF EXISTS "Authenticated users can delete announcement files" ON storage.objects;
CREATE POLICY "Authenticated users can delete announcement files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'announcement-files');

-- 8. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_announcement_audience_announcement_id 
  ON public.announcement_audience(announcement_id);

CREATE INDEX IF NOT EXISTS idx_announcement_views_announcement_id 
  ON public.announcement_views(announcement_id);

CREATE INDEX IF NOT EXISTS idx_announcement_views_user_id 
  ON public.announcement_views(user_id);

CREATE INDEX IF NOT EXISTS idx_internal_announcements_status 
  ON public.internal_announcements(status);
