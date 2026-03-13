-- Fix RLS: Add admin bypass to tasks policies
DROP POLICY IF EXISTS "Users can view own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON public.tasks;

CREATE POLICY "Users can view own tasks" ON public.tasks
FOR SELECT USING (
  has_role(auth.uid(), 'admin')
  OR auth.uid() = assigned_to
  OR auth.uid() = created_by
  OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = tasks.id AND user_id = auth.uid())
  OR is_project_member(auth.uid(), project_id)
);

CREATE POLICY "Users can update own tasks" ON public.tasks
FOR UPDATE USING (
  has_role(auth.uid(), 'admin')
  OR auth.uid() = assigned_to
  OR auth.uid() = created_by
  OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = tasks.id AND user_id = auth.uid())
  OR is_project_member(auth.uid(), project_id)
);

CREATE POLICY "Users can delete own tasks" ON public.tasks
FOR DELETE USING (
  has_role(auth.uid(), 'admin')
  OR auth.uid() = assigned_to
  OR auth.uid() = created_by
  OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = tasks.id AND user_id = auth.uid())
  OR is_project_member(auth.uid(), project_id)
);

-- Fix RLS: Add admin bypass to subtasks policies
DROP POLICY IF EXISTS "Users can view subtasks of their tasks" ON public.subtasks;
DROP POLICY IF EXISTS "Users can create subtasks on their tasks" ON public.subtasks;
DROP POLICY IF EXISTS "Users can update subtasks of their tasks" ON public.subtasks;
DROP POLICY IF EXISTS "Users can delete subtasks of their tasks" ON public.subtasks;

CREATE POLICY "Users can view subtasks of their tasks" ON public.subtasks
FOR SELECT USING (
  has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM tasks WHERE tasks.id = subtasks.task_id AND (
    tasks.assigned_to = auth.uid() OR tasks.created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = tasks.id AND user_id = auth.uid())
    OR is_project_member(auth.uid(), tasks.project_id)
  ))
);

CREATE POLICY "Users can create subtasks on their tasks" ON public.subtasks
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM tasks WHERE tasks.id = subtasks.task_id AND (
    tasks.assigned_to = auth.uid() OR tasks.created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = tasks.id AND user_id = auth.uid())
    OR is_project_member(auth.uid(), tasks.project_id)
  ))
);

CREATE POLICY "Users can update subtasks of their tasks" ON public.subtasks
FOR UPDATE USING (
  has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM tasks WHERE tasks.id = subtasks.task_id AND (
    tasks.assigned_to = auth.uid() OR tasks.created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = tasks.id AND user_id = auth.uid())
    OR is_project_member(auth.uid(), tasks.project_id)
  ))
);

CREATE POLICY "Users can delete subtasks of their tasks" ON public.subtasks
FOR DELETE USING (
  has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM tasks WHERE tasks.id = subtasks.task_id AND (
    tasks.assigned_to = auth.uid() OR tasks.created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = tasks.id AND user_id = auth.uid())
    OR is_project_member(auth.uid(), tasks.project_id)
  ))
);