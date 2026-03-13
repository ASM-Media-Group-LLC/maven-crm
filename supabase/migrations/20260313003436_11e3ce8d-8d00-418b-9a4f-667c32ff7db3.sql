CREATE POLICY "Authenticated users can insert closer_creators"
  ON public.closer_creators FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());