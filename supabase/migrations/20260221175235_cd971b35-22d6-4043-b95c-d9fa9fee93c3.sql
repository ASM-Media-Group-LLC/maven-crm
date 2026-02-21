
-- Create training_module_progress table for granular tracking
CREATE TABLE public.training_module_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES public.employee_training_assignments(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  score numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, module_id)
);

-- Enable RLS
ALTER TABLE public.training_module_progress ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "Authenticated users can manage training_module_progress"
  ON public.training_module_progress FOR ALL
  USING (true) WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_training_module_progress_assignment ON public.training_module_progress(assignment_id);

-- Updated_at trigger
CREATE TRIGGER update_training_module_progress_updated_at
  BEFORE UPDATE ON public.training_module_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
