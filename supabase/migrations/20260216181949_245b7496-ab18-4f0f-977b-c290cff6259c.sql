ALTER TABLE public.task_projects ADD COLUMN position integer NOT NULL DEFAULT 0;
ALTER TABLE public.tasks ADD COLUMN position integer NOT NULL DEFAULT 0;