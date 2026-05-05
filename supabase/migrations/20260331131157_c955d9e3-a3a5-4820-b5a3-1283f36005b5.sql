
-- SuperContacts table
CREATE TABLE public.super_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_handle TEXT NOT NULL,
  full_name TEXT,
  profile_photo_url TEXT,
  followers_count INTEGER,
  bio TEXT,
  category TEXT,
  country TEXT,
  city TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'nuevo',
  enriched BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX super_contacts_handle_unique ON public.super_contacts (lower(instagram_handle));

ALTER TABLE public.super_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view super_contacts"
  ON public.super_contacts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert super_contacts"
  ON public.super_contacts FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update super_contacts"
  ON public.super_contacts FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Admins can delete super_contacts"
  ON public.super_contacts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- SuperContact interactions table
CREATE TABLE public.super_contact_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.super_contacts(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.super_contact_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view interactions"
  ON public.super_contact_interactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert interactions"
  ON public.super_contact_interactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

-- Updated_at trigger for super_contacts
CREATE TRIGGER update_super_contacts_updated_at
  BEFORE UPDATE ON public.super_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
