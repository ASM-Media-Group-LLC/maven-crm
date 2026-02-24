
-- Add company_id to employees for multi-company support
ALTER TABLE public.employees ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_employees_company_id ON public.employees(company_id);
