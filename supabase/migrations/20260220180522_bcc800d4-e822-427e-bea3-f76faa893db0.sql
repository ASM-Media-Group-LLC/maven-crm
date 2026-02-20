
-- ============================================================
-- HR MODULE v2.0 — Core Tables
-- ============================================================

-- 1. DEPARTMENTS
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  parent_department_id uuid REFERENCES public.departments(id),
  head_employee_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage departments" ON public.departments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. POSITIONS
CREATE TABLE public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  department_id uuid REFERENCES public.departments(id),
  description text,
  min_salary numeric(12,2),
  max_salary numeric(12,2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage positions" ON public.positions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. EMPLOYEES (central table)
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text UNIQUE,
  profile_id uuid REFERENCES public.profiles(id),

  -- Personal info
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  mobile text,
  birth_date date,
  gender text,
  nationality text,
  national_id text,
  national_id_type text DEFAULT 'CC',
  address text,
  city text,
  country text DEFAULT 'Colombia',
  profile_photo_url text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,

  -- Work info
  department_id uuid REFERENCES public.departments(id),
  position_id uuid REFERENCES public.positions(id),
  hire_date date,
  termination_date date,
  contract_type text DEFAULT 'indefinido',
  work_modality text DEFAULT 'presencial',
  status text NOT NULL DEFAULT 'activo',
  reports_to uuid REFERENCES public.employees(id),

  -- Salary
  base_salary numeric(12,2),
  salary_frequency text DEFAULT 'mensual',
  bank_name text,
  bank_account_number text,
  bank_account_type text DEFAULT 'ahorros',

  -- Social security (Colombia)
  eps text,
  arl text,
  afp text,
  caja_compensacion text,

  -- Notes
  notes text,
  internal_notes text,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage employees" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Auto-generate employee code trigger
CREATE OR REPLACE FUNCTION public.generate_employee_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dept_code text := 'EMP';
  next_num integer;
BEGIN
  IF NEW.department_id IS NOT NULL THEN
    SELECT code INTO dept_code FROM departments WHERE id = NEW.department_id;
  END IF;
  SELECT COALESCE(MAX(CAST(SPLIT_PART(employee_code, '-', 2) AS integer)), 0) + 1
    INTO next_num
    FROM employees
    WHERE employee_code LIKE dept_code || '-%';
  NEW.employee_code := dept_code || '-' || LPAD(next_num::text, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_employee_code
  BEFORE INSERT ON public.employees
  FOR EACH ROW
  WHEN (NEW.employee_code IS NULL)
  EXECUTE FUNCTION public.generate_employee_code();

CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. ABSENCES
CREATE TABLE public.absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  absence_type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_days integer,
  reason text,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  document_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage absences" ON public.absences FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_absences_updated_at BEFORE UPDATE ON public.absences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. OVERTIME
CREATE TABLE public.overtime (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  overtime_type text NOT NULL DEFAULT 'diurno',
  date date NOT NULL,
  hours numeric(5,2) NOT NULL,
  rate_multiplier numeric(4,2) DEFAULT 1.25,
  amount_calculated numeric(12,2),
  notes text,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.overtime ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage overtime" ON public.overtime FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_overtime_updated_at BEFORE UPDATE ON public.overtime FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. TIME BANK
CREATE TABLE public.time_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  entry_type text NOT NULL,
  hours numeric(6,2) NOT NULL,
  date date NOT NULL,
  description text,
  reference_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.time_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage time_bank" ON public.time_bank FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.time_bank_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  total_hours_earned numeric(8,2) NOT NULL DEFAULT 0,
  total_hours_used numeric(8,2) NOT NULL DEFAULT 0,
  balance_hours numeric(8,2) GENERATED ALWAYS AS (total_hours_earned - total_hours_used) STORED,
  last_updated timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.time_bank_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage time_bank_balances" ON public.time_bank_balances FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. EMPLOYEE INCIDENTS
CREATE TABLE public.employee_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  incident_type text NOT NULL,
  severity text NOT NULL DEFAULT 'low',
  title text NOT NULL,
  description text,
  incident_date date NOT NULL,
  corrective_action text,
  status text NOT NULL DEFAULT 'open',
  resolved_at timestamptz,
  resolved_by uuid,
  document_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage employee_incidents" ON public.employee_incidents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_employee_incidents_updated_at BEFORE UPDATE ON public.employee_incidents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. EMPLOYEE DEDUCTIONS
CREATE TABLE public.employee_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  deduction_type text NOT NULL,
  description text,
  amount numeric(12,2) NOT NULL,
  month_year text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  applied_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_deductions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage employee_deductions" ON public.employee_deductions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_employee_deductions_updated_at BEFORE UPDATE ON public.employee_deductions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. PERFORMANCE EVALUATIONS
CREATE TABLE public.performance_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  evaluator_id uuid,
  period text NOT NULL,
  evaluation_date date NOT NULL,
  overall_score numeric(4,2),
  punctuality_score numeric(4,2),
  quality_score numeric(4,2),
  teamwork_score numeric(4,2),
  initiative_score numeric(4,2),
  strengths text,
  areas_for_improvement text,
  goals_next_period text,
  comments text,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.performance_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage performance_evaluations" ON public.performance_evaluations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_performance_evaluations_updated_at BEFORE UPDATE ON public.performance_evaluations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. APPLICANTS (Recruitment pipeline)
CREATE TABLE public.applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  phone text,
  position_applied text,
  department_id uuid REFERENCES public.departments(id),
  source text DEFAULT 'direct',
  status text NOT NULL DEFAULT 'applied',
  cv_url text,
  portfolio_url text,
  linkedin_url text,
  expected_salary numeric(12,2),
  availability_date date,
  interview_date timestamptz,
  interview_notes text,
  rejection_reason text,
  notes text,
  assigned_to uuid,
  converted_to_employee_id uuid REFERENCES public.employees(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage applicants" ON public.applicants FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_applicants_updated_at BEFORE UPDATE ON public.applicants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 11. EMPLOYEE ONBOARDING
CREATE TABLE public.employee_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  start_date date,
  completion_date date,
  buddy_employee_id uuid REFERENCES public.employees(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage employee_onboarding" ON public.employee_onboarding FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_employee_onboarding_updated_at BEFORE UPDATE ON public.employee_onboarding FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.employee_onboarding_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.employee_onboarding(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text,
  status text NOT NULL DEFAULT 'pending',
  due_date date,
  completed_at timestamptz,
  completed_by uuid,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_onboarding_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage employee_onboarding_tasks" ON public.employee_onboarding_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 12. EMPLOYEE OFFBOARDING
CREATE TABLE public.employee_offboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  termination_date date NOT NULL,
  termination_type text NOT NULL DEFAULT 'voluntary',
  termination_reason text,
  exit_interview_date date,
  exit_interview_notes text,
  equipment_returned boolean DEFAULT false,
  access_revoked boolean DEFAULT false,
  final_payment_status text DEFAULT 'pending',
  status text NOT NULL DEFAULT 'in_progress',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_offboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage employee_offboarding" ON public.employee_offboarding FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_employee_offboarding_updated_at BEFORE UPDATE ON public.employee_offboarding FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 13. EMPLOYEE DOCUMENTS
CREATE TABLE public.employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  description text,
  is_confidential boolean DEFAULT false,
  expiration_date date,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage employee_documents" ON public.employee_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 14. TRAINING PROGRAMS
CREATE TABLE public.training_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  duration_hours numeric(6,2),
  provider text,
  modality text DEFAULT 'presencial',
  is_mandatory boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.training_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage training_programs" ON public.training_programs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_training_programs_updated_at BEFORE UPDATE ON public.training_programs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.employee_training_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  training_program_id uuid NOT NULL REFERENCES public.training_programs(id),
  status text NOT NULL DEFAULT 'assigned',
  start_date date,
  completion_date date,
  score numeric(5,2),
  certificate_url text,
  notes text,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_training_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage employee_training_assignments" ON public.employee_training_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_employee_training_assignments_updated_at BEFORE UPDATE ON public.employee_training_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default departments
INSERT INTO public.departments (name, code, description) VALUES
  ('Tecnología', 'TEC', 'Desarrollo de software y sistemas'),
  ('Ventas', 'VEN', 'Gestión de ventas y CRM'),
  ('Marketing', 'MKT', 'Marketing y comunicaciones'),
  ('Recursos Humanos', 'RRH', 'Gestión del talento humano'),
  ('Finanzas', 'FIN', 'Contabilidad y finanzas'),
  ('Operaciones', 'OPE', 'Operaciones y logística'),
  ('Dirección', 'DIR', 'Alta dirección y gerencia')
ON CONFLICT DO NOTHING;
