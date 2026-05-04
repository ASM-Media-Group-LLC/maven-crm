
-- Add commission_type, calculation_method, calculation_config to commissions
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS commission_type text NOT NULL DEFAULT 'laboral';
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS calculation_method text NOT NULL DEFAULT 'fixed_percentage';
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS calculation_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Add responsible_id to payroll_periods
ALTER TABLE public.payroll_periods ADD COLUMN IF NOT EXISTS responsible_id uuid;
