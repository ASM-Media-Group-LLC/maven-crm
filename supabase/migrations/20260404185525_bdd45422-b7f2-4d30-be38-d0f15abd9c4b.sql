-- Create task_attachments table
CREATE TABLE public.task_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size BIGINT NOT NULL DEFAULT 0,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_task_attachments_task_id ON public.task_attachments(task_id);

-- Enable RLS
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

-- RLS: Members of the project can view attachments
CREATE POLICY "Project members can view task attachments"
ON public.task_attachments FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.project_members pm ON pm.project_id = t.project_id
    WHERE t.id = task_attachments.task_id AND pm.user_id = auth.uid()
  )
);

-- RLS: Authenticated users can insert attachments for tasks in their projects
CREATE POLICY "Project members can add task attachments"
ON public.task_attachments FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = uploaded_by
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.project_members pm ON pm.project_id = t.project_id
      WHERE t.id = task_attachments.task_id AND pm.user_id = auth.uid()
    )
  )
);

-- RLS: Uploader or admin can delete
CREATE POLICY "Uploader or admin can delete task attachments"
ON public.task_attachments FOR DELETE TO authenticated
USING (
  uploaded_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);

-- Create storage bucket for task files (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-files', 'task-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Authenticated users can upload task files" ON storage.objects;
CREATE POLICY "Authenticated users can upload task files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-files');

DROP POLICY IF EXISTS "Authenticated users can read task files" ON storage.objects;
CREATE POLICY "Authenticated users can read task files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'task-files');

DROP POLICY IF EXISTS "Users can delete their own task files" ON storage.objects;
CREATE POLICY "Users can delete their own task files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-files' AND auth.uid()::text = (storage.foldername(name))[1]);