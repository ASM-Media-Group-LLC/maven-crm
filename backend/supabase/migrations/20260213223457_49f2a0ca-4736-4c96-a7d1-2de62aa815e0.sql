
CREATE TABLE public.deals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_handle TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'LeadGen',
  stage TEXT NOT NULL DEFAULT 'Nuevo',
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
  company_id UUID REFERENCES public.companies(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view deals" ON public.deals
  FOR SELECT USING (true);

CREATE POLICY "Users can insert deals" ON public.deals
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update deals" ON public.deals
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete deals" ON public.deals
  FOR DELETE USING (auth.uid() = created_by);

CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
