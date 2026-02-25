CREATE TABLE employee_offboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offboarding_id UUID NOT NULL REFERENCES employee_offboarding(id) ON DELETE CASCADE,
  category TEXT,
  title TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_by UUID,
  completed_at TIMESTAMPTZ,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE employee_offboarding_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage employee_offboarding_tasks"
  ON employee_offboarding_tasks FOR ALL USING (true) WITH CHECK (true);