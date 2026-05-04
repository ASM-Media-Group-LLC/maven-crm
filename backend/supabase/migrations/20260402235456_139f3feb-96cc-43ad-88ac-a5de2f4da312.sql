
-- Table to back up original of_gross_earnings values before audit corrections
CREATE TABLE public.sales_audit_corrections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_log_id UUID REFERENCES public.sales_audit_log(id) ON DELETE SET NULL,
  of_earnings_id UUID NOT NULL,
  creator_name TEXT NOT NULL,
  earnings_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  field_name TEXT NOT NULL DEFAULT 'total_earnings_gross',
  original_value NUMERIC NOT NULL DEFAULT 0,
  new_value NUMERIC NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'excel',
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  applied_by UUID,
  reverted_at TIMESTAMP WITH TIME ZONE,
  reverted_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_audit_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view corrections"
  ON public.sales_audit_corrections FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert corrections"
  ON public.sales_audit_corrections FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update corrections"
  ON public.sales_audit_corrections FOR UPDATE TO authenticated USING (true);

-- Add status to sales_audit_log to track if corrections were applied
ALTER TABLE public.sales_audit_log ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- Index for fast lookups
CREATE INDEX idx_corrections_of_earnings_id ON public.sales_audit_corrections(of_earnings_id);
CREATE INDEX idx_corrections_audit_log_id ON public.sales_audit_corrections(audit_log_id);
CREATE INDEX idx_audit_log_status ON public.sales_audit_log(status);
