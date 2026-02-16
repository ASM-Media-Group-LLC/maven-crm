
-- 1. Create SECURITY DEFINER functions to break recursion

CREATE OR REPLACE FUNCTION public.is_project_member(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE user_id = _user_id AND project_id = _project_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_project_creator(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_projects
    WHERE id = _project_id AND created_by = _user_id
  )
$$;

-- 2. Replace task_projects SELECT policy (fix bug pm.project_id = pm.id)
DROP POLICY IF EXISTS "Users can view relevant projects" ON task_projects;
CREATE POLICY "Users can view relevant projects"
ON task_projects FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR user_has_tasks_in_project(auth.uid(), id)
  OR is_project_member(auth.uid(), id)
);

-- 3. Replace project_members policies
DROP POLICY IF EXISTS "Users can view project members" ON project_members;
CREATE POLICY "Users can view project members"
ON project_members FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR is_project_creator(auth.uid(), project_id)
  OR user_has_tasks_in_project(auth.uid(), project_id)
);

DROP POLICY IF EXISTS "Project creators can add members" ON project_members;
CREATE POLICY "Project creators can add members"
ON project_members FOR INSERT TO authenticated
WITH CHECK (is_project_creator(auth.uid(), project_id));

DROP POLICY IF EXISTS "Project creators can update members" ON project_members;
CREATE POLICY "Project creators can update members"
ON project_members FOR UPDATE TO authenticated
USING (is_project_creator(auth.uid(), project_id));

DROP POLICY IF EXISTS "Project creators can delete members" ON project_members;
CREATE POLICY "Project creators can delete members"
ON project_members FOR DELETE TO authenticated
USING (is_project_creator(auth.uid(), project_id));

-- 4. Secure functions
REVOKE EXECUTE ON FUNCTION public.is_project_member FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_project_member TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_project_creator FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_project_creator TO authenticated;
