
CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view task comments"
ON public.task_comments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_comments.task_id
    AND public.is_project_member(auth.uid(), t.project_id)
  )
);

CREATE POLICY "Members can create task comments"
ON public.task_comments FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_comments.task_id
    AND public.is_project_member(auth.uid(), t.project_id)
  )
);

CREATE POLICY "Users can delete own comments"
ON public.task_comments FOR DELETE TO authenticated
USING (auth.uid() = user_id);
