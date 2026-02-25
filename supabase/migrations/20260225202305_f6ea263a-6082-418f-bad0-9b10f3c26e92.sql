
DROP POLICY IF EXISTS "Creators can update projects" ON task_projects;
CREATE POLICY "Project members and creators can update projects"
  ON task_projects FOR UPDATE
  USING (
    auth.uid() = created_by
    OR is_project_member(auth.uid(), id)
  );
