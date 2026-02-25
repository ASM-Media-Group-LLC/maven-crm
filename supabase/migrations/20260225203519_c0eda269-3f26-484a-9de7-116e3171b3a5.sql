DROP POLICY IF EXISTS "Users can view relevant projects" ON task_projects;
CREATE POLICY "Users can view relevant projects"
  ON task_projects FOR SELECT
  USING (true);