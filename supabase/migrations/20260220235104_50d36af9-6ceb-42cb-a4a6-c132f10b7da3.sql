
-- Create work_schedules table
CREATE TABLE public.work_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  schedule_type text NOT NULL DEFAULT 'manana',
  start_date date NOT NULL,
  end_date date NOT NULL,
  start_time time WITHOUT TIME ZONE,
  end_time time WITHOUT TIME ZONE,
  department_id uuid REFERENCES public.departments(id),
  description text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage work_schedules"
  ON public.work_schedules FOR ALL
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_work_schedules_updated_at
  BEFORE UPDATE ON public.work_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create hour_bank table
CREATE TABLE public.hour_bank (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  hours numeric NOT NULL,
  movement_type text NOT NULL DEFAULT 'deposit',
  reason text,
  reference_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.hour_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage hour_bank"
  ON public.hour_bank FOR ALL
  USING (true) WITH CHECK (true);
