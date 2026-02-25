
-- Create financial_config table
CREATE TABLE public.financial_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key text NOT NULL UNIQUE,
  config_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  category text NOT NULL DEFAULT 'general',
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financial_config ENABLE ROW LEVEL SECURITY;

-- Permissive RLS for authenticated users
CREATE POLICY "Authenticated users can manage financial_config"
  ON public.financial_config
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_financial_config_updated_at
  BEFORE UPDATE ON public.financial_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed data
INSERT INTO public.financial_config (config_key, config_value, category, description) VALUES
(
  'quickbooks_templates',
  '{"mappings": []}'::jsonb,
  'integrations',
  'Mapeos de categorías a cuentas de QuickBooks'
),
(
  'payment_methods',
  '{"methods": [{"name": "PayPal", "commission_pct": 5.4, "active": true}, {"name": "PagoMundo", "commission_pct": 2.5, "active": true}, {"name": "Transferencia Bancaria", "commission_pct": 0, "active": true}]}'::jsonb,
  'payments',
  'Métodos de pago disponibles y sus comisiones'
),
(
  'cost_centers',
  '{"centers": [{"name": "Operaciones", "code": "OPS", "monthly_budget": 0}, {"name": "Ventas", "code": "VTA", "monthly_budget": 0}, {"name": "Administración", "code": "ADM", "monthly_budget": 0}]}'::jsonb,
  'accounting',
  'Centros de costo para nómina y gastos'
),
(
  'commission_defaults',
  '{"creator_pct": 50, "partner_pct": 20, "exceptions": []}'::jsonb,
  'commissions',
  'Porcentajes de comisión por defecto'
),
(
  'payroll_params',
  '{"deductions": {"health_pct": 4, "pension_pct": 4, "tax_pct": 0}, "overtime_multipliers": {"daytime": 1.25, "nighttime": 1.75, "holiday": 2.0}, "hour_bank": {"validity_months": 6, "hour_value": 15}}'::jsonb,
  'payroll',
  'Parámetros de cálculo de nómina'
);
