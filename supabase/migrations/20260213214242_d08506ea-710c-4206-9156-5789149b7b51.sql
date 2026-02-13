
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to uuid NOT NULL,
  created_by uuid NOT NULL,
  company_id uuid,
  status text NOT NULL DEFAULT 'active',
  duration_hours integer NOT NULL DEFAULT 0,
  duration_minutes integer NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  overdue_reason text,
  share_token text DEFAULT gen_random_uuid()::text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (auth.uid() = assigned_to OR auth.uid() = created_by);

CREATE POLICY "Authenticated users can create tasks"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Assigned users can update tasks"
  ON public.tasks FOR UPDATE TO authenticated
  USING (auth.uid() = assigned_to OR auth.uid() = created_by);

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_task_by_share_token(_token text)
RETURNS SETOF public.tasks
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.tasks WHERE share_token = _token LIMIT 1;
$$;
