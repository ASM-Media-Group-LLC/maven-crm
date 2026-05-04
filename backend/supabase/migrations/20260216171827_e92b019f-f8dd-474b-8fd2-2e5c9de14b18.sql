
-- Add priority column to tasks
ALTER TABLE public.tasks ADD COLUMN priority text NOT NULL DEFAULT 'medium';

-- Create subtasks table
CREATE TABLE public.subtasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending',
  position integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;

-- RLS policies: access based on parent task visibility
CREATE POLICY "Users can view subtasks of their tasks"
ON public.subtasks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks
    WHERE tasks.id = subtasks.task_id
    AND (tasks.assigned_to = auth.uid() OR tasks.created_by = auth.uid())
  )
);

CREATE POLICY "Users can create subtasks on their tasks"
ON public.subtasks FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks
    WHERE tasks.id = subtasks.task_id
    AND (tasks.assigned_to = auth.uid() OR tasks.created_by = auth.uid())
  )
);

CREATE POLICY "Users can update subtasks of their tasks"
ON public.subtasks FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tasks
    WHERE tasks.id = subtasks.task_id
    AND (tasks.assigned_to = auth.uid() OR tasks.created_by = auth.uid())
  )
);

CREATE POLICY "Users can delete subtasks of their tasks"
ON public.subtasks FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.tasks
    WHERE tasks.id = subtasks.task_id
    AND (tasks.assigned_to = auth.uid() OR tasks.created_by = auth.uid())
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_subtasks_updated_at
BEFORE UPDATE ON public.subtasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX idx_subtasks_task_id ON public.subtasks(task_id);
CREATE INDEX idx_subtasks_position ON public.subtasks(task_id, position);
