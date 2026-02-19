
INSERT INTO storage.buckets (id, name, public) VALUES ('creator-files', 'creator-files', true);

CREATE POLICY "Allow public read on creator-files" ON storage.objects FOR SELECT USING (bucket_id = 'creator-files');
CREATE POLICY "Allow uploads on creator-files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'creator-files');
CREATE POLICY "Allow deletes on creator-files" ON storage.objects FOR DELETE USING (bucket_id = 'creator-files');
