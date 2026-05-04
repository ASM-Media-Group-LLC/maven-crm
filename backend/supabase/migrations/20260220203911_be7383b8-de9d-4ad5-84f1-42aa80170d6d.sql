
-- Create attendance table for HR module
CREATE TABLE public.attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift       text NOT NULL DEFAULT 'turno_manana',
  shift_start time,
  shift_end   time,
  check_in    timestamptz,
  check_out   timestamptz,
  date        date NOT NULL DEFAULT CURRENT_DATE,
  status      text NOT NULL DEFAULT 'presente',
  notes       text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to manage attendance
CREATE POLICY "Authenticated users can manage attendance"
  ON public.attendance
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER update_attendance_updated_at
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
