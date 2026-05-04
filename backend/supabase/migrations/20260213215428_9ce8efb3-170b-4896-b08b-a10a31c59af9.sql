
CREATE TABLE public.task_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  company_id uuid,
  created_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.task_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view company projects"
  ON public.task_projects FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ) OR created_by = auth.uid());

CREATE POLICY "Authenticated users can create projects"
  ON public.task_projects FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can update projects"
  ON public.task_projects FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

CREATE TRIGGER update_task_projects_updated_at
  BEFORE UPDATE ON public.task_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tasks ADD COLUMN project_id uuid REFERENCES public.task_projects(id);
