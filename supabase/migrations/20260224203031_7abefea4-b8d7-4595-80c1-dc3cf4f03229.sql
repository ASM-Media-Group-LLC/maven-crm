
-- ═══════════════════════════════════════════════════════════════════
-- Módulo de Finanzas: 5 tablas
-- ═══════════════════════════════════════════════════════════════════

-- 1. Periodos de nómina
CREATE TABLE public.payroll_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_employees integer DEFAULT 0,
  gross_total numeric DEFAULT 0,
  net_total numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'borrador',
  cost_center text,
  area text,
  notes text,
  calculated_at timestamp with time zone,
  closed_at timestamp with time zone,
  paid_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage payroll_periods" ON public.payroll_periods FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_payroll_periods_updated_at BEFORE UPDATE ON public.payroll_periods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Detalle de nómina por empleado
CREATE TABLE public.payroll_details (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  base_salary numeric DEFAULT 0,
  overtime_amount numeric DEFAULT 0,
  overtime_hours numeric DEFAULT 0,
  hour_bank_hours numeric DEFAULT 0,
  hour_bank_amount numeric DEFAULT 0,
  commission_amount numeric DEFAULT 0,
  deductions_total numeric DEFAULT 0,
  gross_total numeric DEFAULT 0,
  net_total numeric DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage payroll_details" ON public.payroll_details FOR ALL USING (true) WITH CHECK (true);

-- 3. Facturas a creadores
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number text NOT NULL DEFAULT '',
  creator_id uuid REFERENCES public.creators(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  fee_amount numeric DEFAULT 0,
  fee_type text DEFAULT 'none',
  net_amount numeric DEFAULT 0,
  payment_method text,
  status text NOT NULL DEFAULT 'borrador',
  due_date date,
  paid_date date,
  notes text,
  reversal_reason text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage invoices" ON public.invoices FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-increment invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(CAST(NULLIF(invoice_number, '') AS integer)), 0) + 1
    INTO next_num
    FROM invoices
    WHERE invoice_number ~ '^\d+$';
  NEW.invoice_number := LPAD(next_num::text, 6, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_invoice_number BEFORE INSERT ON public.invoices FOR EACH ROW WHEN (NEW.invoice_number = '' OR NEW.invoice_number IS NULL) EXECUTE FUNCTION public.generate_invoice_number();

-- 4. Comisiones
CREATE TABLE public.commissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  creator_id uuid REFERENCES public.creators(id) ON DELETE SET NULL,
  period text NOT NULL,
  base_amount numeric DEFAULT 0,
  percentage numeric DEFAULT 0,
  estimated_amount numeric DEFAULT 0,
  final_amount numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'proyectado',
  area text,
  cost_center text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage commissions" ON public.commissions FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_commissions_updated_at BEFORE UPDATE ON public.commissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Reportes financieros
CREATE TABLE public.financial_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_type text NOT NULL,
  period_from date,
  period_to date,
  area text,
  cost_center text,
  file_url text,
  format text DEFAULT 'csv',
  generated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage financial_reports" ON public.financial_reports FOR ALL USING (true) WITH CHECK (true);
