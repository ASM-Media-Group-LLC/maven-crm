
-- Create campaigns table for promolog
CREATE TABLE public.promolog_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES public.creators(id),
  month_year DATE NOT NULL, -- first day of the month
  goal_monthly INTEGER NOT NULL DEFAULT 0,
  goal_weekly INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'activa',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.promolog_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to promolog_campaigns"
ON public.promolog_campaigns
FOR ALL
USING (true)
WITH CHECK (true);
