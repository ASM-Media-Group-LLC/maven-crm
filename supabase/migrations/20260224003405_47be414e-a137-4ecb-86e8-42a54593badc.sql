
-- Create employee_history table for tracking contractual changes, internal movements, and adjustments
CREATE TABLE public.employee_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  change_type text NOT NULL,
  field_changed text NOT NULL,
  old_value text,
  new_value text,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employee_history ENABLE ROW LEVEL SECURITY;

-- Permissive policy for authenticated users (same pattern as rest of HR module)
CREATE POLICY "Authenticated users can manage employee_history"
  ON public.employee_history
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Index for efficient lookups by employee
CREATE INDEX idx_employee_history_employee_id ON public.employee_history(employee_id);
CREATE INDEX idx_employee_history_effective_date ON public.employee_history(effective_date DESC);
