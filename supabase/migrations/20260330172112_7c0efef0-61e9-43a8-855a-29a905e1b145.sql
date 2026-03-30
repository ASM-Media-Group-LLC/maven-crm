-- Fix 1: Change financial/prospect policies from 'public' to 'authenticated'
DROP POLICY IF EXISTS "Authenticated users can manage commissions" ON public.commissions;
CREATE POLICY "Authenticated users can manage commissions" ON public.commissions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage creator_prospects" ON public.creator_prospects;
CREATE POLICY "Authenticated users can manage creator_prospects" ON public.creator_prospects FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage financial_config" ON public.financial_config;
CREATE POLICY "Authenticated users can manage financial_config" ON public.financial_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage financial_reports" ON public.financial_reports;
CREATE POLICY "Authenticated users can manage financial_reports" ON public.financial_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage invoices" ON public.invoices;
CREATE POLICY "Authenticated users can manage invoices" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage payroll_details" ON public.payroll_details;
CREATE POLICY "Authenticated users can manage payroll_details" ON public.payroll_details FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage payroll_periods" ON public.payroll_periods;
CREATE POLICY "Authenticated users can manage payroll_periods" ON public.payroll_periods FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fix 2: Enable RLS on leadgen_entries and add authenticated policy
ALTER TABLE public.leadgen_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can access leadgen_entries" ON public.leadgen_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);