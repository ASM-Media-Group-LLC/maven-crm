
-- Table to track multiple OnlyFans accounts per creator
CREATE TABLE public.creator_of_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  account_handle TEXT NOT NULL,
  onlyfans_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(account_handle)
);

-- Enable RLS
ALTER TABLE public.creator_of_accounts ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Authenticated users can view creator OF accounts"
  ON public.creator_of_accounts
  FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert
CREATE POLICY "Authenticated users can insert creator OF accounts"
  ON public.creator_of_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update
CREATE POLICY "Authenticated users can update creator OF accounts"
  ON public.creator_of_accounts
  FOR UPDATE
  TO authenticated
  USING (true);

-- Authenticated users can delete
CREATE POLICY "Authenticated users can delete creator OF accounts"
  ON public.creator_of_accounts
  FOR DELETE
  TO authenticated
  USING (true);

-- Index for fast lookups by creator
CREATE INDEX idx_creator_of_accounts_creator_id ON public.creator_of_accounts(creator_id);
