DROP POLICY IF EXISTS "Managers and admins can insert creators" ON creators;
CREATE POLICY "Authorized roles can insert creators" ON creators
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'manager'::app_role) OR
    public.has_role(auth.uid(), 'closer'::app_role) OR
    public.has_role(auth.uid(), 'supervisor'::app_role)
  );