DROP POLICY IF EXISTS "Project members and creators can update projects" ON task_projects;
CREATE POLICY "Authenticated users can update projects"
  ON task_projects FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "Creators can delete projects" ON task_projects;
CREATE POLICY "Authenticated users can delete projects"
  ON task_projects FOR DELETE
  USING (true);