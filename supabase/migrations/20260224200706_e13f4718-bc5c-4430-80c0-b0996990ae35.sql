
-- Create creator_prospects table
CREATE TABLE public.creator_prospects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  instagram text,
  tiktok text,
  platform text,
  category text,
  agency text,
  country text,
  email text,
  phone text,
  source text,
  status text NOT NULL DEFAULT 'lead',
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.creator_prospects ENABLE ROW LEVEL SECURITY;

-- RLS policy: authenticated users have full access
CREATE POLICY "Authenticated users can manage creator_prospects"
  ON public.creator_prospects
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_creator_prospects_updated_at
  BEFORE UPDATE ON public.creator_prospects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
