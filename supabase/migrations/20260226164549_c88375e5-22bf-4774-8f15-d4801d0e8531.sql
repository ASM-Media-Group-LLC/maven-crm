-- Allow all authenticated users to read profiles (for chat user discovery)
CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);