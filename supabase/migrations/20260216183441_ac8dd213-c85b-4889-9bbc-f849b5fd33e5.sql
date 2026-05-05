
-- Add new columns to subtasks for nesting, assignment, priority, and due date
ALTER TABLE public.subtasks ADD COLUMN parent_subtask_id uuid REFERENCES public.subtasks(id) ON DELETE CASCADE;
ALTER TABLE public.subtasks ADD COLUMN assigned_to uuid;
ALTER TABLE public.subtasks ADD COLUMN priority text NOT NULL DEFAULT 'medium';
ALTER TABLE public.subtasks ADD COLUMN due_at timestamptz;

-- Create project_members table
CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.task_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- Enable RLS on project_members
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view members of projects they belong to or created
CREATE POLICY "Users can view project members"
ON public.project_members
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.task_projects tp
    WHERE tp.id = project_members.project_id
    AND (tp.created_by = auth.uid() OR public.user_has_tasks_in_project(auth.uid(), tp.id))
  )
  OR user_id = auth.uid()
);

-- RLS: Project creators can insert members
CREATE POLICY "Project creators can add members"
ON public.project_members
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.task_projects tp
    WHERE tp.id = project_members.project_id
    AND tp.created_by = auth.uid()
  )
);

-- RLS: Project creators can update members
CREATE POLICY "Project creators can update members"
ON public.project_members
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.task_projects tp
    WHERE tp.id = project_members.project_id
    AND tp.created_by = auth.uid()
  )
);

-- RLS: Project creators can delete members
CREATE POLICY "Project creators can delete members"
ON public.project_members
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.task_projects tp
    WHERE tp.id = project_members.project_id
    AND tp.created_by = auth.uid()
  )
);

-- Update task_projects SELECT policy to also include project_members
DROP POLICY IF EXISTS "Users can view relevant projects" ON public.task_projects;
CREATE POLICY "Users can view relevant projects"
ON public.task_projects
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR public.user_has_tasks_in_project(auth.uid(), id)
  OR EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = id AND pm.user_id = auth.uid()
  )
);
