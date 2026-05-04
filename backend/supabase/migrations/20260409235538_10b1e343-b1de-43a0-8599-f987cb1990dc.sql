-- Project links table
CREATE TABLE public.project_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.task_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can manage links"
  ON public.project_links FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = project_links.project_id AND pm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = project_links.project_id AND pm.user_id = auth.uid()
  ));

CREATE INDEX idx_project_links_project ON public.project_links(project_id);

-- Project documentation table
CREATE TABLE public.project_documentation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.task_projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_documentation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can manage documentation"
  ON public.project_documentation FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = project_documentation.project_id AND pm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = project_documentation.project_id AND pm.user_id = auth.uid()
  ));

CREATE INDEX idx_project_documentation_project ON public.project_documentation(project_id);

-- Only one documentation per project
ALTER TABLE public.project_documentation ADD CONSTRAINT unique_project_documentation UNIQUE (project_id);