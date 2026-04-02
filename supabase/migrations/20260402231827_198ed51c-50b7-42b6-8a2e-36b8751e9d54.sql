
CREATE TABLE public.sales_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  creator_name TEXT NOT NULL,
  source_selected TEXT NOT NULL CHECK (source_selected IN ('excel', 'system')),
  excel_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  system_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  difference NUMERIC(12,2) NOT NULL DEFAULT 0,
  excel_entries INTEGER NOT NULL DEFAULT 0,
  system_entries INTEGER NOT NULL DEFAULT 0,
  file_name TEXT,
  period_start DATE,
  period_end DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view audit logs"
  ON public.sales_audit_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert audit logs"
  ON public.sales_audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE INDEX idx_sales_audit_log_period ON public.sales_audit_log (period_start, period_end);
CREATE INDEX idx_sales_audit_log_creator ON public.sales_audit_log (creator_name);
