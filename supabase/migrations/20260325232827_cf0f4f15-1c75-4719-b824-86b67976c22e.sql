INSERT INTO storage.buckets (id, name, public)
VALUES ('absence-documents', 'absence-documents', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload absence documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'absence-documents');

CREATE POLICY "Anyone can view absence documents"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'absence-documents');