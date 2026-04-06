
-- RPC function to get distinct promolog agent IDs efficiently
CREATE OR REPLACE FUNCTION public.get_distinct_promolog_agents()
RETURNS TABLE(agent_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT reviewed_by AS agent_id FROM promolog_entries WHERE reviewed_by IS NOT NULL
  UNION
  SELECT DISTINCT created_by AS agent_id FROM promolog_entries WHERE created_by IS NOT NULL
$$;

-- Add evidence_url column to invoices table
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS evidence_url text;
