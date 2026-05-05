ALTER TABLE public.creator_business 
ADD COLUMN IF NOT EXISTS commission_type text DEFAULT 'fixed',
ADD COLUMN IF NOT EXISTS commission_tiers jsonb DEFAULT '[]'::jsonb;