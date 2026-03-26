-- Supervisors: SELECT + UPDATE on closer_creators
CREATE POLICY "Supervisors can view all closer_creators"
  ON public.closer_creators FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "Supervisors can update closer_creators"
  ON public.closer_creators FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (public.has_role(auth.uid(), 'supervisor'));

-- Managers: UPDATE on closer_creators (they already have SELECT)
CREATE POLICY "Managers can update closer_creators"
  ON public.closer_creators FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));