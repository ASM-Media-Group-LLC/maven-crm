DROP POLICY IF EXISTS "Project creators and members can manage membership" ON project_members;
DROP POLICY IF EXISTS "Project members can view other members" ON project_members;

CREATE POLICY "Authenticated users can manage project_members"
  ON project_members FOR ALL
  USING (true)
  WITH CHECK (true);