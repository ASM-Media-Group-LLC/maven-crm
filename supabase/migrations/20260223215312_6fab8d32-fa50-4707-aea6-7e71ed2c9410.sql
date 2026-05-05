
-- task_assignees: multiple assignees per task
CREATE TABLE public.task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(task_id, user_id)
);
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage task_assignees" ON public.task_assignees FOR ALL USING (true) WITH CHECK (true);

-- subtask_assignees: multiple assignees per subtask
CREATE TABLE public.subtask_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subtask_id uuid NOT NULL REFERENCES public.subtasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(subtask_id, user_id)
);
ALTER TABLE public.subtask_assignees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage subtask_assignees" ON public.subtask_assignees FOR ALL USING (true) WITH CHECK (true);
