
-- ============================================================
-- TASKS: Drop old duplicate policies and recreate with project member check
-- ============================================================

-- Drop all existing SELECT/UPDATE/DELETE policies on tasks
DROP POLICY IF EXISTS "Users can view own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Assigned users can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Assigned users can delete tasks" ON public.tasks;

-- SELECT: assigned_to, created_by, task_assignees, or project member
CREATE POLICY "Users can view own tasks" ON public.tasks
FOR SELECT USING (
  auth.uid() = assigned_to
  OR auth.uid() = created_by
  OR EXISTS (SELECT 1 FROM task_assignees WHERE task_assignees.task_id = tasks.id AND task_assignees.user_id = auth.uid())
  OR is_project_member(auth.uid(), project_id)
);

-- UPDATE
CREATE POLICY "Users can update own tasks" ON public.tasks
FOR UPDATE USING (
  auth.uid() = assigned_to
  OR auth.uid() = created_by
  OR EXISTS (SELECT 1 FROM task_assignees WHERE task_assignees.task_id = tasks.id AND task_assignees.user_id = auth.uid())
  OR is_project_member(auth.uid(), project_id)
);

-- DELETE
CREATE POLICY "Users can delete own tasks" ON public.tasks
FOR DELETE USING (
  auth.uid() = assigned_to
  OR auth.uid() = created_by
  OR EXISTS (SELECT 1 FROM task_assignees WHERE task_assignees.task_id = tasks.id AND task_assignees.user_id = auth.uid())
  OR is_project_member(auth.uid(), project_id)
);

-- ============================================================
-- SUBTASKS: Recreate all 4 policies with project member + task_assignees
-- ============================================================

DROP POLICY IF EXISTS "Users can view subtasks of their tasks" ON public.subtasks;
DROP POLICY IF EXISTS "Users can create subtasks on their tasks" ON public.subtasks;
DROP POLICY IF EXISTS "Users can update subtasks of their tasks" ON public.subtasks;
DROP POLICY IF EXISTS "Users can delete subtasks of their tasks" ON public.subtasks;

CREATE POLICY "Users can view subtasks of their tasks" ON public.subtasks
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.tasks
    WHERE tasks.id = subtasks.task_id
    AND (
      tasks.assigned_to = auth.uid()
      OR tasks.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM task_assignees WHERE task_assignees.task_id = tasks.id AND task_assignees.user_id = auth.uid())
      OR is_project_member(auth.uid(), tasks.project_id)
    )
  )
);

CREATE POLICY "Users can create subtasks on their tasks" ON public.subtasks
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks
    WHERE tasks.id = subtasks.task_id
    AND (
      tasks.assigned_to = auth.uid()
      OR tasks.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM task_assignees WHERE task_assignees.task_id = tasks.id AND task_assignees.user_id = auth.uid())
      OR is_project_member(auth.uid(), tasks.project_id)
    )
  )
);

CREATE POLICY "Users can update subtasks of their tasks" ON public.subtasks
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.tasks
    WHERE tasks.id = subtasks.task_id
    AND (
      tasks.assigned_to = auth.uid()
      OR tasks.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM task_assignees WHERE task_assignees.task_id = tasks.id AND task_assignees.user_id = auth.uid())
      OR is_project_member(auth.uid(), tasks.project_id)
    )
  )
);

CREATE POLICY "Users can delete subtasks of their tasks" ON public.subtasks
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.tasks
    WHERE tasks.id = subtasks.task_id
    AND (
      tasks.assigned_to = auth.uid()
      OR tasks.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM task_assignees WHERE task_assignees.task_id = tasks.id AND task_assignees.user_id = auth.uid())
      OR is_project_member(auth.uid(), tasks.project_id)
    )
  )
);
