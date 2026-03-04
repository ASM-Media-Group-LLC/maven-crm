
-- =============================================
-- FIX 1: Enable RLS on creators table
-- =============================================
ALTER TABLE creators ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read creators
CREATE POLICY "Authenticated users can view creators"
ON creators FOR SELECT
TO authenticated
USING (true);

-- Managers and admins can update creators
CREATE POLICY "Managers and admins can update creators"
ON creators FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
);

-- Managers and admins can insert creators
CREATE POLICY "Managers and admins can insert creators"
ON creators FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'manager')
);

-- Only admins can delete creators
CREATE POLICY "Admins can delete creators"
ON creators FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
);

-- =============================================
-- FIX 2: Replace permissive event policies
-- =============================================
DROP POLICY IF EXISTS "Allow all access to events" ON events;
DROP POLICY IF EXISTS "Allow all access to event_guests" ON event_guests;
DROP POLICY IF EXISTS "Allow all access to event_attendance_log" ON event_attendance_log;
DROP POLICY IF EXISTS "Allow all access to event_checklist_items" ON event_checklist_items;

-- Events: authenticated staff can manage
CREATE POLICY "Authenticated staff can manage events"
ON events FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Guests: authenticated staff can manage
CREATE POLICY "Authenticated staff can manage guests"
ON event_guests FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Attendance log: authenticated can read, system can insert
CREATE POLICY "Staff can view attendance logs"
ON event_attendance_log FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Staff can insert attendance logs"
ON event_attendance_log FOR INSERT
TO authenticated
WITH CHECK (true);

-- Checklist: authenticated staff can manage
CREATE POLICY "Staff can manage checklist items"
ON event_checklist_items FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- =============================================
-- FIX 3: Secure creator-files storage bucket
-- =============================================
UPDATE storage.buckets SET public = false WHERE id = 'creator-files';

DROP POLICY IF EXISTS "Allow public read on creator-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads on creator-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow deletes on creator-files" ON storage.objects;

-- Authenticated users can read creator files
CREATE POLICY "Authenticated users can read creator-files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'creator-files');

-- Authenticated users can upload creator files
CREATE POLICY "Authenticated users can upload creator-files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'creator-files');

-- Authenticated users can update creator files
CREATE POLICY "Authenticated users can update creator-files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'creator-files');

-- Admins can delete creator files
CREATE POLICY "Admins can delete creator-files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'creator-files'
  AND public.has_role(auth.uid(), 'admin')
);
