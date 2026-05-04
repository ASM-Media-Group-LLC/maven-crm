
CREATE TABLE public.super_contact_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.super_contacts(id) ON DELETE CASCADE NOT NULL,
  brand TEXT NOT NULL,
  instagram_account TEXT,
  message_type TEXT NOT NULL DEFAULT 'dm',
  screenshot_url TEXT,
  notes TEXT,
  response TEXT,
  response_status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.super_contact_outreach ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view outreach" ON public.super_contact_outreach FOR SELECT USING (true);
CREATE POLICY "Anyone can insert outreach" ON public.super_contact_outreach FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update outreach" ON public.super_contact_outreach FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete outreach" ON public.super_contact_outreach FOR DELETE USING (true);
