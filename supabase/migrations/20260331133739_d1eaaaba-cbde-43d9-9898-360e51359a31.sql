-- Allow anonymous access to super_contacts
CREATE POLICY "Anon can view super_contacts"
  ON public.super_contacts FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert super_contacts"
  ON public.super_contacts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update super_contacts"
  ON public.super_contacts FOR UPDATE TO anon USING (true);

-- Allow anonymous access to super_contact_interactions
CREATE POLICY "Anon can view super_contact_interactions"
  ON public.super_contact_interactions FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert super_contact_interactions"
  ON public.super_contact_interactions FOR INSERT TO anon WITH CHECK (true);