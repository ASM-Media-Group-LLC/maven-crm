
-- Add attachment_url column
ALTER TABLE custom_content_requests ADD COLUMN attachment_url TEXT;

-- Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('custom-request-attachments', 'custom-request-attachments', true) ON CONFLICT (id) DO NOTHING;

-- RLS policies for the bucket
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'custom-request-attachments');

DROP POLICY IF EXISTS "Authenticated users can view attachments" ON storage.objects;
CREATE POLICY "Authenticated users can view attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'custom-request-attachments');

DROP POLICY IF EXISTS "Authenticated users can delete own attachments" ON storage.objects;
CREATE POLICY "Authenticated users can delete own attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'custom-request-attachments');
