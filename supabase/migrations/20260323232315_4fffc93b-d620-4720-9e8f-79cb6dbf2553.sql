CREATE POLICY "Users see own created closer_creators"
ON public.closer_creators FOR SELECT
TO authenticated
USING (created_by = auth.uid());