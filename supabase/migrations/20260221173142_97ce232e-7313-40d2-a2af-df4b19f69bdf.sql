
-- Add target_role column to training_programs
ALTER TABLE public.training_programs
ADD COLUMN target_role text DEFAULT 'general';

-- Create training_modules table
CREATE TABLE public.training_modules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  training_program_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  position integer NOT NULL DEFAULT 0,
  duration_minutes integer,
  content_type text DEFAULT 'documento',
  content_url text,
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "Authenticated users can manage training_modules"
ON public.training_modules
FOR ALL
USING (true)
WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER update_training_modules_updated_at
BEFORE UPDATE ON public.training_modules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookup by program
CREATE INDEX idx_training_modules_program_id ON public.training_modules(training_program_id);
