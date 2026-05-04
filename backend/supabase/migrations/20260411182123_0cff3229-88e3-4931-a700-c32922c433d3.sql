
-- Fix task_blockers RLS: add admin bypass
DROP POLICY IF EXISTS "Project members can manage blockers" ON task_blockers;

CREATE POLICY "Project members can manage blockers" ON task_blockers
FOR ALL USING (
  has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN project_members pm ON pm.project_id = t.project_id
    WHERE t.id = task_blockers.task_id AND pm.user_id = auth.uid()
  )
) WITH CHECK (
  has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN project_members pm ON pm.project_id = t.project_id
    WHERE t.id = task_blockers.task_id AND pm.user_id = auth.uid()
  )
);

-- Fix task_comments RLS: add admin bypass
DROP POLICY IF EXISTS "Members can view task comments" ON task_comments;
CREATE POLICY "Members can view task comments" ON task_comments
FOR SELECT USING (
  has_role(auth.uid(), 'admin') OR
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_comments.task_id AND is_project_member(auth.uid(), t.project_id))
);

DROP POLICY IF EXISTS "Members can create task comments" ON task_comments;
CREATE POLICY "Members can create task comments" ON task_comments
FOR INSERT WITH CHECK (
  auth.uid() = user_id AND (
    has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_comments.task_id AND is_project_member(auth.uid(), t.project_id))
  )
);
