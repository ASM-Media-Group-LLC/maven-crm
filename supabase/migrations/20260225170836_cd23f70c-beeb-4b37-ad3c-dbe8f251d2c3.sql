
-- 1. Update function to also check task_assignees junction table
CREATE OR REPLACE FUNCTION public.user_has_tasks_in_project(_user_id uuid, _project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE project_id = _project_id
    AND (assigned_to = _user_id OR created_by = _user_id)
  ) OR EXISTS (
    SELECT 1 FROM public.task_assignees ta
    JOIN public.tasks t ON ta.task_id = t.id
    WHERE t.project_id = _project_id AND ta.user_id = _user_id
  )
$$;

-- 2. Drop existing RLS policies on tasks
DROP POLICY IF EXISTS "Users can view own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON public.tasks;

-- 3. Recreate with task_assignees check
CREATE POLICY "Users can view own tasks" ON public.tasks
  FOR SELECT USING (
    auth.uid() = assigned_to
    OR auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM public.task_assignees
      WHERE task_id = id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own tasks" ON public.tasks
  FOR UPDATE USING (
    auth.uid() = assigned_to
    OR auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM public.task_assignees
      WHERE task_id = id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own tasks" ON public.tasks
  FOR DELETE USING (
    auth.uid() = assigned_to
    OR auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM public.task_assignees
      WHERE task_id = id AND user_id = auth.uid()
    )
  );
