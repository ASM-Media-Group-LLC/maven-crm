
-- Create project_folders table
CREATE TABLE public.project_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_folders ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated users
CREATE POLICY "Authenticated users can read folders"
  ON public.project_folders FOR SELECT
  TO authenticated
  USING (true);

-- Insert: any authenticated user
CREATE POLICY "Authenticated users can create folders"
  ON public.project_folders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Update: creator or admin
CREATE POLICY "Creator or admin can update folders"
  ON public.project_folders FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Delete: creator or admin
CREATE POLICY "Creator or admin can delete folders"
  ON public.project_folders FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Add folder_id to task_projects
ALTER TABLE public.task_projects ADD COLUMN folder_id uuid REFERENCES public.project_folders(id) ON DELETE SET NULL;
