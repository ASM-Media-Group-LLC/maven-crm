CREATE TABLE public.task_blockers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  blocked_by_user_id UUID REFERENCES auth.users(id),
  reported_by UUID NOT NULL REFERENCES auth.users(id),
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_blockers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can manage blockers"
  ON public.task_blockers FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tasks t
    JOIN project_members pm ON pm.project_id = t.project_id
    WHERE t.id = task_blockers.task_id AND pm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM tasks t
    JOIN project_members pm ON pm.project_id = t.project_id
    WHERE t.id = task_blockers.task_id AND pm.user_id = auth.uid()
  ));

CREATE INDEX idx_task_blockers_task_id ON public.task_blockers(task_id);
CREATE INDEX idx_task_blockers_active ON public.task_blockers(task_id) WHERE resolved = false;