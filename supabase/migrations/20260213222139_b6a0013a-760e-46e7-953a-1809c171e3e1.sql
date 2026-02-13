
-- DELETE policy para task_projects
CREATE POLICY "Creators can delete projects"
  ON public.task_projects FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- DELETE policy para tasks
CREATE POLICY "Assigned users can delete tasks"
  ON public.tasks FOR DELETE TO authenticated
  USING (auth.uid() = assigned_to OR auth.uid() = created_by);

-- Funcion para verificar si un usuario tiene tareas en un proyecto
CREATE OR REPLACE FUNCTION public.user_has_tasks_in_project(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE project_id = _project_id
    AND (assigned_to = _user_id OR created_by = _user_id)
  )
$$;

-- Actualizar policy SELECT de task_projects para visibilidad restringida
DROP POLICY "Users can view company projects" ON public.task_projects;
CREATE POLICY "Users can view relevant projects"
  ON public.task_projects FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.user_has_tasks_in_project(auth.uid(), id)
  );
